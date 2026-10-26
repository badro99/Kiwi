/* Kiwi · restaurant menu workspace. Preview layout, production data only. */
(function () {
  'use strict';
  let tab=(()=>{try{return sessionStorage.getItem('kiwiMenuTab')||'menu';}catch(_){return 'menu';}})(), filter='all', subFilter=null, query='', hoursPeriod=null, openItemMenu=null, nutriFilter='all'; // subFilter : sous-catégorie active ('__none' = non classés)
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=(s)=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // 16 → "16 MAD", 14.5 → "14,50 MAD" (never "14,5"), as on the till.
  const cash=(n)=>{const v=+n||0,o={minimumFractionDigits:Number.isInteger(v)?0:2,maximumFractionDigits:2};return (window.KiwiNumber?.format(v,o) ?? new Intl.NumberFormat(document.documentElement?.lang==='en'?'en-GB':'fr-FR',o).format(v))+' MAD';};
  const venue=()=>window.KiwiVenue?.getCurrentVenueData?.()?.id||window.KiwiVenue?.getVenue?.()||null;
  const isRestaurant=()=>{const KV=window.KiwiVenue,v=KV?.getCurrentVenueData?.()||{},t=String(KV?.getVenueType?.()||v.type||v.subtype||'').toLowerCase();return ['restaurant','cafe','café','restauration'].includes(t);};
  const S=()=>window.KiwiMenuStore;
  // An older or example document can miss a list; the page must still open.
  const D=()=>{const d=S()?.data(venue())||{};for(const k of ['cats','items','stations','opts'])if(!Array.isArray(d[k]))d[k]=[];return d;};
  const find=(key,id)=>(D()[key]||[]).find(x=>x.id===id);
  const cat=(id)=>find('cats',id), item=(id)=>find('items',id), station=(id)=>find('stations',id), group=(id)=>find('opts',id);
  const {UI_I18N} = window.KiwiMenuWorkspaceParts.strings();
  const lang=()=>{
    try{
      return (window.KiwiI18n?.getLang?.())||(window.KiwiMenuI18n?.lang?.())||(typeof localStorage!=='undefined'?localStorage.getItem('kiwiLang'):'')||'fr';
    }catch(_){return 'fr';}
  };
  function ui(key, params) {
    const l = lang();
    /* "1 tickets", "0 remboursements": a count takes the singular key
       (`key1`) when one exists. French counts 0 and 1 as singular. */
    if (params && typeof params.n === 'number' && (l === 'fr' ? Math.abs(params.n) < 2 : params.n === 1)) {
      const one = (UI_I18N[l] && UI_I18N[l][key + '1']) || (l === 'fr' && UI_I18N.fr[key + '1']);
      if (one) key = key + '1';
    }
    let text = (UI_I18N[l] && UI_I18N[l][key]) || (UI_I18N.fr && UI_I18N.fr[key]) || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return text;
  }
  const t=(str)=>window.KiwiMenuI18n?window.KiwiMenuI18n.t(str,lang()):str;
  const icons={caisse:'calculate',menu:'menu',languages:'translate',station:'skillet',book:'menu_book',leaf:'eco',chart:'bar_chart',clock:'schedule',alert:'warning',tag:'sell',promo:'percent',plus:'add',edit:'edit',trash:'delete',archive:'archive',restore:'settings_backup_restore',more:'more_vert'};
  const catalogText=(key,fr)=>window.KiwiCatalogUI?.text(key,fr)||fr;
  const catalogLabel=(key,fr)=>window.KiwiCatalogUI?.label(key,fr)||esc(fr);
  const catalogIcon=(name)=>`<img class="catalog-icon" draggable="false" src="assets/icons/material/${name}.svg" alt="" aria-hidden="true"/>`;
  const ic=(n)=>`<i data-icon="${icons[n]||icons.menu}" style="width:14px;height:14px" aria-hidden="true"></i>`;
  const pickerSearchIcon='<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/></svg>';
  const pickerChevronIcon='<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M480-360 280-560l56-56 144 144 144-144 56 56-200 200Z"/></svg>';
  const toast=(t,d,type='success')=>window.Kiwi?.toast?.(t,{desc:d||'',type});
  const TAB_ICONS={menu:'restaurant',i18n:'translate',stations:'soup_kitchen',recipes:'menu_book',nutrition:'eco',performance:'bar_chart',hours:'schedule',alerts:'warning',nfc:'nfc',caisse:'point_of_sale',promos:'sell'};
  /* The open tab is the page's own state, never the DOM's: a re-render, a
     store notification or a poller tick repaints the same tab (#0149). It also
     survives leaving the page and a reload within the session. */
  function setTab(k){tab=k;try{sessionStorage.setItem('kiwiMenuTab',k);}catch(_){}}
  function tabList(){
    return [['menu',ui('tabMenu')],['i18n',ui('tabI18n')],['stations',ui('tabStations')],['recipes',ui('tabRecipes')],['nutrition',ui('tabNutrition')]].concat(promosOn()?[['promos',ui('tabPromos')]]:[]).concat([['alerts',ui('tabAlerts')],['nfc',ui('tabNfc')]]).concat(caisseOn()?[['caisse',ui('tabCaisse')]]:[]);
  }
  /* #0149 · Nine tabs do not fit a phone. A sideways strip hides most of them
     and moves under the thumb, so on a phone one button names the open tab
     and lists every tab on tap. Wider screens keep the strip. */
  function tabPicker(){
    const n=D().items.filter(x=>x.avail===false).length,cur=tabList().find(([id])=>id===tab)||tabList()[0];
    return `<button type="button" class="rmw-tabpick" data-action="rmw-tab-pick" aria-haspopup="dialog">${catalogIcon(TAB_ICONS[cur[0]])}<span class="rmw-tabpick-label">${esc(cur[1])}</span>${n&&cur[0]!=='alerts'?`<span class="mi-tab-badge" aria-label="${esc(ui('tabAlerts'))}">${n}</span>`:''}${catalogIcon('expand_more')}</button>`;
  }
  function openTabPicker(){
    const n=D().items.filter(x=>x.avail===false).length;
    const rows=tabList().map(([id,l])=>`<button type="button" class="rmw-tabpick-row${tab===id?' on':''}" data-pick="${id}"${tab===id?' aria-current="page"':''}>${catalogIcon(TAB_ICONS[id])}<span>${esc(l)}</span>${id==='alerts'&&n?`<span class="mi-tab-badge">${n}</span>`:''}${tab===id?catalogIcon('check'):''}</button>`).join('');
    const m=modal({tag:ui("title"),body:`<div class="rmw-tabpick-list">${rows}</div>`,width:420});
    if(!m?.el)return;
    m.el.addEventListener('click',e=>{const b=e.target.closest('[data-pick]');if(!b)return;if(ANALYSIS_TABS[b.dataset.pick]){m.close();openAnalysis(b.dataset.pick);return;}setTab(b.dataset.pick);m.close();render();$('[data-menu-root]')?.scrollIntoView({block:'start'});});
  }
  function tabs(){
    const n=D().items.filter(x=>x.avail===false).length;
    return [
      ['menu', ui('tabMenu'), 'menu'],
      ['i18n', ui('tabI18n'), 'languages'],
      ['stations', ui('tabStations'), 'station'],
      ['recipes', ui('tabRecipes'), 'book'],
      ['nutrition', ui('tabNutrition'), 'leaf'],
    ].concat(promosOn()?[['promos', ui('tabPromos'), 'promo']]:[]).concat([
      ['alerts', ui('tabAlerts'), 'alert'],
      ['nfc', ui('tabNfc'), 'tag']
    ]).concat(caisseOn()?[['caisse', ui('tabCaisse'), 'caisse']]:[]).map(([id,l,i])=>`<button class="mi-pill${tab===id?' on':''}" data-action="rmw-tab" data-tab="${id}">${ic(i)}<span>${esc(l)}</span>${id==='alerts'&&n?`<span class="mi-tab-badge">${n}</span>`:''}</button>`).join('');
  }
  let readyTimer=0,readyTries=0;
  function show(forceRestaurantRoute=false){
    if(!forceRestaurantRoute&&!isRestaurant())return false;
    window.Kiwi?.pageShell?.('menu');document.body.classList.add('page-menu');$$('.sidebar nav a').forEach(a=>a.classList.toggle('active',a.dataset.nav==='menu'));window.Kiwi?.breadcrumb?.(()=>ui('title'));
    const root=$('[data-menu-root]');if(root)root.hidden=false;
    if(!S()||!isRestaurant()){
      if(root)root.innerHTML=`<div class="mi-head"><div><div class="mi-title">${esc(ui('title'))}</div><div class="mi-sub">${esc(ui('loading'))}</div></div></div>`;
      clearTimeout(readyTimer);
      if(readyTries++>100){readyTries=0;if(!isRestaurant()&&legacyMenuHandler){legacyMenuHandler();}return true;}
      readyTimer=setTimeout(()=>{if(document.body.classList.contains('page-menu'))show(true);},50);
      return true;
    }
    clearTimeout(readyTimer);readyTries=0;render();return true;
  }
  function render(){
    if(!isRestaurant())return;
    const root=$('[data-menu-root]');if(!root)return;
    /* #0149 · a full innerHTML swap resets every pill row to scrollLeft 0, so
       tapping a tab visually "jumped back to the first tab". Keep each row
       where the thumb left it, then bring the active tab into view. */
    if(!tabList().some(([id])=>id===tab))tab='menu';
    /* A switch or a row button keeps the keyboard focus across the repaint
       its own click caused. */
    const was=document.activeElement,focusKey=was&&root.contains?.(was)&&was.dataset?.rmwCommand?`[data-rmw-command="${was.dataset.rmwCommand}"][data-arg="${String(was.dataset.arg||'').replace(/["\\]/g,'\\$&')}"]`:null;
    const pillRows = (root.querySelectorAll ? Array.from(root.querySelectorAll('.mi-pill-row')) : []);
    const scrolls = pillRows.map(r => r.scrollLeft || 0);
    const d=D(),v=window.KiwiVenue?.getCurrentVenueData?.()||{};
    root.hidden=false;
    const itemCountStr = d.items.length === 1 ? `1 ${ui('article')}` : `${d.items.length} ${ui('articles')}`;
    const catCountStr = d.cats.length === 1 ? `1 ${ui('section')}` : `${d.cats.length} ${ui('sections')}`;
    const html=`<div class="mi-head"><div><div class="mi-title">${esc(ui('title'))}</div><div class="mi-sub">${itemCountStr} · ${catCountStr} · ${esc(v.name||'')}</div></div><div class="mi-head-acts"><button class="btn-slim" data-action="rmw-menu-scan">${esc(ui('scanMenu'))}</button><button data-activation=write class="btn-slim" data-action="mx-import">${esc(ui('importExcel'))}</button></div></div><div class="mi-filters"><div class="mi-pill-row">${tabs()}</div>${tabPicker()}</div><div class="mi-panel" data-rmw-panel>${panel()}</div>`;
    if(window.KiwiCatalogUI)window.KiwiCatalogUI.replace(root,html);else root.innerHTML=html;
    /* Fresh nodes: the pre-swap rows captured above are detached by the
       replacement, so re-query after painting. */
    (root.querySelectorAll ? Array.from(root.querySelectorAll('.mi-pill-row')) : []).forEach((row, i) => {
      if (scrolls[i]) row.scrollLeft = scrolls[i];
      /* The selected tab stays in view with its outline, even when it lives
         past the right edge. Only scrolls rows that actually overflow. */
      if (row.scrollWidth > row.clientWidth + 1) {
        const on = row.querySelector('.mi-pill.on');
        if (on) { try { on.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (_) {} }
      }
    });
    if(focusKey&&document.activeElement!==root.querySelector(focusKey))root.querySelector(focusKey)?.focus({preventScroll:true});
    stickyTop(root);
    if(tab==='nfc')window.KiwiOrderProPanel?.mount?.($('[data-rmw-nfc]',root));
    if(tab==='caisse')window.KiwiFoodTradeSettings?.mount?.($('[data-rmw-caisse]',root));
    if(tab==='promos')window.KiwiMenuPromosPanel?.mount?.($('[data-rmw-promos]',root));
  }
  /* The bar holding search and "New item" sticks under the dashboard's own
     sticky header, whatever height the skin gives it. */
  function stickyTop(root){
    const tb=document.querySelector?.('#kw-main > .topbar')||document.querySelector?.('.topbar');let top=0;
    if(tb&&typeof getComputedStyle==='function'&&tb.getBoundingClientRect){const cs=getComputedStyle(tb);if((cs.position==='sticky'||cs.position==='fixed')&&cs.display!=='none')top=Math.max(0,Math.round(tb.getBoundingClientRect().height));}
    root.style?.setProperty?.('--rmw-top',top+'px');
  }
  function panel(){return ({i18n:i18nPanel,stations:stationsPanel,recipes:recipesPanel,nutrition:nutritionPanel,alerts:alertsPanel,nfc:nfcPanel,caisse:caissePanel,promos:promosPanel}[tab]||menuPanel)();}
  /* Performance et Heures de pointe vivent désormais dans « Analyse du menu »
     (finance.js) : Menu & modificateurs garde la configuration de la carte.
     Les panneaux restent ici, inchangés, et la page d'analyse les rend par
     KiwiRestaurantMenuWorkspace.analysis. Un lien vers l'ancien onglet y mène. */
  const ANALYSIS_TABS={performance:1,hours:1};
  function openAnalysis(k){
    if(window.KiwiFinance?.open){window.KiwiFinance.open(k);return true;}
    return false;
  }
  function analysisActive(){return !!(window.KiwiFinance?.isActive?.());}
  function shownItems(){const q=query.trim().toLowerCase();return D().items.filter(x=>(filter==='all'||x.catId===filter)&&(filter==='all'||!subFilter||(subFilter==='__none'?!x.subId:x.subId===subFilter))&&(!q||`${t(x.name)} ${x.name} ${x.desc||''}`.toLowerCase().includes(q)));}
  const subsOf=(cid)=>cat(cid)?.sub||[];
  function subChips(){
    if(filter==='all')return '';
    const subs=subsOf(filter),all=D().items.filter(x=>x.catId===filter);
    const none=all.filter(x=>!x.subId).length;
    const chip=(id,l,on)=>`<button class="mi-subchip${on?' on':''}" data-action="rmw-sub-filter" data-sub="${id}">${l}</button>`;
    let h=chip('',ui('allWithCount', { n: all.length }),!subFilter)+subs.map(s=>chip(s.id,`${esc(t(s.name))} · ${all.filter(x=>x.subId===s.id).length}`,subFilter===s.id)).join('');
    if(subs.length&&none)h+=chip('__none',ui('uncategorizedWithCount', { n: none }),subFilter==='__none');
    h+=`<button data-activation=write class="mi-subchip add" data-action="rmw-sub-add" data-arg="${filter}">${esc(ui('addSubCat'))}</button>`;
    if(subs.length&&none)h+=`<button class="mi-subchip add" data-action="rmw-classify" data-arg="${filter}">${ic('edit')} ${esc(ui('classifyCount', { n: none, s: none > 1 ? 's' : '' }))}</button>`;
    if(subFilter&&subFilter!=='__none'&&subs.some(s=>s.id===subFilter)){
      h+=`<button class="mi-subchip add" data-action="rmw-sub-rename" data-arg="${filter}::${subFilter}">${ic('edit')} ${esc(ui('rename'))}</button><button data-activation=write class="mi-subchip add danger" data-action="rmw-sub-delete" data-arg="${filter}::${subFilter}">${ic('trash')} ${esc(ui('delete'))}</button>`;
    }
    return `<div class="mi-subchips">${h}</div>`;
  }
  const countLabel=(n)=>`${n} ${n>1?ui('articles'):ui('article')}`;
  /* Menu shell (2026-10-19, #0114 #0149 #0150 #0151). Sections sit on a rail
     beside the dishes (a pill row under 900 px, lensed by liquid-lens.js through
     .mi-pill-row). A dish is one row that answers what a service asks of it:
     its price, whether it can be sold right now (the switch is the 86), and how
     many option groups the till will ask for. Search and "New item" ride a bar
     that stays on screen while the list scrolls. The editors behind a row
     (openItem, openGroup, the actions sheet) are the ones of 12 October. */
  const MSVG={add:'M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z',tune:'M440-120v-240h80v80h320v80H520v80h-80Zm-320-80v-80h240v80H120Zm160-160v-80H120v-80h160v-80h80v240h-80Zm160-80v-80h400v80H440Zm160-160v-240h80v80h160v80H680v80h-80Zm-480-80v-80h400v80H120Z'};
  const msvg=(n)=>`<svg class="rmw-msvg" viewBox="0 -960 960 960" aria-hidden="true"><path d="${MSVG[n]}"/></svg>`;
  function rowsHtml(list){
    const flat=()=>`<div class="rmw-rows">${list.map(row).join('')}</div>`;
    if(query.trim()||subFilter)return flat();
    /* #0151 · "All" reads as the printed menu: each section under its own
       heading, which opens that section. */
    if(filter==='all'){
      const d=D(),known=new Set(d.cats.map(c=>c.id));
      const groups=d.cats.map(c=>({id:c.id,label:t(c.name),items:list.filter(x=>x.catId===c.id)})).filter(g=>g.items.length);
      const loose=list.filter(x=>!known.has(x.catId));
      if(loose.length)groups.push({id:'',label:ui('withoutSubcat'),items:loose});
      if(groups.length<2)return flat();
      return groups.map(g=>`<div class="rmw-sec">${g.id?`<button type="button" class="rmw-sec-head" data-action="rmw-cat-filter" data-cat="${esc(g.id)}">`:'<div class="rmw-sec-head">'}<span>${esc(g.label)}</span><small>${countLabel(g.items.length)}</small>${g.id?`${catalogIcon('chevron_right')}</button>`:'</div>'}<div class="rmw-rows">${g.items.map(row).join('')}</div></div>`).join('');
    }
    const subs=subsOf(filter);
    if(!subs.length)return flat();
    const groups=subs.map(s=>({id:s.id,label:t(s.name),items:list.filter(x=>x.subId===s.id)})).filter(g=>g.items.length);
    const rest=list.filter(x=>!x.subId||!subs.some(s=>s.id===x.subId));
    if(rest.length)groups.push({id:'__none',label:ui('withoutSubcat'),items:rest,muted:true});
    if(groups.length<2)return flat();
    return groups.map(g=>`<div class="rmw-sec rmw-sec-sub"><button type="button" class="rmw-sec-head${g.muted?' muted':''}" data-action="rmw-sub-filter" data-sub="${g.id}"><span>${esc(g.label)}</span><small>${countLabel(g.items.length)}</small>${catalogIcon('chevron_right')}</button><div class="rmw-rows">${g.items.map(row).join('')}</div></div>`).join('');
  }
  function row(x){
    const name=t(x.name),off=x.avail===false,n=(x.opts||[]).length,meta=[];
    if(x.archived)meta.push(`<b class="rmw-row-state">${esc(ui('archived'))}</b>`);
    else if(off)meta.push(`<b class="rmw-row-state">${esc(ui('unavailableBadge'))}</b>`);
    if(x.desc)meta.push(esc(t(x.desc)));
    if(x.formula)meta.push(`${esc(ui('formula'))} · ${esc(ui('stepCount',{n:(x.formula.slots||[]).length}))}`);
    if(x.formulaOnly)meta.push(esc(ui('formulaOnlyBadge')));
    const nutri=nutritionCardPill(x).replace(/^ · /,'');if(nutri)meta.push(nutri);
    const thumb=x.photo?`<img class="rmw-row-thumb" src="${esc(x.photo)}" alt="" loading="lazy"/>`:'';
    const mods=esc(ui('optGroupCount',{n}));
    return `<div class="rmw-row${off?' rmw-off':''}${x.archived?' rmw-archived':''}" data-rmw-row="${esc(x.id)}">
      <button data-activation=write type="button" class="rmw-row-main" data-rmw-command="edit" data-arg="${esc(x.id)}" aria-label="${esc(ui('editItemTitle',{name}))}">${thumb}<span class="rmw-row-text"><span class="rmw-row-name">${esc(name)}</span>${meta.length?`<span class="catalog-item-meta">${meta.join(' · ')}</span>`:''}</span></button>
      <span class="rmw-row-price">${cash(x.price)}</span>
      <span class="rmw-row-mods${n?'':' none'}" title="${mods}">${msvg('tune')}<b aria-hidden="true">${n}</b><span class="rmw-sr">${mods}</span></span>
      <button type="button" class="rmw-avail" role="switch" aria-checked="${!off&&!x.archived}" data-rmw-command="avail" data-arg="${esc(x.id)}" aria-label="${esc(ui('availableToggle',{name}))}"${x.archived?' disabled':''}><span></span></button>
      <button type="button" class="catalog-more rmw-row-more" data-rmw-command="actions" data-arg="${esc(x.id)}" aria-label="${esc(catalogText('itemActions','Actions de l’article'))}: ${esc(name)}">${catalogIcon('more_vert')}</button>
    </div>`;
  }
  function openClassify(cid){
    const subs=subsOf(cid);
    if(!subs.length){toast(ui('createSubFirstToast'),ui('useAddSubHelp'),'info');return;}
    const pending=D().items.filter(x=>x.catId===cid&&!x.subId);
    if(!pending.length){toast(ui('allClassifiedToast'),ui('noUnclassifiedItems'),'info');return;}
    const opts=subs.map(s=>`<option value="${s.id}">${esc(t(s.name))}</option>`).join('');
    const helpPending = pending.length > 1 ? `${pending.length} ${ui('articlesWithoutSub')}` : `1 ${ui('articleWithoutSub')}`;
    const m=modal({tag:ui('classifyTag'),title:`${esc(ui('classifyTitle'))} · ${esc(t(cat(cid)?.name)||'')}`,width:560,body:`<div class="kf-help" style="margin-bottom:10px;">${helpPending}. ${esc(ui('classifyInstantSaveNotice'))}</div><div class="mi-classify-list" tabindex="0" role="region" aria-label="${esc(ui('classifyTitle'))}">${pending.map(x=>`<div class="mi-classify-row" data-mcr="${x.id}"><span class="mi-classify-name">${esc(t(x.name))}</span><select class="kf-input" aria-label="${esc(ui('sectionLabel'))}: ${esc(t(x.name))}" data-rmw-classify-sub="${x.id}"><option value="">· ${esc(ui('chooseSelectPlaceholder'))} ·</option>${opts}</select></div>`).join('')}</div>`,foot:`<button class="eq-cta-gradient" data-done>${esc(ui('doneBtn'))}</button>`});
    m.el.addEventListener('change',e=>{const sel=e.target.closest('[data-rmw-classify-sub]');if(!sel||!sel.value)return;S().updateItem(sel.dataset.rmwClassifySub,{subId:sel.value});sel.closest('[data-mcr]')?.classList.add('done');});
    $('[data-done]',m.el).onclick=()=>{m.close();render();};
  }
  function groupCard(g){
    const used=D().items.filter(x=>(x.opts||[]).includes(g.id)).length;
    const gName=t(g.name);
    const choicesHtml=(g.choices||[]).map(c=>`<span class="mi-group-opt-pill">${esc(c.emoji||'')} ${esc(t(c.name))}${c.price?` <span class="price">+${cash(c.price)}</span>`:''}</span>`).join('')||esc(ui('noChoices'));
    return `<div class="mi-group-card"><div class="mi-group-card-head"><span class="mi-group-card-name">${esc(gName)}</span><span class="mi-group-card-pill ${g.required?'req':'opt'}">${esc(g.required?ui('required'):ui('optional'))}</span><span class="mi-group-card-pill mode">${esc(g.kind==='many'?ui('manyChoices'):ui('oneChoice'))}</span></div><div class="mi-group-card-opts">${choicesHtml}</div><div class="mi-group-card-scope">${esc(ui('usedByCount', { n: used }))}</div><div class="mi-group-card-acts"><button data-activation=write class="btn-slim" data-action="rmw-group-edit" data-arg="${g.id}">${ic('edit')} ${esc(ui('editGroup'))}</button><button data-activation=write class="btn-slim danger" data-action="rmw-group-delete" data-arg="${g.id}">${ic('trash')} ${esc(ui('delete'))}</button></div></div>`;
  }
  function menuPanel(){
    searchStyle();shellStyle();
    if(filter!=='all'&&!cat(filter)){filter='all';subFilter=null;}
    const d=D(),list=shownItems(),selected=filter==='all'?null:cat(filter);
    const pill=(id,label,n)=>`<button class="mi-pill${filter===id?' on':''}" data-action="rmw-cat-filter" data-cat="${esc(id)}"><span class="rmw-cat-name">${esc(label)}</span><small>${n}</small></button>`;
    const rail=`<nav class="rmw-rail" aria-label="${esc(ui('sectionsTitle'))}"><div class="rmw-rail-head"><span>${esc(ui('sectionsTitle'))}</span><button type="button" class="catalog-more rmw-rail-acts" data-action="rmw-section-actions" aria-label="${esc(catalogText('sectionActions','Actions des sections'))}">${msvg('tune')}</button></div><div class="mi-pill-row rmw-cats">${pill('all',ui('all'),d.items.length)}${d.cats.map(c=>pill(c.id,t(c.name),d.items.filter(x=>x.catId===c.id).length)).join('')}</div><button data-activation=write type="button" class="rmw-rail-add" data-action="rmw-cat-add">${msvg('add')}<span>${esc(ui('newSection').replace(/^\+\s*/,''))}</span></button></nav>`;
    const searching=!!query.trim();
    const empty=(title,more='')=>`<div class="rmw-empty rmw-empty-note"><b>${esc(title)}</b>${more}</div>`;
    const body=d.items.length?(list.length?rowsHtml(list):searching?empty(ui('noItemMatch')):empty(ui('emptySectionText'),`<button data-activation=write class="btn-slim primary" data-action="rmw-item-add">${esc(ui('addFirstItemBtn'))}</button>`)):`<div class="rmw-empty" style="display:flex;flex-direction:column;align-items:center;padding:48px 20px;"><div style="width:48px;height:48px;border-radius:14px;background:rgba(11,110,79,0.10);border:1px solid rgba(11,110,79,0.18);color:var(--atlas);display:grid;place-items:center;margin-bottom:16px;"><svg width="24" height="24" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg></div><h3 style="font-family:var(--sans);font-weight:600;font-size:18px;color:var(--ink);margin:0 0 6px;letter-spacing:-0.015em;">${esc(ui('emptyMenuTitle'))}</h3><p style="font-size:13px;color:var(--n-500);margin:0 0 18px;line-height:1.55;max-width:380px;text-align:center;">${esc(ui((d.cats||[]).length?'emptyItemsDesc':'emptyMenuDesc'))}</p>${(d.cats||[]).length?`<button data-activation=write class="btn-slim primary" data-action="rmw-item-add">${esc(ui('addFirstItemBtn'))}</button>`:`<button data-activation=write class="btn-slim primary" data-action="rmw-cat-add">${esc(ui('createSectionBtn'))}</button>`}</div>`;
    const resultLabel=searching?`${list.length} / ${d.items.length}`:`${d.items.length}`;
    const searchIcon='<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"/></svg>';
    const bar=`<div class="rmw-bar"><label class="rmw-menu-search${searching?' has-query':''}"><span class="rmw-menu-search-icon">${searchIcon}</span><input type="search" value="${esc(query)}" placeholder="${esc(ui('searchPlaceholder'))}" aria-label="${esc(ui('searchPlaceholder'))}" autocomplete="off" data-rmw-search/><span class="rmw-menu-search-count" aria-live="polite"><strong>${resultLabel}</strong><small>${(searching?list.length:d.items.length)>1?catalogLabel(searching?'results':'items',searching?'résultats':'articles'):catalogLabel(searching?'result':'item',searching?'résultat':'article')}</small></span></label><button data-activation=write type="button" class="rmw-add" data-action="rmw-item-add" aria-label="${esc(ui('newItem').replace(/^\+\s*/,''))}">${msvg('add')}<span class="rmw-add-long">${esc(ui('newItem').replace(/^\+\s*/,''))}</span><span class="rmw-add-short" aria-hidden="true">${esc(ui('newItemShort'))}</span></button></div>`;
    const grouped=filter==='all'&&!searching&&!subFilter&&d.items.length&&list.length;
    const head=grouped?'':`<div class="rmw-list-head"><h3>${esc(selected?t(selected.name):ui('all'))}</h3><small>${esc(countLabel(list.length))}</small></div>`;
    return `<section class="mi-section rmw-shell"><div class="rmw-layout">${rail}<div class="rmw-main">${bar}${head}${subChips()}${body}</div></div></section><section class="mi-section"><div class="mi-section-head"><h3>${esc(ui('modAndOpts'))}</h3><button data-activation=write class="btn-slim primary" data-action="rmw-group-add">${ic('plus')} ${esc(ui('newGroupBtn').replace(/^\+\s*/,''))}</button></div><div class="mi-groups-grid">${d.opts.map(groupCard).join('')||`<div class="rmw-empty">${esc(ui('noOptGroups'))}</div>`}</div></section>`;
  }
  function stationsPanel(){
    const d=D(),kid=S().kitchenId(venue());
    const cards=d.stations.map(s=>{
      const cats=d.cats.filter(c=>(c.station||kid)===s.id);
      const catCountStr = cats.length === 1 ? `1 ${ui('section')}` : `${cats.length} ${ui('sections')}`;
      return `<div class="mi-station mi-station-card"><div class="mi-station-top"><span class="mi-st-dot on" style="background:${esc(s.color||'#1F5D3C')}"></span><span class="mi-station-name">${esc(t(s.name))}</span>${s.id===kid?`<span class="mi-group-card-pill req">${esc(ui('defaultStationFallback'))}</span>`:''}</div><div class="mi-station-routed">${catCountStr} · ${cats.map(c=>esc(t(c.name))).join(', ')}</div><div class="mi-group-card-acts"><button data-activation=write class="btn-slim" data-action="rmw-station-edit" data-arg="${s.id}">${ic('edit')} ${esc(ui('rename'))}</button>${s.id!==kid?`<button data-activation=write class="btn-slim danger" data-action="rmw-station-delete" data-arg="${s.id}">${ic('trash')} ${esc(ui('delete'))}</button>`:''}</div></div>`;
    }).join('');
    const routes=d.cats.map(c=>`<div class="rmw-route"><b>${esc(t(c.name))}</b><select aria-label="${esc(ui('stationLabel'))}: ${esc(t(c.name))}" data-rmw-route="${c.id}"><option value="">${esc(ui('defaultRoute', { name: t(station(kid)?.name)||ui('kitchen') }))}</option>${d.stations.filter(s=>s.id!==kid).map(s=>`<option value="${s.id}"${c.station===s.id?' selected':''}>${esc(t(s.name))}</option>`).join('')}</select></div>`).join('');
    return `<section class="mi-section"><div class="mi-recettes-head"><div><div class="mi-title">${esc(ui('stationsTitle'))}</div><div class="mi-sub">${esc(ui('stationsSub'))}</div></div><button data-activation=write class="btn-slim primary" data-action="rmw-station-add">${ic('plus')} ${esc(ui('addStation'))}</button></div><div class="mi-stations">${cards||`<div class="rmw-empty">${esc(ui('addFirstStation'))}</div>`}</div><div class="mi-section-head"><h3>${esc(ui('routingBySection'))}</h3></div><div class="rmw-routes">${routes||`<div class="rmw-empty">${esc(ui('createSectionsForRouting'))}</div>`}</div></section>`;
  }
  function recipeStatus(m,r){
    if(!r?.ingredients?.length)return['opt',ui('statusToComplete')];
    if(!m?.costComplete)return['opt',ui('statusCostIncomplete')];
    if(m.actualCost==null)return['req',ui('statusCosted')];
    const gap=Math.abs(m.variancePct||0);
    return gap>15?['opt',ui('statusCheckStock')]:gap>5?['opt',ui('statusToMonitor')]:['req',ui('statusCostCompliant')];
  }
  function nutritionStatus(x){
    if(!menuNutritionFeature())return['mode',ui('nutritionDisabled')];
    if(x.hideNutrition)return['mode',ui('nutritionHidden')];
    return x.nutritionComplete===true?['req',ui('nutritionComplete')]:['opt',ui('nutritionIncomplete')];
  }
  function nutritionPill(x){const [cls,label]=nutritionStatus(x);return `<span class="mi-group-card-pill rmw-nutrition-pill ${cls}">${esc(label)}</span>`;}
  /* Sur la carte, la place manque (le pied porte déjà « N groupe(s) d’options » et
     le bouton Disponible) : un point coloré + un mot, l’état complet en info-bulle ;
     quand la fiche est complète on affiche les kcal, plus utiles que le mot.
     Rien du tout si l’opérateur a coupé la nutrition pour ce commerçant. */
  function nutritionCardPill(x){if(!menuNutritionFeature())return'';const [cls,label]=nutritionStatus(x);const kcal=x.nutritionComplete===true&&x.nutrition&&Number.isFinite(+x.nutrition.kcal)?Math.round(+x.nutrition.kcal):null;const text=kcal!=null?`${kcal} kcal`:ui('nutritionShort');return ` · <span class="rmw-nutri-dot ${cls}" title="${esc(label)}"><i></i>${esc(text)}</span>`;}
  function recipesPanel(){
    const api=window.KiwiRestaurantRecipes,items=D().items,done=items.filter(x=>api?.get(x.id,x.name,venue())?.ingredients?.length).length;
    return `<section class="mi-section"><div class="mi-recettes-head"><div><div class="mi-title">${esc(ui('recipesTitle'))}</div><div class="mi-sub">${esc(ui('recipesSub'))}</div></div><div class="mi-recettes-progress"><div class="mi-recettes-progress-l">${esc(ui('recipesCompletedCount', { done, total: items.length }))}</div><div class="mi-recettes-progress-bar"><i style="width:${items.length?done/items.length*100:0}%"></i></div></div></div><div class="rmw-recipe-list">${items.map(x=>{const r=api?.get(x.id,x.name,venue()),m=r?api?.metrics(x,r,venue()):null,[cls,label]=recipeStatus(m,r);return `<div class="rmw-recipe-card"><div><div class="rmw-recipe-name">${esc(t(x.name))}</div><div class="rmw-recipe-meta">${esc(ui('ingredientCount', { n: r?.ingredients?.length||0 }))}${r?.prepMinutes?` · ${r.prepMinutes} min`:''}</div></div><div class="rmw-recipe-result"><span class="mi-group-card-pill ${cls}">${esc(label)}</span>${nutritionPill(x)}${m?.costComplete?`<small>${esc(ui('costSummaryPortion', { cost: m.theoreticalCost.toFixed(2) }))}</small>`:`<small>${esc(ui('missingCostOrQty'))}</small>`}</div><button data-activation=write class="btn-slim${r?'':' primary'}" data-action="rmw-recipe-edit" data-arg="${x.id}">${esc(r?ui('viewAndEdit'):ui('complete'))} →</button></div>`;}).join('')||`<div class="rmw-empty">${esc(ui('addItemsFirst'))}</div>`}</div></section>`;
  }
  /* Onglet Nutrition : une ligne par plat, l'état de la fiche (complète, à
     compléter, masquée), les valeurs par portion et les allergènes, le
     commutateur Visible/Masquée et le lien vers la recette. Tout est calculé
     depuis les recettes + fiches du stock ; rien n'est saisi ici. */
  function nutritionPanel(){
    const api=window.KiwiRestaurantRecipes,items=D().items,feature=menuNutritionFeature();
    const rows=items.map(x=>{const r=api?.get(x.id,x.name,venue());const res=r&&r.ingredients?.length?api.nutrition(r,x.id):null;const missing=res?[...new Set([...res.missingNutrition,...res.missingConversion,...res.missingAllergens])]:[];const state=x.hideNutrition?'hidden':(res&&res.complete?'done':'todo');return {x,r,res,missing,state};});
    const count=k=>rows.filter(o=>k==='all'||o.state===k).length,done=count('done');
    const list=rows.filter(o=>nutriFilter==='all'||o.state===nutriFilter);
    const pills=[['all',ui('nutritionFilterAll')],['todo',ui('nutritionFilterTodo')],['done',ui('nutritionFilterDone')],['hidden',ui('nutritionFilterHidden')]].map(([k,l])=>`<button class="mi-pill${nutriFilter===k?' on':''}" data-action="rmw-nutrition-filter" data-arg="${k}">${esc(l)}<span class="mi-tab-badge">${count(k)}</span></button>`).join('');
    const row=o=>{const {x,r,res,missing,state}=o;const cat=D().cats.find(c=>c.id===x.catId);let values;
      if(!r||!r.ingredients?.length)values=`<span class="rmw-nutri-muted">${esc(ui('nutritionNoRecipe'))} · ${esc(ui('nutritionNoRecipeHint'))}</span>`;
      else if(res&&res.complete)values=`<div class="rmw-nutrition-values"><bdi dir="ltr">${res.nutrition.kcal} kcal</bdi><bdi dir="ltr">P ${res.nutrition.protein} g</bdi><bdi dir="ltr">G ${res.nutrition.carbs} g</bdi><bdi dir="ltr">L ${res.nutrition.fat} g</bdi></div><div class="rmw-nutri-allergens">${res.allergens.length?res.allergens.map(k=>`<span>${esc(ui(`allergen_${k}`))}</span>`).join(''):`<span class="rmw-nutri-muted">${esc(ui('nutritionAllergens'))} : ${esc(ui('nutritionNone'))}</span>`}</div>`;
      else values=`<span class="rmw-nutri-muted">${esc(ui('nutritionMissingShort',{n:missing.length}))}</span>`;
      const stateLabel=state==='hidden'?ui('nutritionHidden'):state==='done'?ui('nutritionComplete'):ui('nutritionIncomplete');
      return `<div class="rmw-recipe-card rmw-nutri-row ${state}"><div><div class="rmw-recipe-name">${esc(t(x.name))}</div><div class="rmw-recipe-meta">${esc(cat?t(cat.name):'')}${r?.ingredients?.length?` · ${esc(ui('ingredientCount',{n:r.ingredients.length}))}`:''}</div></div><div class="rmw-nutri-values"><span class="rmw-nutri-dot ${state==='done'?'req':state==='hidden'?'mode':'opt'}"><i></i>${esc(stateLabel)}</span>${values}</div><div class="rmw-nutri-acts"><button class="mi-state-toggle" role="switch" aria-checked="${x.hideNutrition?'false':'true'}" data-action="rmw-nutrition-hide" data-arg="${x.id}" title="${esc(ui('nutritionHideHint'))}">${esc(x.hideNutrition?ui('nutritionHiddenToggle'):ui('nutritionVisibleToggle'))}</button><button data-activation=write class="btn-slim${state==='todo'?' primary':''}" data-action="rmw-recipe-edit" data-arg="${x.id}">${esc(state==='todo'?ui('complete'):ui('viewAndEdit'))} →</button></div></div>`;};
    return `<section class="mi-section"><div class="mi-recettes-head"><div><div class="mi-title">${esc(ui('nutritionTitle'))}</div><div class="mi-sub">${esc(ui('nutritionSub'))}</div></div><div class="mi-recettes-progress"><div class="mi-recettes-progress-l">${esc(ui('nutritionProgress',{done,total:items.length}))}</div><div class="mi-recettes-progress-bar"><i style="width:${items.length?done/items.length*100:0}%"></i></div></div></div>${feature?'':`<div class="rmw-nutri-notice">${esc(ui('nutritionDisabledNotice'))}</div>`}<div class="rmw-nutri-filters">${pills}</div><div class="rmw-recipe-list">${list.map(row).join('')||`<div class="rmw-empty">${esc(items.length?ui('nutritionFilterEmpty'):ui('addItemsFirst'))}</div>`}</div></section>`;
  }
  function sales(){try{return window.KiwiSales?.list?.(venue())||[];}catch(_){return[];}}
  const norm=(v)=>String(v==null?'':v).trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  /* IDs survive option labels and duplicate names (adult/kids menus). Never
   * let a Map's last duplicate silently claim another dish's sales. */
  function saleLineMatcher(rows){
    const byId=new Map(rows.map(r=>[String(r.item.id),r]));
    return line=>{
      const id=line?.itemId??line?.id??line?.i;
      if(id!=null&&byId.has(String(id)))return byId.get(String(id));
      const name=norm(line?.baseName||line?.bn||line?.name||line?.n);
      let candidates=rows.filter(r=>norm(r.item.name)===name);
      if(!candidates.length)candidates=rows.filter(r=>name.startsWith(norm(r.item.name)+' ('));
      const category=norm(line?.cat||line?.category||line?.c);
      if(category&&candidates.length>1)candidates=candidates.filter(r=>category===norm(cat(r.item.catId)?.name)||category===norm(r.item.catId));
      return candidates.length===1?candidates[0]:null;
    };
  }
  function median(values){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}
  /* ── La période analysée ──
   * « 30 derniers jours » = les 30 journées COMMERCIALES qui finissent
   * aujourd'hui, dans le fuseau et avec le seuil de journée du commerce
   * (KiwiDayReport : Africa/Casablanca, 5 h par défaut). L'ancienne fenêtre
   * glissait sur now − 30×24 h dans le fuseau du navigateur : elle coupait une
   * journée en deux et ne correspondait à aucun rapport journalier. */
  function analysisWindow(days=30){
    const DR=window.KiwiDayReport,now=Date.now();
    try{
      if(DR?.today&&DR?.dayBounds&&DR?.shiftDay){
        const last=DR.today(),first=DR.shiftDay(last,-(days-1)),from=DR.dayBounds(first).from,end=DR.dayBounds(last).to;
        if(Number.isFinite(from)&&Number.isFinite(end)&&end>from)return{from,to:Math.min(end,now+5*60e3),first,last,zone:DR.timezone?.()||'Africa/Casablanca',days,exact:true};
      }
    }catch(_){}
    return{from:now-days*864e5,to:now,first:'',last:'',zone:'',days,exact:false};
  }
  function rangeLabel(w){
    if(!w.exact)return ui('daysCount',{n:w.days});
    const fmt=(day)=>{const [y,m,d]=day.split('-').map(Number);return new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(lang()==='ar'?'ar-MA':lang()==='en'?'en-GB':'fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d)));};
    return ui('rangeLabel',{from:fmt(w.first),to:fmt(w.last)});
  }
  /* Le flux du tableau de bord ne sert l'historique qu'au rythme de ses pages
   * (curseur). Tant que la reprise n'a pas atteint sa dernière page, la liste
   * locale n'est qu'un extrait : on le dit au lieu de l'appeler « 30 jours ». */
  function feedCompleteness(){
    try{const st=window.KiwiLive?.status?.();if(!st)return 'unknown';return st.backfillComplete?'complete':'loading';}catch(_){return 'unknown';}
  }

  /* Le coût d'un plat de la carte selon sa fiche technique (coût théorique).
     Le coût observé (consommation réelle du stock) reste à part : il ne
     remplace jamais le théorique dans le profit, il s'affiche à côté. */
  function recipeCostResolver(rows){
    const match=saleLineMatcher(rows),api=window.KiwiRestaurantRecipes,cache=new Map();
    const of=(row)=>{const id=String(row.item.id);if(cache.has(id))return cache.get(id);let hit=null;try{const recipe=api?.get?.(row.item.id,row.item.name,venue());const m=recipe?api?.metrics?.(row.item,recipe,venue()):null;if(m?.costComplete&&+m.theoreticalCost>0)hit={mad:+m.theoreticalCost,src:'recipe',observed:m.actualCost==null?null:+m.actualCost};}catch(_){hit=null;}cache.set(id,hit);return hit;};
    return {match,of,line:(l)=>{const row=match(l);return row?of(row):null;}};
  }
  /* Le registre de la période : KiwiCost.ledger, le même moteur que la vue
     d'ensemble d'« Analyse du menu ». Annulations, doublons, remboursements,
     remises et TVA y suivent les mêmes règles ; aucune copie ici. */
  function menuLedger(w,rows){
    const C=window.KiwiCost;if(!C?.ledger)return null;
    rows=rows||D().items.map(x=>({item:x}));
    const R=recipeCostResolver(rows);
    let refunds=[];try{refunds=window.KiwiRefunds?.list?.(venue())||[];}catch(_){refunds=[];}
    return C.ledger(sales(),{from:w.from,to:w.to,refunds,lineCost:R.line,fallbackPrice:(l)=>R.match(l)?.item.price});
  }
  const COST_SRC={recipe:'costSrcRecipe',frozen:'costSrcFrozen',flat:'costSrcFlat',variant:'costSrcVariant'};
  function performanceData(days=30){
    const w=analysisWindow(days),items=D().items.map(x=>({item:x,qty:0,pricedQty:0,costedQty:0,revenue:0,net:0,cost:0,todayCostQty:0,srcs:{},unitCost:null,unitProfit:null,profit:null,marginPct:null,quadrant:null,costSource:null,observedCost:null}));
    const R=recipeCostResolver(items),offMenu=new Map();
    const L=menuLedger(w,items)||{grossN:0,gross:0,refundN:0,refunds:0,net:0,dupN:0,dupAmt:0,unitemisedN:0,unitemisedAmt:0,collected:0,discounts:0,lines:[],basis:{mode:'none'}};
    const ledger={grossN:L.grossN,gross:L.gross,refundN:L.refundN,refunds:L.refunds,net:L.net,itemised:L.collected,attributed:0,offMenu:0,freeAmount:0,unitemisedN:L.unitemisedN,unitemised:L.unitemisedAmt,discounts:L.discounts,dupN:L.dupN,dupAmt:L.dupAmt,todayCostQty:0,basis:L.basis,completeness:feedCompleteness()};
    L.lines.forEach(x=>{
      const line=x.line,qty=x.qty,row=R.match(line);
      if(row){
        row.qty+=qty;row.revenue+=x.collected;row.net+=x.net;ledger.attributed+=x.collected;
        if(x.collected>0){row.pricedQty+=qty;if(x.cost!=null){row.costedQty+=qty;row.cost+=x.cost;row.srcs[x.src]=(row.srcs[x.src]||0)+qty;if(!x.frozen){row.todayCostQty+=qty;ledger.todayCostQty+=qty;}}}
        return;
      }
      /* Hors de la carte actuelle : article libre, plat retiré ou renommé,
         nom ambigu sans id. Jamais jeté, jamais rattaché au hasard. */
      const id=String(line?.itemId??line?.i??line?.id??''),name=String(line?.baseName||line?.bn||line?.name||line?.n||'').trim();
      const free=id==='libre'||/^article libre$/i.test(name);
      const k=free?'libre':(id?'id:'+id:'name:'+norm(name));
      const o=offMenu.get(k)||{key:k,id,name:free?ui('freeAmountItem'):(name||ui('article')),free,qty:0,revenue:0};
      o.qty+=qty;o.revenue+=x.collected;offMenu.set(k,o);ledger.offMenu+=x.collected;if(free)ledger.freeAmount+=x.collected;
    });
    items.forEach(row=>{
      /* Un plat n'a un profit que si CHAQUE unité vendue à un prix a un coût :
         un coût partiel donnerait un profit inventé. HT quand la TVA est
         incluse dans les prix (KiwiCost.basis). */
      if(row.pricedQty>0&&row.costedQty===row.pricedQty){
        row.unitCost=row.cost/row.costedQty;
        const top=Object.entries(row.srcs).sort((a,b)=>b[1]-a[1])[0];
        row.costSource=top&&COST_SRC[top[0]]?ui(COST_SRC[top[0]]):'';
        row.unitProfit=row.net/row.pricedQty-row.unitCost;
        row.profit=row.net-row.cost;
        row.marginPct=row.net>0?row.profit/row.net*100:null;
      }
      const rc=R.of(row);if(rc){row.theoCost=rc.mad;if(rc.observed!=null)row.observedCost=rc.observed;}
    });
    const measured=items.filter(x=>x.qty>0&&x.unitProfit!=null&&Number.isFinite(x.unitProfit));
    /* Les deux seuils de l'ingénierie de menu (Kasavana et Smith, 1982), pas
       des médianes. Une médiane coupe TOUJOURS la carte en deux : une carte où
       chaque plat se vend bien rangeait quand même la moitié en « peu
       populaire ». Ici, un plat est populaire s'il fait au moins 70 % de sa part
       équitable des ventes (1/n), et rentable si sa contribution par article
       atteint la moyenne PONDÉRÉE par les ventes, celle de la carte entière.
       Les noms de champs restent medQty/medProfit pour ne rien casser. */
    const soldQty=measured.reduce((n,x)=>n+x.qty,0);
    const medQty=measured.length?0.7*soldQty/measured.length:0;
    const medProfit=soldQty?measured.reduce((n,x)=>n+x.unitProfit*x.qty,0)/soldQty:0;
    measured.forEach(x=>{const popular=x.qty>=medQty,profitable=x.unitProfit>=medProfit;x.quadrant=popular&&profitable?'star':popular?'plow':profitable?'puzzle':'dog';});
    /* `totalRevenue` = le CA des plats de la carte, seul périmètre où une
       recette peut exister. Ce n'est PAS le chiffre d'affaires du commerce :
       celui-ci est `ledger.gross` / `ledger.net`. */
    const totalRevenue=items.reduce((n,x)=>n+x.revenue,0),costedRevenue=measured.reduce((n,x)=>n+x.revenue,0),grossProfit=measured.reduce((n,x)=>n+x.profit,0);
    return {items,measured,medQty,medProfit,totalRevenue,costedRevenue,grossProfit,coverage:totalRevenue?costedRevenue/totalRevenue*100:0,days,window:w,ledger,offMenu:[...offMenu.values()].sort((a,b)=>b.revenue-a.revenue)};
  }
  function perfQuads(){
    return {
      star:{title:ui('legendStar'),hint:ui('quadStarHint'),action:ui('quadStarAction')},
      plow:{title:ui('legendPlow'),hint:ui('quadPlowHint'),action:ui('quadPlowAction')},
      puzzle:{title:ui('legendPuzzle'),hint:ui('quadPuzzleHint'),action:ui('quadPuzzleAction')},
      dog:{title:ui('legendDog'),hint:ui('quadDogHint'),action:ui('quadDogAction')},
    };
  }
  const pct1=(v)=>(window.KiwiNumber?.format(v,{minimumFractionDigits:1,maximumFractionDigits:1})??(+v).toLocaleString(lang()==='ar'?'ar-MA':lang()==='en'?'en-GB':'fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}))+' %';
  const perfNum=(v)=>window.KiwiNumber?.format(v,{})??(+v).toLocaleString(lang()==='ar'?'ar-MA':lang()==='en'?'en-GB':'fr-FR',{maximumFractionDigits:2});
  /* La matrice de la carte. Échelles linéaires (une racine écrasait tout
     contre le bord droit), marge intérieure pour qu'aucun point ne colle au
     cadre, chaque plat nommé à côté de son point quand la place le permet,
     plats superposés regroupés en un seul point numéroté. Le placement des
     noms se calcule sur une toile nominale : sur téléphone, seuls les plus
     gros chiffres d'affaires gardent leur nom, la liste des quadrants
     nomme tout le reste. */
  const MX_W=680,MX_H=340;
  function perfMatrixLayout(p){
    const pts=[...p.measured].sort((a,b)=>b.revenue-a.revenue);
    const maxQ=Math.max(...pts.map(r=>r.qty)),ups=pts.map(r=>r.unitProfit),maxP=Math.max(0,...ups),minP=Math.min(0,...ups),maxRev=Math.max(1,...pts.map(r=>r.revenue));
    const xMax=(maxQ||1)*1.1,yMin=minP<0?minP*1.2:0,yMax=(maxP>0?maxP:1)*1.18;
    const X=(v)=>4+92*(v/xMax),Y=(v)=>5+88*((v-yMin)/(yMax-yMin));
    const clusters=[];
    pts.forEach(r=>{
      const x=X(r.qty),y=Y(r.unitProfit),size=12+Math.sqrt(r.revenue/maxRev)*16,px=x/100*MX_W,py=y/100*MX_H;
      const hit=clusters.find(c=>Math.hypot(c.px-px,c.py-py)<(c.size+size)*0.3);
      if(hit){hit.members.push(r);hit.size=Math.min(34,hit.size+3);return;}
      clusters.push({x,y,px,py,size,members:[r],quadrant:r.quadrant});
    });
    const boxes=[],hits=(b)=>b.x0<0||b.y0<0||b.x1>MX_W||b.y1>MX_H||boxes.some(o=>b.x0<o.x1&&b.x1>o.x0&&b.y0<o.y1&&b.y1>o.y0)||clusters.some(c=>{const r=c.size/2;return b.x0<c.px+r&&b.x1>c.px-r&&b.y0<c.py+r&&b.y1>c.py-r;});
    clusters.forEach((c,i)=>{
      const first=t(c.members[0].item.name),text=c.members.length>1?`${first} +${c.members.length-1}`:first;
      const w=Math.min(150,text.length*6.3+14),h=18,r=c.size/2;
      const cand={r:{x0:c.px+r+5,x1:c.px+r+5+w,y0:c.py-h/2,y1:c.py+h/2},l:{x0:c.px-r-5-w,x1:c.px-r-5,y0:c.py-h/2,y1:c.py+h/2},t:{x0:c.px-w/2,x1:c.px+w/2,y0:c.py+r+4,y1:c.py+r+4+h},b:{x0:c.px-w/2,x1:c.px+w/2,y0:c.py-r-4-h,y1:c.py-r-4}};
      const own=clusters.filter(o=>o!==c);
      const free=(bx)=>!(bx.x0<0||bx.y0<0||bx.x1>MX_W||bx.y1>MX_H||boxes.some(o=>bx.x0<o.x1&&bx.x1>o.x0&&bx.y0<o.y1&&bx.y1>o.y0)||own.some(o=>{const rr=o.size/2;return bx.x0<o.px+rr&&bx.x1>o.px-rr&&bx.y0<o.py+rr&&bx.y1>o.py-rr;}));
      const pos=['r','l','t','b'].find(k=>free(cand[k]));
      if(pos){boxes.push(cand[pos]);c.label={text,pos,keep:i<3};}
    });
    return {clusters,vx:X(p.medQty),hy:Y(p.medProfit),zero:yMin<0?Y(0):null};
  }
  function performanceMatrix(p){
    if(p.measured.length<2)return `<section class="mi-section rmw-mx"><div class="rmw-mx-head"><div><h3>${esc(ui('mxTitle'))}</h3></div></div><div class="rmw-mx-few"><p>${esc(ui('mxTooFew'))}</p></div></section>`;
    const quads=perfQuads(),M=perfMatrixLayout(p),pc=(v)=>v.toFixed(2)+'%';
    const ZL={star:'matrixLabelStar',plow:'matrixLabelPlow',puzzle:'matrixLabelPuzzle',dog:'matrixLabelDog'},zone=(k,css)=>`<div class="rmw-mx-zone ${k}" style="${css}"><em>${esc(ui(ZL[k]))}</em></div>`;
    const zones=zone('puzzle',`left:0;top:0;width:${pc(M.vx)};height:${pc(100-M.hy)}`)+zone('star',`left:${pc(M.vx)};right:0;top:0;height:${pc(100-M.hy)}`)+zone('dog',`left:0;bottom:0;width:${pc(M.vx)};height:${pc(M.hy)}`)+zone('plow',`left:${pc(M.vx)};right:0;bottom:0;height:${pc(M.hy)}`);
    const tipRow=(r)=>`<span class="rmw-mx-tip-row"><b>${esc(t(r.item.name))}</b><small>${esc(ui('mxSoldN',{n:perfNum(r.qty)}))} · ${cash(r.revenue)} ${esc(ui('colRevenueDesc'))}</small><small>${esc(ui('mxPerUnit',{amount:cash(r.unitProfit)}))} · ${r.marginPct==null?'·':pct1(r.marginPct)} ${esc(ui('colMarginDesc'))}</small></span>`;
    const dots=M.clusters.map((c,i)=>{
      const one=c.members.length===1,r=c.members[0],q=quads[c.quadrant];
      const side=(c.x>72?' end':c.x<28?' start':'')+(c.y>62?' down':'');
      const name=one?t(r.item.name):ui('mxCluster',{n:c.members.length});
      const tip=`<span class="rmw-mx-tip" role="tooltip"><em>${esc(q.title)}</em>${one?'':`<strong>${esc(name)}</strong>`}${c.members.map(tipRow).join('')}</span>`;
      const attrs=one?` data-action="rmw-recipe-edit" data-arg="${esc(r.item.id)}"`:'';
      const dot=`<button type="button" class="rmw-mx-dot ${c.quadrant}${side}" style="left:${pc(c.x)};bottom:${pc(c.y)};--s:${c.size.toFixed(1)}px;z-index:${10+i}"${attrs} aria-label="${esc(name+' · '+q.title)}">${one?'':`<b>${c.members.length}</b>`}${tip}</button>`;
      const lab=c.label?`<span class="rmw-mx-lab ${c.label.pos}${c.label.keep?' keep':''}" style="left:${pc(c.x)};bottom:${pc(c.y)};--r:${(c.size/2).toFixed(1)}px" aria-hidden="true">${esc(c.label.text)}</span>`:'';
      return dot+lab;
    }).join('');
    const med=`<i class="rmw-mx-med v" style="left:${pc(M.vx)}"><span>${esc(ui('mxMedianQty',{n:perfNum(Math.round(p.medQty*10)/10)}))}</span></i><i class="rmw-mx-med h" style="bottom:${pc(M.hy)}"><span>${esc(ui('mxMedianProfit',{amount:cash(Math.round(p.medProfit*100)/100)}))}</span></i>${M.zero!=null?`<i class="rmw-mx-zero" style="bottom:${pc(M.zero)}"><span>0 MAD</span></i>`:''}`;
    return `<section class="mi-section rmw-mx" data-mx><div class="rmw-mx-head"><div><h3>${esc(ui('mxTitle'))}</h3><p>${esc(ui('mxSub'))}</p></div><div class="rmw-mx-key"><span><i style="width:8px;height:8px"></i><i style="width:14px;height:14px"></i>${esc(ui('mxSize'))}</span><span>${esc(ui('mxBasis',{n:p.measured.length}))}</span></div></div><div class="rmw-mx-body"><figure class="rmw-mx-chart"><figcaption class="rmw-mx-axis y">${esc(ui('mxAxisY'))}</figcaption><div class="rmw-mx-plot" dir="ltr"><div class="rmw-mx-zones">${zones}</div>${med}${dots}</div><div class="rmw-mx-axis x">${esc(ui('mxAxisX',{n:p.days}))}</div></figure>${perfQuadPanel(p,quads)}</div></section>`;
  }
  /* Les quatre quadrants, rangés comme sur la matrice : chaque plat nommé,
     cliquable vers sa recette, avec ses deux chiffres. */
  function perfQuadPanel(p,quads){
    return `<div class="rmw-mx-quads">${['puzzle','star','dog','plow'].map(k=>{
      const list=p.measured.filter(x=>x.quadrant===k).sort((a,b)=>b.profit-a.profit),total=list.reduce((n,x)=>n+x.profit,0);
      const rows=list.slice(0,4).map(x=>`<li><button data-activation=write type="button" data-action="rmw-recipe-edit" data-arg="${esc(x.item.id)}">${esc(t(x.item.name))}</button><small>${esc(ui('mxSoldN',{n:perfNum(x.qty)}))} · ${esc(ui('mxPerUnit',{amount:cash(x.unitProfit)}))}</small></li>`).join('');
      return `<article class="rmw-mx-q ${k}" data-quad="${k}"><header><i></i><b>${esc(quads[k].title)}</b><span>${list.length}</span></header><p>${esc(quads[k].hint)}</p>${list.length?`<ul>${rows}</ul>${list.length>4?`<small class="more">${esc(ui('mxMore',{n:list.length-4}))}</small>`:''}<footer><b>${esc(quads[k].action)}</b><span>${esc(ui('mxContribution',{amount:cash(total)}))}</span></footer>`:`<p class="none">${esc(ui('mxEmptyQuad'))}</p>`}</article>`;
    }).join('')}</div>`;
  }
  /* Le registre de la période, AVANT l'analyse par plat : ventes brutes,
     remboursements, net, puis la part que les recettes peuvent expliquer.
     Chaque écart entre ces chiffres est nommé ; aucun sous-ensemble n'est
     présenté comme le chiffre d'affaires du commerce. */
  function perfLedger(p){
    const L=p.ledger,share=L.gross>0?Math.round(L.attributed/L.gross*100)+' %':'·',notes=ledgerNotes(L,'ledgerLoading');
    const costed=p.measured.length,costedNet=p.measured.reduce((n,x)=>n+x.net,0),rate=costed&&costedNet>0?p.grossProfit/costedNet*100:null;
    const sold=p.items.reduce((n,x)=>n+x.qty,0),cov=p.totalRevenue?Math.max(0,Math.min(100,p.coverage)):0;
    const soldLabel=ui(sold===1?'itemSold':'itemsSold');
    return `<section class="rmw-sum" data-ledger-gross="${L.gross.toFixed(2)}" data-ledger-net="${L.net.toFixed(2)}"><div class="rmw-sum-kpis"><div><span>${esc(ui('analyzedRevenue'))}</span><b>${cash(p.totalRevenue)}</b><small>${perfNum(sold)} ${esc(soldLabel)} · ${esc(ui('menuItemsOnly'))}</small></div><div><span>${esc(ui('grossProfitCalc'))}</span><b>${costed?cash(p.grossProfit):'·'}</b><small>${esc(ui('recipesSoldAndCosted',{n:costed}))}</small></div><div><span>${esc(ui('colMargin'))}</span><b>${rate==null?'·':pct1(rate)}</b><small>${esc(ui('mxRateSub'))}</small></div><div><span>${esc(ui('costCoverage'))}</span><b>${p.totalRevenue?p.coverage.toFixed(0)+' %':'·'}</b><i class="rmw-sum-bar"><i style="width:${cov.toFixed(1)}%"></i></i><small>${esc(ui('costCoverageSub'))}</small></div></div><div class="rmw-sum-recon"><span class="rmw-sum-i"><span>${esc(ui('ledgerGross'))}</span><b>${cash(L.gross)}</b><small>${esc(ui('ledgerTickets',{n:L.grossN}))}</small></span><i aria-hidden="true">·</i><span class="rmw-sum-i"><span>${esc(ui('ledgerRefunds'))}</span><b>${L.refunds?'− '+cash(L.refunds):cash(0)}</b></span><i aria-hidden="true">=</i><span class="rmw-sum-i"><span>${esc(ui('ledgerNet'))}</span><b>${cash(L.net)}</b></span><i aria-hidden="true">·</i><span class="rmw-sum-i"><span>${esc(ui('ledgerEligible'))}</span><b>${cash(L.attributed)}</b><small>${esc(share)}</small></span></div>${notes.length?`<div class="rmw-perf-notes">${notes.join('')}</div>`:''}</section>`;
  }
  /* Les remarques du registre, communes à la Performance et aux Ventes : ce
     qui manque, ce qui est écarté, ce qui n'est pas attribué. */
  function ledgerNotes(L,loadingKey){
    const notes=[];
    if(L.completeness==='loading')notes.push(`<p class="warn">${esc(ui(loadingKey))}</p>`);
    else if(L.completeness==='unknown')notes.push(`<p class="warn">${esc(ui('ledgerUnknown'))}</p>`);
    if(L.dupN)notes.push(`<p>${esc(ui('ledgerDuplicates',{n:L.dupN,amount:cash(L.dupAmt)}))}</p>`);
    if(L.offMenu)notes.push(`<p>${esc(ui('ledgerOffMenu',{amount:cash(L.offMenu),free:cash(L.freeAmount)}))}</p>`);
    if(Math.abs(L.unitemised)>=0.01)notes.push(`<p>${esc(ui('ledgerUnitemised',{amount:cash(L.unitemised),n:L.unitemisedN}))}</p>`);
    if(L.discounts>=0.01)notes.push(`<p>${esc(ui('ledgerDiscounts',{amount:cash(L.discounts)}))}</p>`);
    if(L.basis&&L.basis.mode==='rate'&&L.basis.included)notes.push(`<p>${esc(ui('ledgerVatBasis',{rate:L.basis.rate}))}</p>`);
    if(L.todayCostQty>0)notes.push(`<p>${esc(ui('ledgerTodayCost'))}</p>`);
    if(L.refunds)notes.push(`<p>${esc(ui('ledgerRefundLines'))}</p>`);
    return notes;
  }
  /* #0150 · On a phone each table row becomes a card. The column names ride
     on the table as CSS strings so every cell stays labelled once the header
     is hidden, without touching the cells themselves. */
  function perfLabels(){
    return ['colItem','colSold','colRevenue','colUnitCost','colProfit','colMargin','colReadout'].map((k,i)=>`--l${i+1}:${JSON.stringify(ui(k))}`).join(';');
  }
  /* Coût simple (option) : l'estimation d'une fiche de coût liée au plat.
     Affichée À CÔTÉ du coût de la recette et du coût observé, jamais à leur
     place : elle n'entre dans aucune contribution ni aucun quadrant. */
  function costEstimates(){try{return window.KiwiSimpleFoodCost?.estimates?.()||null;}catch(_){return null;}}
  function estimateNote(est,r){
    const e=est&&est[String(r.item.id)];if(!e)return '';
    const known=e.complete&&e.perPortion!=null,flag=known&&e.stale?ui('estimateStale'):'';
    return `<small class="rmw-perf-est" data-estimate="${esc(r.item.id)}">${esc(ui('estimateLabel',{amount:known?cash(e.perPortion):ui('estimateIncomplete')}))}${flag?' · '+esc(flag):''}</small>`;
  }
  /* « À faire » : des constats tirés des chiffres affichés au-dessus, chacun
     avec son action. Rien n'est inventé : un plat sans coût complet ne donne
     ni écart ni quadrant, il apparaît dans « ventes sans coût ». */
  const GAP_PCT=15;
  function perfInsights(p,est){
    const out=[],names=(list)=>list.slice(0,3).map(x=>t(x.item.name)).join(', ');
    const gap=(a,b)=>(a-b)/b*100,fmtGap=(g)=>(g>0?'+':'−')+Math.abs(g).toFixed(0)+'\u00a0%';
    const uncosted=p.items.filter(x=>x.pricedQty>0&&x.unitCost==null).sort((a,b)=>b.revenue-a.revenue);
    if(uncosted.length)out.push({key:'uncosted',amount:uncosted.reduce((n,x)=>n+x.revenue,0),text:ui(uncosted.length===1?'insightUncosted1':'insightUncosted',{amount:cash(uncosted.reduce((n,x)=>n+x.revenue,0)),n:uncosted.length}),item:uncosted[0].item});
    p.items.filter(x=>x.qty>0&&x.theoCost>0&&x.observedCost!=null&&Math.abs(gap(x.observedCost,x.theoCost))>=GAP_PCT)
      .sort((a,b)=>Math.abs(gap(b.observedCost,b.theoCost))*b.qty-Math.abs(gap(a.observedCost,a.theoCost))*a.qty).slice(0,3)
      .forEach(x=>out.push({key:'observed',text:ui('insightObservedGap',{item:t(x.item.name),observed:cash(x.observedCost),theory:cash(x.theoCost),gap:fmtGap(gap(x.observedCost,x.theoCost))}),item:x.item}));
    if(est)p.items.filter(x=>x.theoCost>0&&est[String(x.item.id)]?.perPortion>0&&Math.abs(gap(est[String(x.item.id)].perPortion,x.theoCost))>=GAP_PCT).slice(0,3)
      .forEach(x=>{const e=est[String(x.item.id)];out.push({key:'estimate',text:ui('insightEstimateGap',{item:t(x.item.name),estimate:cash(e.perPortion),theory:cash(x.theoCost),gap:fmtGap(gap(e.perPortion,x.theoCost))}),item:x.item});});
    const plow=p.measured.filter(x=>x.quadrant==='plow').sort((a,b)=>b.qty-a.qty);
    if(plow.length)out.push({key:'plow',text:ui('insightPlow',{items:names(plow)}),item:plow[0].item});
    const puzzle=p.measured.filter(x=>x.quadrant==='puzzle').sort((a,b)=>b.unitProfit-a.unitProfit);
    if(puzzle.length)out.push({key:'puzzle',text:ui('insightPuzzle',{items:names(puzzle)})});
    if(est){const stale=Object.values(est).filter(e=>e.stale);if(stale.length)out.push({key:'stale',text:ui('insightStale',{items:stale.slice(0,3).map(e=>e.name).join(', ')}),sheets:true});}
    return out;
  }
  function insightsBlock(list){
    const li=list.map(x=>`<li data-insight="${x.key}"><p>${esc(x.text)}</p>${x.item?`<button data-activation=write class="rmw-perf-link" data-action="rmw-recipe-edit" data-arg="${esc(x.item.id)}">${esc(ui(x.key==='uncosted'?'completeRecipeLink':'insightOpenRecipe'))}</button>`:x.sheets?`<button class="rmw-perf-link" data-fin-tab="cost">${esc(ui('insightOpenSheet'))}</button>`:''}</li>`).join('');
    return `<section class="mi-section rmw-perf-insights"><div class="mi-section-head"><h3>${esc(ui('insightsTitle'))}</h3></div><p class="rmw-perf-insights-sub">${esc(ui('insightsSub'))}</p>${list.length?`<ul>${li}</ul>`:`<p class="rmw-perf-insights-none">${esc(ui('insightNone'))}</p>`}</section>`;
  }
  /* ═══ SOUVENT PRIS ENSEMBLE ═══════════════════════════════════════════════
     Sur les tickets de la période (le même registre KiwiCost.ledger :
     annulations, doublons et remboursements déjà écartés), les paires de plats
     de la carte qui se retrouvent sur un même ticket. Une paire n'est citée
     que si elle revient sur PAIR_MIN_TOGETHER tickets au moins ET plus souvent
     que le hasard (lift = n(A et B) × N ÷ (n(A) × n(B)) ≥ PAIR_MIN_LIFT) : deux
     plats très vendus se croisent forcément, ça ne dit rien. Les lignes à
     0 MAD (un choix dans une formule) sont ignorées : la formule les impose,
     ce n'est pas le client qui les associe. Sous PAIR_MIN_TICKETS tickets, on
     dit qu'on ne sait pas encore. */
  const PAIR_MIN_TICKETS=40,PAIR_MIN_TOGETHER=5,PAIR_MIN_LIFT=1.2,PAIR_SHOWN=5;
  function pairsData(days=30){
    const w=analysisWindow(days),rows=D().items.map(x=>({item:x})),match=saleLineMatcher(rows);
    const L=menuLedger(w,rows),byTicket=new Map();
    (L?L.lines:[]).forEach(x=>{
      if(!(x.listed>0))return;
      const row=match(x.line);if(!row)return;
      const k=x.saleId||('ts:'+x.ts);
      if(!byTicket.has(k))byTicket.set(k,new Set());
      byTicket.get(k).add(String(row.item.id));
    });
    const N=byTicket.size,nOf=new Map(),nPair=new Map(),byId=new Map(rows.map(r=>[String(r.item.id),r.item]));
    byTicket.forEach(set=>{
      const ids=[...set].sort();
      ids.forEach(id=>nOf.set(id,(nOf.get(id)||0)+1));
      for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const k=ids[i]+'\u0000'+ids[j];nPair.set(k,(nPair.get(k)||0)+1);}
    });
    const pairs=[];
    if(N>=PAIR_MIN_TICKETS)nPair.forEach((n,k)=>{
      if(n<PAIR_MIN_TOGETHER)return;
      const [a,b]=k.split('\u0000'),na=nOf.get(a),nb=nOf.get(b),lift=n*N/(na*nb);
      if(!(lift>=PAIR_MIN_LIFT))return;
      /* Le sens le plus parlant : le plat le moins vendu appelle l'autre. */
      const [from,to,nf]=na<=nb?[a,b,na]:[b,a,nb];
      pairs.push({from:byId.get(from),to:byId.get(to),together:n,share:n/nf,lift});
    });
    pairs.sort((x,y)=>y.together-x.together||y.lift-x.lift);
    return {window:w,tickets:N,enough:N>=PAIR_MIN_TICKETS,min:PAIR_MIN_TICKETS,pairs:pairs.slice(0,PAIR_SHOWN)};
  }
  function pairsBlock(){
    const q=pairsData(30),num=(v,o)=>window.KiwiNumber?.format(v,o||{})??(+v).toLocaleString(lang()==='ar'?'ar-MA':lang()==='en'?'en-GB':'fr-FR',o||{});
    const body=!q.enough?`<p class="rmw-perf-insights-none" data-pairs-few="${q.tickets}">${esc(ui('pairsFew',{n:num(q.tickets),min:num(q.min)}))}</p>`
      :!q.pairs.length?`<p class="rmw-perf-insights-none" data-pairs-none>${esc(ui('pairsNone'))}</p>`
      :`<ul>${q.pairs.map(x=>`<li data-pair="${esc(x.from.id)}|${esc(x.to.id)}"><p>${esc(ui('pairsLine',{pct:num(Math.round(x.share*100))+' %',a:'\u0001',b:'\u0002'})).replace('\u0001',`<bdi>${esc(t(x.from.name))}</bdi>`).replace('\u0002',`<bdi>${esc(t(x.to.name))}</bdi>`)}<small style="display:block;color:var(--n-500);margin-top:2px;">${esc(ui('pairsMeta',{n:num(x.together),lift:num(x.lift,{minimumFractionDigits:1,maximumFractionDigits:1})}))}</small></p></li>`).join('')}</ul>`;
    return `<section class="mi-section rmw-perf-insights" data-pairs><div class="mi-section-head"><h3>${esc(ui('pairsTitle'))}</h3></div><p class="rmw-perf-insights-sub">${esc(ui('pairsSub'))}</p>${body}</section>`;
  }
  function performancePanel(){
    const p=performanceData(30),costed=p.measured.length,est=costEstimates(),quads=perfQuads();
    const rows=[...p.items].sort((a,b)=>b.profit-a.profit||b.revenue-a.revenue).map(r=>{const itName=t(r.item.name),catName=cat(r.item.catId)?.name?t(cat(r.item.catId).name):ui('noSection');return `<tr><td><b>${esc(itName)}</b><small>${esc(catName)}</small></td><td>${(window.KiwiNumber?.format(r.qty, {}) ?? r.qty.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}))}</td><td>${cash(r.revenue)}</td><td>${r.unitCost==null?'<button data-activation=write class="rmw-perf-link" data-action="rmw-recipe-edit" data-arg="'+esc(r.item.id)+'">'+esc(ui('completeRecipeLink'))+'</button>':`${cash(r.unitCost)}<small>${esc(r.costSource)}${r.observedCost!=null?' · '+esc(ui('costObserved',{amount:cash(r.observedCost)})):''}</small>`}${estimateNote(est,r)}</td><td>${r.profit==null?'·':cash(r.profit)}</td><td>${r.marginPct==null?'·':`<span class="rmw-perf-margin ${r.marginPct>=65?'hi':r.marginPct>=50?'mid':'lo'}">${pct1(r.marginPct)}</span>`}</td><td>${r.quadrant?quads[r.quadrant].title:(r.qty?ui('marginMissing'):ui('noSaleRecorded'))}</td></tr>`;}).join('');
    const offRows=p.offMenu.map(o=>`<tr class="rmw-perf-off"><td><b>${esc(o.name)}</b><small>${esc(o.free?ui('freeAmountSection'):ui('offMenuSection'))}</small></td><td>${(window.KiwiNumber?.format(o.qty, {}) ?? o.qty.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}))}</td><td>${cash(o.revenue)}</td><td>·</td><td>·</td><td>·</td><td>${esc(o.free?ui('freeAmountReadout'):ui('offMenuReadout'))}</td></tr>`).join('');
    if(!p.items.length)return `<section class="mi-section"><div class="rmw-empty"><h3>${esc(ui('noItemsToAnalyze'))}</h3><p>${esc(ui('noItemsToAnalyzeDesc'))}</p></div></section>`;
    const emptySales=!p.items.some(x=>x.qty>0)&&!p.offMenu.length&&!p.ledger.grossN;
    const head=`<div class="rmw-perf-head"><div><h2>${esc(ui('perfTitle'))}</h2><p>${esc(ui('perfSub'))}</p></div><div class="rmw-perf-period" title="${esc(p.window.zone||'')}">${esc(rangeLabel(p.window))}</div></div>`;
    if(emptySales)return `<div class="rmw-performance">${head}<section class="mi-section"><div class="rmw-empty"><h3>${esc(ui('noSalesYet'))}</h3><p>${esc(ui('noSalesYetDesc'))}</p></div></section></div>`;
    const matrix=costed?performanceMatrix(p):`<section class="mi-section rmw-mx"><div class="rmw-empty"><h3>${esc(ui('completeRecipesForProfit'))}</h3><p>${esc(ui('completeRecipesForProfitDesc'))}</p></div></section>`;
    return `<div class="rmw-performance">${head}${perfLedger(p)}${matrix}${insightsBlock(perfInsights(p,est))}${pairsBlock()}<section class="mi-section"><div class="mi-section-head"><h3>${esc(ui('perfDetail'))}</h3></div><div class="mi-list-wrap" tabindex="0" role="region" aria-label="${esc(ui('perfDetail'))}"><table class="mi-list rmw-perf-table" style="${esc(perfLabels())}"><thead><tr><th>${esc(ui('colItem'))}</th><th>${esc(ui('colSold'))}</th><th>${esc(ui('colRevenue'))}</th><th>${esc(ui('colUnitCost'))}</th><th>${esc(ui('colProfit'))}</th><th>${esc(ui('colMargin'))}</th><th>${esc(ui('colReadout'))}</th></tr></thead><tbody>${rows}${offRows}</tbody></table></div></section></div>`;
  }
  /* ═══ VENTES PAR CATÉGORIE ET PAR ARTICLE ═══════════════════════════════
     Le même registre que la Performance (KiwiCost.ledger) : annulations,
     doublons, remboursements, remises et TVA y suivent les mêmes règles. Ici
     on ne parle que d'argent encaissé, jamais de coût. Six périodes, toutes en
     journées commerciales (coupure 5 h, fuseau du commerce) : « Ce mois-ci »
     part du 1er à 5 h, « Mois dernier » est le mois civil précédent entier. */
  const SALES_PRESETS=['today','yesterday','d7','d30','month','lastMonth'];
  const SALES_LABEL={today:'salesPresetToday',yesterday:'salesPresetYesterday',d7:'salesPreset7',d30:'salesPreset30',month:'salesPresetMonth',lastMonth:'salesPresetLastMonth'};
  let salesPeriod='d30';
  try{const saved=localStorage.getItem('kiwiMenuSalesPeriod');if(SALES_PRESETS.includes(saved))salesPeriod=saved;}catch(_){}
  function salesWindow(id){
    const DR=window.KiwiDayReport,now=Date.now(),cap=now+5*60e3;
    try{
      if(DR?.today&&DR?.dayBounds&&DR?.shiftDay){
        const today=DR.today();let first=today,last=today;
        if(id==='yesterday')first=last=DR.shiftDay(today,-1);
        else if(id==='d7')first=DR.shiftDay(today,-6);
        else if(id==='d30')first=DR.shiftDay(today,-29);
        else if(id==='month')first=today.slice(0,8)+'01';
        else if(id==='lastMonth'){last=DR.shiftDay(today.slice(0,8)+'01',-1);first=last.slice(0,8)+'01';}
        const from=DR.dayBounds(first).from,end=DR.dayBounds(last).to;
        if(Number.isFinite(from)&&Number.isFinite(end)&&end>from)return{id,from,to:Math.min(end,cap),first,last,zone:DR.timezone?.()||'Africa/Casablanca',exact:true};
      }
    }catch(_){}
    /* Sans le module du rapport journalier : minuit de l'appareil, et la
       période est nommée sans dates pour ne rien affirmer de faux. */
    const d=new Date();d.setHours(0,0,0,0);const t=d.getTime(),y=d.getFullYear(),m=d.getMonth();
    const span={today:[t,now],yesterday:[t-864e5,t],d7:[t-6*864e5,now],d30:[t-29*864e5,now],month:[new Date(y,m,1).getTime(),now],lastMonth:[new Date(y,m-1,1).getTime(),new Date(y,m,1).getTime()]}[id]||[t-29*864e5,now];
    return{id,from:span[0],to:span[1],first:'',last:'',zone:'',exact:false};
  }
  function salesRangeLabel(w){
    if(!w.exact)return ui(SALES_LABEL[w.id]||'salesPreset30');
    if(w.first===w.last){const [y,m,d]=w.first.split('-').map(Number);return ui('salesDayLabel',{day:new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(lang()==='ar'?'ar-MA':lang()==='en'?'en-GB':'fr-FR',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d)))});}
    return rangeLabel(w);
  }
  function salesData(id){
    const w=salesWindow(id),items=D().items.map(x=>({item:x,qty:0,pricedQty:0,formulaQty:0,zeroQty:0,revenue:0}));
    const L=menuLedger(w,items);
    if(!L)return null;
    const match=saleLineMatcher(items),offMenu=new Map();let attributed=0,offAmt=0,freeAmt=0;
    L.lines.forEach(x=>{
      const row=match(x.line);
      if(row){
        row.qty+=x.qty;row.revenue+=x.collected;attributed+=x.collected;
        if(x.collected>0)row.pricedQty+=x.qty;
        else if(String(x.kind||x.line?.kind||'')==='formula-part')row.formulaQty+=x.qty;
        else row.zeroQty+=x.qty;
        return;
      }
      const line=x.line,lid=String(line?.itemId??line?.i??line?.id??''),name=String(line?.baseName||line?.bn||line?.name||line?.n||'').trim();
      const free=lid==='libre'||/^article libre$/i.test(name),k=free?'libre':(lid?'id:'+lid:'name:'+norm(name));
      const o=offMenu.get(k)||{key:k,name:free?ui('freeAmountItem'):(name||ui('article')),free,qty:0,revenue:0};
      o.qty+=x.qty;o.revenue+=x.collected;offMenu.set(k,o);offAmt+=x.collected;if(free)freeAmt+=x.collected;
    });
    const cats=new Map();
    items.filter(r=>r.qty>0).forEach(r=>{
      const c=cat(r.item.catId),key=c?'c:'+c.id:'none';
      const g=cats.get(key)||{key,name:c?.name?t(c.name):ui('noSection'),qty:0,revenue:0,n:0};
      g.qty+=r.qty;g.revenue+=r.revenue;g.n++;cats.set(key,g);
    });
    [...offMenu.values()].forEach(o=>{
      const key=o.free?'free':'off',g=cats.get(key)||{key,name:ui(o.free?'freeAmountSection':'offMenuSection'),qty:0,revenue:0,n:0,off:true};
      g.qty+=o.qty;g.revenue+=o.revenue;g.n++;cats.set(key,g);
    });
    const ledger={grossN:L.grossN,gross:L.gross,refundN:L.refundN,refunds:L.refunds,net:L.net,attributed,offMenu:0,offAmt,freeAmount:freeAmt,unitemisedN:L.unitemisedN,unitemised:L.unitemisedAmt,discounts:L.discounts,dupN:L.dupN,dupAmt:L.dupAmt,todayCostQty:0,basis:{mode:'none'},completeness:feedCompleteness()};
    const byRev=(a,b)=>b.revenue-a.revenue||b.qty-a.qty;
    return{window:w,ledger,itemised:L.collected,
      categories:[...cats.values()].sort((a,b)=>(a.off?1:0)-(b.off?1:0)||byRev(a,b)),
      items:items.filter(r=>r.qty>0).sort(byRev),
      offMenu:[...offMenu.values()].sort(byRev),
      unsold:items.filter(r=>!r.qty&&!r.item.archived&&r.item.avail!==false).length};
  }
  function salesPanel(){
    const pills=SALES_PRESETS.map(k=>`<button class="mi-pill${k===salesPeriod?' on':''}" type="button" role="tab" aria-selected="${k===salesPeriod}" data-action="rmw-sales-period" data-period="${k}">${esc(ui(SALES_LABEL[k]))}</button>`).join('');
    let p=null;try{p=salesData(salesPeriod);}catch(_){p=null;}
    const head=`<section class="mi-section"><div class="mi-recettes-head"><div><div class="mi-title">${esc(ui('salesTitle'))}</div><div class="mi-sub">${esc(ui('salesSub'))}</div></div>${p?`<div class="rmw-perf-period" data-sales-from="${p.window.from}" data-sales-to="${p.window.to}" title="${esc(p.window.zone||'')}">${esc(salesRangeLabel(p.window))}</div>`:''}</div><div class="mi-pill-row rmw-sales-pills" role="tablist" aria-label="${esc(ui('salesPeriodAria'))}">${pills}</div></section>`;
    if(!p)return `<div class="rmw-sales" data-sales-state="error">${head}<section class="mi-section"><div class="rmw-empty"><h3>${esc(ui('salesError'))}</h3></div></section></div>`;
    const L=p.ledger,notes=ledgerNotes(L,'salesLoading');
    let offline=false;try{offline=navigator.onLine===false;}catch(_){}
    if(offline)notes.unshift(`<p class="warn">${esc(ui('salesOffline'))}</p>`);
    const num=(v)=>window.KiwiNumber?.format(v,{})??v.toLocaleString(lang()==='en'?'en-GB':'fr-FR');
    const pct=(v)=>p.itemised>0?(v/p.itemised*100).toFixed(v/p.itemised*100<10?1:0)+' %':'·';
    const strip=`<div class="rmw-perf-ledger rmw-sales-ledger" data-ledger-gross="${L.gross.toFixed(2)}" data-ledger-net="${L.net.toFixed(2)}"><div><span>${esc(ui('ledgerGross'))}</span><b>${cash(L.gross)}</b><small>${esc(ui('ledgerTickets',{n:L.grossN}))}</small></div><div><span>${esc(ui('ledgerRefunds'))}</span><b>${L.refunds?'− '+cash(L.refunds):cash(0)}</b><small>${esc(ui('ledgerRefundCount',{n:L.refundN}))}</small></div><div><span>${esc(ui('ledgerNet'))}</span><b>${cash(L.net)}</b><small>${esc(ui('ledgerNetSub'))}</small></div><div><span>${esc(ui('salesAvgTicket'))}</span><b>${L.grossN?cash(L.gross/L.grossN):'·'}</b><small>${esc(ui('salesAvgTicketSub'))}</small></div></div>${notes.length?`<div class="rmw-perf-notes">${notes.join('')}</div>`:''}`;
    if(!L.grossN&&!p.items.length&&!p.offMenu.length){
      const empty=!D().items.length?`<h3>${esc(ui('noItemsToAnalyze'))}</h3><p>${esc(ui('noItemsToAnalyzeDesc'))}</p>`:`<h3>${esc(ui('salesNone'))}</h3><p>${esc(ui('salesNoneDesc'))}</p>`;
      return `<div class="rmw-sales" data-sales-state="${L.completeness==='loading'?'loading':'empty'}">${head}${strip}<section class="mi-section"><div class="rmw-empty">${empty}</div></section></div>`;
    }
    const max=Math.max(1,...p.categories.map(g=>g.revenue));
    const catRows=p.categories.map(g=>`<tr class="${g.off?'rmw-perf-off':''}" data-sales-cat="${esc(g.key)}"><td><b>${esc(g.name)}</b><small>${esc(ui('salesItemsCount',{n:g.n}))}</small></td><td>${num(g.qty)}</td><td>${cash(g.revenue)}</td><td><div class="rmw-sales-share"><i style="width:${(Math.max(0,g.revenue)/max*100).toFixed(1)}%"></i><span>${pct(g.revenue)}</span></div></td></tr>`).join('');
    const itemRow=(name,sub,r,off)=>{const extra=[];if(r.formulaQty)extra.push(ui('salesInFormula',{n:num(r.formulaQty)}));if(r.zeroQty)extra.push(ui('salesAtZero',{n:num(r.zeroQty)}));return `<tr class="${off?'rmw-perf-off':''}"><td><b>${esc(name)}</b><small>${esc(sub)}</small></td><td>${num(r.qty)}${extra.length?`<small>${esc(extra.join(' · '))}</small>`:''}</td><td>${cash(r.revenue)}</td><td>${pct(r.revenue)}</td><td>${r.pricedQty?cash(r.revenue/r.pricedQty):'·'}</td></tr>`;};
    const itemRows=p.items.map(r=>itemRow(t(r.item.name),cat(r.item.catId)?.name?t(cat(r.item.catId).name):ui('noSection'),r,false)).join('')+p.offMenu.map(o=>itemRow(o.name,ui(o.free?'freeAmountSection':'offMenuSection'),{qty:o.qty,revenue:o.revenue,pricedQty:o.revenue>0?o.qty:0},true)).join('');
    const lbl=(keys)=>keys.map((k,i)=>`--l${i+1}:${JSON.stringify(ui(k))}`).join(';');
    return `<div class="rmw-sales" data-sales-state="ready">${head}${strip}
      <section class="mi-section"><div class="mi-section-head"><h3>${esc(ui('salesByCategory'))}</h3></div><div class="mi-list-wrap" tabindex="0" role="region" aria-label="${esc(ui('salesByCategory'))}"><table class="mi-list rmw-sales-table" style="${esc(lbl(['salesColCategory','salesColQty','salesColRevenue','salesColShare']))}"><thead><tr><th>${esc(ui('salesColCategory'))}</th><th>${esc(ui('salesColQty'))}</th><th>${esc(ui('salesColRevenue'))}</th><th>${esc(ui('salesColShare'))}</th></tr></thead><tbody>${catRows}</tbody></table></div></section>
      <section class="mi-section"><div class="mi-section-head"><h3>${esc(ui('salesByItem'))}</h3></div><div class="mi-list-wrap" tabindex="0" role="region" aria-label="${esc(ui('salesByItem'))}"><table class="mi-list rmw-sales-table" style="${esc(lbl(['colItem','salesColQty','salesColRevenue','salesColShare','salesColAvgPrice']))}"><thead><tr><th>${esc(ui('colItem'))}</th><th>${esc(ui('salesColQty'))}</th><th>${esc(ui('salesColRevenue'))}</th><th>${esc(ui('salesColShare'))}</th><th>${esc(ui('salesColAvgPrice'))}</th></tr></thead><tbody>${itemRows}</tbody></table></div>
      <div class="rmw-perf-notes"><p>${esc(ui('salesShareNote',{amount:cash(p.itemised)}))}</p>${p.unsold?`<p>${esc(ui('salesUnsold',{n:p.unsold}))}</p>`:''}</div></section></div>`;
  }
  function salesStyle(){if($('#rmw-sales-css'))return;const s=document.createElement('style');s.id='rmw-sales-css';s.textContent=`
.rmw-sales-pills{margin-top:14px}
.rmw-sales-table td small{display:block;margin-top:3px;color:var(--n-500);font-size:11px}
.rmw-sales-table td:not(:first-child),.rmw-sales-table th:not(:first-child){text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}
.rmw-sales-share{display:flex;align-items:center;justify-content:flex-end;gap:10px}
.rmw-sales-share i{display:block;height:6px;min-width:2px;max-width:120px;flex:0 1 120px;border-radius:999px;background:var(--atlas)}
.rmw-sales-share span{min-width:44px}
@media (max-width:720px){.rmw-sales-table thead{display:none}.rmw-sales-table,.rmw-sales-table tbody{display:block}.rmw-sales-table tr{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;padding:12px 0;border-bottom:1px solid var(--n-200)}.rmw-sales-table td{display:block;text-align:start!important;padding:0}.rmw-sales-table td:first-child{grid-column:1/-1}.rmw-sales-table td:nth-child(2)::before{content:var(--l2);display:block;font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}.rmw-sales-table td:nth-child(3)::before{content:var(--l3);display:block;font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}.rmw-sales-table td:nth-child(4)::before{content:var(--l4);display:block;font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}.rmw-sales-table td:nth-child(5)::before{content:var(--l5);display:block;font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}.rmw-sales-share{justify-content:flex-start}}
`;document.head.appendChild(s);}
  const SERVICE_WINDOWS=[
    {id:'matin',name:'Matin',from:5*60,to:11*60},
    {id:'midi',name:'Midi',from:11*60,to:15*60},
    {id:'apresmidi',name:'Après-midi',from:15*60,to:19*60},
    {id:'soir',name:'Soir',from:19*60,to:29*60},
  ];
  function minuteLabel(value){const m=((Math.round(value)%1440)+1440)%1440,h=Math.floor(m/60),mm=m%60;return `${String(h).padStart(2,'0')}h${mm?String(mm).padStart(2,'0'):''}`;}
  function openingSpans(){
    const api=window.KiwiHours,doc=api?.get?.(venue());
    if(!api?.isConfigured?.(venue())||!doc?.week)return [];
    const spans=[];
    (api.DAYS||Object.keys(doc.week)).forEach(day=>{
      const d=doc.week[day];
      if(!d?.open)return;
      (d.periods||[]).forEach(p=>{
        const from=api.toMin?.(p.from),duration=api.span?.(p);
        if(from==null||!duration)return;
        spans.push({from,to:from+duration});
        /* A service entered as 00:00–02:00 belongs to the evening analysis
         * too, even when it is stored as a separate post-midnight period. */
        if(from<5*60)spans.push({from:from+1440,to:from+duration+1440});
      });
    });
    return spans;
  }
  function servicePeriods(){
    const spans=openingSpans();
    return SERVICE_WINDOWS.map(service=>{
      const overlaps=spans.map(span=>({from:Math.max(span.from,service.from),to:Math.min(span.to,service.to)})).filter(x=>x.to>x.from);
      if(!overlaps.length)return null;
      const from=Math.min(...overlaps.map(x=>x.from)),to=Math.max(...overlaps.map(x=>x.to));
      return {...service,from,to,label:`${service.name} (${minuteLabel(from)}-${minuteLabel(to)})`};
    }).filter(Boolean);
  }
  /* L'heure d'une vente dans le fuseau du COMMERCE, pas du navigateur : un
     tableau de bord ouvert depuis Paris rangeait le coup de feu de 21 h
     marocain dans la case 22 h. */
  let zoneClock=null,zoneClockZone='';
  function merchantMinute(ts){
    const zone=(()=>{try{return window.KiwiDayReport?.timezone?.()||'';}catch(_){return '';}})();
    if(!zone){const d=new Date(ts);return d.getHours()*60+d.getMinutes();}
    if(!zoneClock||zoneClockZone!==zone){try{zoneClock=new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});zoneClockZone=zone;}catch(_){zoneClock=null;const d=new Date(ts);return d.getHours()*60+d.getMinutes();}}
    const parts=zoneClock.formatToParts(new Date(ts));let h=0,m=0;parts.forEach(x=>{if(x.type==='hour')h=+x.value;if(x.type==='minute')m=+x.value;});return (h%24)*60+m;
  }
  function minuteInService(ts,service){const plain=merchantMinute(ts),m=service.to>1440&&plain<service.to-1440?plain+1440:plain;return m>=service.from&&m<service.to;}
  /* Les lignes du même registre que la Performance (KiwiCost.ledger) :
     annulations, doublons et remises y suivent les mêmes règles. */
  function hoursData(periods,selected,days=30,L=null){
    const rows=D().items.map(x=>({item:x,qty:0,revenue:0,byPeriod:{}})),match=saleLineMatcher(rows),w=analysisWindow(days);
    L=L||menuLedger(w);
    (L?L.lines:[]).forEach(x=>{
      const service=periods.find(p=>minuteInService(x.ts,p));if(!service)return;
      const row=match(x.line);if(!row||!x.qty)return;
      row.byPeriod[service.id]=(row.byPeriod[service.id]||0)+x.qty;
      if(service.id===selected.id){row.qty+=x.qty;row.revenue+=x.collected;}
    });
    const ranked=rows.filter(x=>x.qty>0).sort((a,b)=>b.qty-a.qty||b.revenue-a.revenue),totalQty=ranked.reduce((n,x)=>n+x.qty,0),totalRevenue=ranked.reduce((n,x)=>n+x.revenue,0);
    const notable=rows.map(row=>{const total=Object.values(row.byPeriod).reduce((n,x)=>n+x,0),best=periods.slice().sort((a,b)=>(row.byPeriod[b.id]||0)-(row.byPeriod[a.id]||0))[0],qty=best?(row.byPeriod[best.id]||0):0;return{row,total,best,qty,share:total?qty/total*100:0};}).filter(x=>x.total>=2&&x.share>=Math.max(55,100/periods.length+15)).sort((a,b)=>b.share-a.share||b.total-a.total).slice(0,5);
    return {ranked,totalQty,totalRevenue,top:ranked[0]||null,notable,days};
  }
  function hoursPanel(){
    const api=window.KiwiHours;
    /* Missing configuration must not hide recorded sales. Hourly buckets
     * describe timestamps, not assumed opening hours. */
    const configured=api?.isConfigured?.(venue());
    const L=menuLedger(analysisWindow(30)),recent=configured?[]:(L?L.lines:[]);
    const periods=configured?servicePeriods():Array.from({length:24},(_,h)=>({id:'hour-'+h,name:minuteLabel(h*60),from:h*60,to:(h+1)*60,label:`${minuteLabel(h*60)}-${minuteLabel((h+1)*60)}`})).filter(p=>recent.some(s=>minuteInService(+s.ts,p)));
    if(!periods.length)return `<section class="mi-section"><div class="rmw-empty"><h3>${esc(ui(configured?'noServiceToAnalyze':'noSalesYet'))}</h3><p>${esc(ui(configured?'noServiceToAnalyzeDesc':'noSalesYetDesc'))}</p></div></section>`;
    if(!periods.some(x=>x.id===hoursPeriod))hoursPeriod=configured?periods[0].id:periods.map(p=>({id:p.id,qty:hoursData(periods,p,30,L).totalQty})).sort((a,b)=>b.qty-a.qty)[0].id;
    const selected=periods.find(x=>x.id===hoursPeriod)||periods[0],data=hoursData(periods,selected,30,L),max=Math.max(1,...data.ranked.slice(0,10).map(x=>x.qty));
    const pills=periods.map(p=>`<button class="mi-pill${p.id===selected.id?' on':''}" data-action="rmw-hours-period" data-period="${p.id}">${esc(p.label)}</button>`).join('');
    const bars=data.ranked.slice(0,10).map(row=>`<div class="rmw-hours-row"><div class="rmw-hours-name" title="${esc(t(row.item.name))}">${esc(t(row.item.name))}</div><div class="rmw-hours-track"><i style="width:${(row.qty/max*100).toFixed(1)}%"></i></div><b>${(window.KiwiNumber?.format(row.qty, {}) ?? row.qty.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}))}</b></div>`).join('');
    const totalForTop=data.top?Object.values(data.top.byPeriod).reduce((n,x)=>n+x,0):0,topShare=data.top&&totalForTop?data.top.qty/totalForTop*100:0;
    const insight=data.top?`<div class="rmw-hours-insight"><span>${esc(ui('peakInsightTag', { label: selected.label }))}</span><h3>${esc(ui('peakInsightTitle', { item: t(data.top.item.name) }))}</h3><p>${esc(ui('peakInsightBody', { qty: (window.KiwiNumber?.format(data.top.qty, {}) ?? data.top.qty.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {})), share: (data.top.qty/data.totalQty*100).toFixed(0), peakShare: topShare.toFixed(0), period: selected.name.toLowerCase() }))}</p></div>`:'';
    const notable=data.notable.map(x=>`<div class="rmw-hours-notable"><i></i><div><b>${esc(t(x.row.item.name))}</b><span>${esc(ui('peakNotableBody', { share: x.share.toFixed(0), total: (window.KiwiNumber?.format(x.total, {}) ?? x.total.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {})), period: x.best.name.toLowerCase(), hours: `${minuteLabel(x.best.from)}-${minuteLabel(x.best.to)}` }))}</span></div></div>`).join('');
    const topQtyStr = data.top ? `${(window.KiwiNumber?.format(data.top.qty, {}) ?? data.top.qty.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}))} ${data.top.qty !== 1 ? ui('articles') : ui('article')}` : ui('noSaleRecorded');
    return `<div class="rmw-hours-page"><section class="mi-section"><div class="mi-section-head"><div><h3>${esc(ui('hoursTitle'))}</h3><div class="mi-section-sub">${esc(ui('hoursSub', { n: data.days }))} · ${esc(rangeLabel(analysisWindow(data.days)))}${configured?'':` · ${esc(ui('hoursObserved'))}`}</div></div></div><div class="mi-pill-row rmw-hours-pills">${pills}</div><div class="rmw-hours-kpis"><div><span>${esc(ui('itemsSold'))}</span><b>${(window.KiwiNumber?.format(data.totalQty, {}) ?? data.totalQty.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}))}</b><small>${esc(selected.label)}</small></div><div><span>${esc(ui('generatedRevenue'))}</span><b>${cash(data.totalRevenue)}</b><small>${esc(ui('inPeriod'))}</small></div><div><span>${esc(ui('topItem'))}</span><b>${data.top?esc(t(data.top.item.name)):'·'}</b><small>${esc(topQtyStr)}</small></div></div><div class="rmw-hours-list-title">${esc(ui('top10Items', { label: selected.label }))}</div>${bars?`<div class="rmw-hours-bars">${bars}</div>`:`<div class="rmw-empty"><h3>${esc(ui('noSalesInPeriod'))}</h3><p>${esc(ui('noSalesInPeriodDesc'))}</p></div>`}</section>${insight}${notable?`<section class="mi-section"><div class="mi-section-head"><h3>${esc(ui('itemsWithPeak'))}</h3></div><div class="rmw-hours-notables">${notable}</div></section>`:''}</div>`;
  }
  function alertsPanel(){
    const rows=D().items.filter(x=>x.avail===false).map(x=>`<div class="mi-group-card"><div class="mi-group-card-head"><span class="mi-group-card-name">${esc(t(x.name))}</span><span class="mi-group-card-pill req">${esc(ui('unavailableBadge'))}</span></div><button data-activation=write class="btn-slim primary" data-action="rmw-reactivate" data-arg="${x.id}">${esc(ui('reactivate'))}</button></div>`).join('');
    return `<section class="mi-section"><div class="mi-title">${esc(ui('alerts86Title'))}</div><div class="mi-sub">${esc(ui('alerts86Sub'))}</div><div class="mi-groups-grid">${rows||`<div class="rmw-empty">${esc(ui('no86Alerts'))}</div>`}</div></section>`;
  }
  /* Réglages de caisse des métiers de bouche (pizzeria, traiteur, boulangerie) :
     l'onglet n'existe que là, et seulement en vrai (assets/food-trade-settings.js). */
  const caisseOn=()=>!!window.KiwiFoodTradeSettings?.enabled?.();
  /* Promotions de la carte (assets/menu-promos-dashboard.js) : la règle, son
     éditeur et le prix appliqué par la caisse, l'appli Serveur et le serveur. */
  const promosOn=()=>!!window.KiwiMenuPromosPanel?.enabled?.();
  function promosPanel(){return `<div data-rmw-promos>${window.KiwiMenuPromosPanel?.html?.()||''}</div>`;}
  function caissePanel(){
    return `<section class="mi-section"><div class="mi-title">${esc(ui('caisseTitle'))}</div><div class="mi-sub">${esc(ui('caisseSub'))}</div><div data-rmw-caisse></div></section>`;
  }
  function nfcPanel(){
    const on=!!window.KiwiOrderProPanel?.enabled?.();
    return `<section class="mi-section"><div class="mi-title">${esc(ui('nfcTitle'))}</div><div class="mi-sub">${esc(ui('nfcSub'))}</div>${on?'<div class="rmw-nfc" data-rmw-nfc></div>':`<div class="rmw-empty"><h3>${esc(ui('nfcUnavailable'))}</h3><p>${esc(ui('nfcUnavailableDesc'))}</p></div>`}</section>`;
  }
  const modal=(o)=>window.Kiwi?.modal?.(o);
  function ask(title,label,value,save){const m=modal({title,width:460,body:`<label class="kf-label">${esc(label)}</label><input class="kf-input" data-value value="${esc(value||'')}"/>`,foot:`<button class="kb ghost" data-cancel>${esc(ui('cancelBtn'))}</button><button data-activation=write class="eq-cta-gradient" data-save>${esc(ui('saveBtn'))}</button>`});$('[data-cancel]',m.el).onclick=m.close;$('[data-save]',m.el).onclick=()=>{const v=$('[data-value]',m.el).value.trim();if(!v)return;save(v);m.close();render();};$('[data-value]',m.el).focus();}
  function openCategory(x){
    const d=D(),kid=S().kitchenId(venue());
    const m=modal({title:x?ui('editSectionTitle'):ui('newSectionTitle'),width:500,body:`<div class="kf-group"><label class="kf-label" for="rmw-section-name">${esc(ui('sectionNameLabel'))}</label><input id="rmw-section-name" class="kf-input" data-name value="${esc(x?.name||'')}" placeholder="${esc(ui('sectionNamePlaceholder'))}"/></div>${x?`<div class="kf-group"><label class="kf-label" for="rmw-section-station">${esc(ui('stationLabel'))}</label><select id="rmw-section-station" class="kf-input" data-station><option value="">${esc(ui('defaultRoute', { name: t(station(kid)?.name)||ui('kitchen') }))}</option>${d.stations.filter(s=>s.id!==kid).map(s=>`<option value="${s.id}"${x.station===s.id?' selected':''}>${esc(t(s.name))}</option>`).join('')}</select></div>`:''}`,foot:`<button class="kb ghost" data-cancel>${esc(ui('cancelBtn'))}</button><button data-activation=write class="eq-cta-gradient" data-save>${esc(ui('saveBtn'))}</button>`});
    $('[data-cancel]',m.el).onclick=m.close;$('[data-save]',m.el).onclick=()=>{const n=$('[data-name]',m.el).value.trim();if(!n)return;if(x){S().renameCategory(x.id,n);S().setCategoryStation(x.id,$('[data-station]',m.el).value);}else S().addCategory(n);m.close();render();};
  }
  async function upload(file,kind,status){if(!file)return'';if(!window.KiwiOrderPro?.uploadMedia){status.textContent=ui('itUploadUnavailable');return'';}status.textContent=ui('itUploading');try{const r=await window.KiwiOrderPro.uploadMedia(file,{kind}),u=typeof r==='string'?r:r?.url||'';status.textContent=u?ui('itUploadReady'):(window.KiwiOrderPro.uploadError?window.KiwiOrderPro.uploadError(r):ui('itUploadFailed'));return u;}catch(_){status.textContent=ui('itUploadFailed');return'';}}
  /* L'éditeur d'article : la fiche à gauche (article, options, formule), la
     photo et ce qui décide de la visibilité à droite. Même feuille que
     l'éditeur de recette (rmw-recipe-modal) : opaque, un seul style de champ,
     des interrupteurs pour ce qui est oui ou non, des icônes Material. */
  const IT_ICON={add:'M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z',close:'m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z',del:'M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z',check:'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z',photo:'M480-480ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h320v80H200v560h560v-320h80v320q0 33-23.5 56.5T760-120H200Zm40-160h480L570-480 450-320l-90-120-120 160Zm440-320v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z',image:'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Zm-40 80v-560 560Z'};
  const itSvg=(k)=>`<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="${IT_ICON[k]}"/></svg>`;
  function openItem(x){
    const d=D();if(!d.cats.length){openCategory(null);return;}
    let photo=x?.photo||'',video=x?.video||'';
    const availableItems=(d.items||[]).filter(it=>(!x||it.id!==x.id)&&!it.archived);
    const archivedItems=(d.items||[]).filter(it=>it&&it.archived&&(!x||it.id!==x.id));
    const formulaTemplates=[...(d.formulaTemplates||[]).filter(t=>t?.formula?.slots?.length).map(t=>({id:'template:'+t.id,name:t.name,formula:t.formula})),...(d.items||[]).filter(it=>it.formula?.slots?.length).map(it=>({id:'item:'+it.id,name:`${t(it.name)}`,formula:it.formula}))];
    let formulaSlots=x?.formula?.slots?JSON.parse(JSON.stringify(x.formula.slots)):[],expandedFormulaSlot=formulaSlots.length?0:-1;
    // « Le client en choisit {min} à {max} » : la règle se lit comme une phrase, les deux nombres sont les champs.
    const ruleHtml=(slot,si)=>ui('itRule').split(/(\{min\}|\{max\})/).map(part=>part==='{min}'?`<input class="rmw-st-num" type="number" min="0" max="10" inputmode="numeric" data-slot-min="${si}" value="${slot.min!=null?slot.min:1}" aria-label="${esc(ui('minLabel'))}"/>`:part==='{max}'?`<input class="rmw-st-num" type="number" min="1" max="10" inputmode="numeric" data-slot-max="${si}" value="${slot.max!=null?slot.max:1}" aria-label="${esc(ui('maxLabel'))}"/>`:part?`<span>${esc(part)}</span>`:'').join('');
    const slotRowHtml=(slot,si)=>{
      const open=expandedFormulaSlot===si,n=(slot.choices||[]).length;
      const choicesHtml=(slot.choices||[]).map((ch,ci)=>{const hit=d.items.find(it=>it.id===ch.itemId),name=hit?t(hit.name):ch.itemId;return `<div class="rmw-st-choice" data-si="${si}" data-ci="${ci}"><span class="rmw-st-n">${ci+1}</span><span class="rmw-st-name"><b>${esc(name)}</b>${hit?`<small>${esc(ui('itAlone',{price:cash(hit.price)}))}</small>`:''}</span><label class="rmw-st-extra"><span>${esc(ui('extra'))}</span><span class="rmw-rx-suffix rmw-st-plus"><em>+</em><input class="rmw-rx-in" type="number" min="0" step="0.5" inputmode="decimal" data-ch-extra="${si}-${ci}" value="${+ch.extra||0}"/><i>MAD</i></span></label><button type="button" class="rmw-rx-del" data-del-choice="${si}-${ci}" aria-label="${esc(ui('removeChoice'))}">${itSvg('close')}</button></div>`;}).join('');
      const avToAdd=availableItems.filter(it=>!(slot.choices||[]).some(c=>c.itemId===it.id));
      const pickerOption=(it,category)=>{const sub=category&&(category.sub||[]).find(entry=>entry.id===it.subId),context=sub?t(sub.name):(category?t(category.name):ui('noSection')),search=`${t(it.name)||''} ${category?t(category.name):''} ${sub?t(sub.name):''}`.toLocaleLowerCase();return `<button type="button" class="rmw-formula-picker-option" role="option" data-rmw-picker-item="${esc(it.id)}" data-rmw-picker-si="${si}" data-picker-search="${esc(search)}"><span class="rmw-formula-picker-option-copy"><strong>${esc(t(it.name))}</strong><small>${esc(context)}</small></span><span class="rmw-formula-picker-price">${cash(it.price)}</span><span class="rmw-formula-picker-add">${itSvg('add')}</span></button>`;};
      const pickerGroups=d.cats.map(category=>{const items=avToAdd.filter(it=>it.catId===category.id);return items.length?`<section class="rmw-formula-picker-group" data-picker-group><div class="rmw-formula-picker-group-title">${esc(t(category.name))}</div>${items.map(it=>pickerOption(it,category)).join('')}</section>`:'';}).join(''),uncategorized=avToAdd.filter(it=>!d.cats.some(category=>category.id===it.catId)),pickerGroupsHtml=pickerGroups+(uncategorized.length?`<section class="rmw-formula-picker-group" data-picker-group><div class="rmw-formula-picker-group-title">${esc(ui('noSection'))}</div>${uncategorized.map(it=>pickerOption(it,null)).join('')}</section>`:'');
      let addBarHtml='';
      if(availableItems.length===0)addBarHtml=`<div class="rmw-st-note"><p>${esc(ui('noItemsOnMenuFormulaNotice'))}</p><button data-activation=write type="button" class="rmw-rx-link" data-f-save-and-create>${esc(ui('saveAndCreateItemBtn'))}</button></div>`;
      else if(avToAdd.length===0)addBarHtml=`<div class="rmw-st-note"><p>${esc(ui('allChosenNotice'))}</p></div>`;
      else addBarHtml=`<div class="rmw-st-add"><button type="button" class="rmw-st-pick" data-rmw-picker-toggle="${si}" aria-haspopup="listbox" aria-expanded="false">${itSvg('add')}<span>${esc(ui('itAddChoice'))}</span></button><div class="rmw-formula-picker" data-rmw-picker-panel="${si}" role="listbox" aria-label="${esc(ui('chooseItemPlaceholder'))}" hidden><div class="rmw-formula-picker-search"><label>${pickerSearchIcon}<input type="search" data-rmw-picker-search="${si}" placeholder="${esc(ui('searchPlaceholder'))}" autocomplete="off"/></label></div><div class="rmw-formula-picker-results" tabindex="0" role="region" aria-label="${esc(ui('chooseItemPlaceholder'))}">${pickerGroupsHtml}<div class="rmw-formula-picker-empty" data-picker-empty hidden>${esc(ui('noItemMatch'))}</div></div></div></div>`;
      return `<div class="rmw-st${open?' is-open':''}" data-slot-idx="${si}"><div class="rmw-st-head"><span class="rmw-st-kicker">${esc(ui('step'))} ${si+1}</span><div class="rmw-st-acts"><span class="rmw-st-sum">${esc(ui(n===1?'itChoiceOne':'itChoiceCount',{n}))}</span><button type="button" class="rmw-st-btn" data-slot-toggle="${si}" aria-expanded="${open?'true':'false'}" aria-label="${esc(ui(open?'itCollapse':'itExpand'))}">${pickerChevronIcon}</button><button type="button" class="rmw-st-btn danger" data-del-slot="${si}" aria-label="${esc(ui('deleteStep'))}">${itSvg('del')}</button></div><input class="rmw-st-title" data-slot-label="${si}" value="${esc(slot.label||'')}" placeholder="${esc(ui('stepTitlePlaceholder'))}" aria-label="${esc(ui('step'))} ${si+1}"/><div class="rmw-st-rule" role="group" aria-label="${esc(ui('selectionRule'))}">${ruleHtml(slot,si)}</div></div><div class="rmw-st-body"${open?'':' hidden'}>${choicesHtml?`<div class="rmw-st-list">${choicesHtml}</div>`:`<p class="rmw-st-empty">${esc(ui('noChoicesInStep'))}</p>`}${addBarHtml}</div></div>`;
    };
    const toggle=(attr,on,label,help)=>`<label class="rmw-it-tg"><span class="rmw-it-tg-txt"><b>${esc(label)}</b><small>${esc(help)}</small></span><input type="checkbox" role="switch" ${attr}${on?' checked':''}/><span class="rmw-it-sw" aria-hidden="true"></span></label>`;
    const mediaTile=()=>photo?`<img src="${esc(photo)}" alt="">`:video?`<video src="${esc(video)}" muted playsinline loop autoplay></video>`:`<span class="rmw-it-ph">${itSvg('image')}<small>${esc(ui('itNoMedia'))}</small></span>`;
    const optsHtml=d.opts.length?`<div class="rmw-it-chips">${d.opts.map(g=>{const n=(g.choices||[]).length;return `<label class="rmw-it-chip"><input type="checkbox" data-opt="${g.id}"${(x?.opts||[]).includes(g.id)?' checked':''}/><span class="rmw-it-chip-box">${itSvg('check')}</span><span class="rmw-it-chip-txt"><b>${esc(t(g.name))}</b>${n?`<small>${esc(ui(n===1?'itChoiceOne':'itChoiceCount',{n}))}</small>`:''}</span></label>`;}).join('')}</div>`:`<p class="rmw-rx-hint">${esc(ui('createOptGroupFirst'))}</p>`;
    const tplHtml=formulaTemplates.length?`<div class="rmw-it-tpl"><select class="rmw-rx-unit" data-formula-template data-kiwi-native-select aria-label="${esc(ui('formulaTemplatePlaceholder'))}"><option value="">${esc(ui('formulaTemplatePlaceholder'))}</option>${formulaTemplates.map(it=>`<option value="${it.id}">${esc(it.name)}</option>`).join('')}</select><button type="button" class="rmw-it-sbtn" data-apply-formula-template>${esc(ui('itApplyTpl'))}</button></div>`:'';
    const m=modal({title:x?ui('editItemTitle',{name:t(x.name)}):ui('newItemTitle'),width:980,body:`<div class="rmw-it">
      <div class="rmw-rx-main">
        <section class="rmw-rx-sec"><div class="rmw-rx-sec-head"><div><h4>${esc(ui('itSecItem'))}</h4><p>${esc(ui('itSecItemHelp'))}</p></div></div>
          <div class="rmw-it-grid">
            <label class="rmw-it-f"><span>${esc(ui('nameLabel'))}</span><input class="rmw-rx-in" data-name value="${esc(x?.name||'')}" autocomplete="off"/><em class="rmw-it-err" data-name-err hidden>${esc(ui('itNameRequired'))}</em></label>
            <label class="rmw-it-f"><span>${esc(ui('itPrice'))}</span><span class="rmw-rx-suffix"><input class="rmw-rx-in" type="number" min="0" step="0.01" inputmode="decimal" data-price value="${+x?.price||0}"/><i>MAD</i></span></label>
            <label class="rmw-it-f rmw-it-full"><span>${esc(ui('sectionLabel'))}</span><select class="rmw-rx-unit" data-cat data-kiwi-native-select>${d.cats.map(c=>`<option value="${c.id}"${x?.catId===c.id?' selected':''}>${esc(t(c.name))}</option>`).join('')}</select></label>
            <label class="rmw-it-f rmw-it-full"><span>${esc(ui('descLabel'))}</span><textarea class="rmw-rx-in" data-desc rows="3" placeholder="${esc(ui('itDescPh'))}">${esc(x?.desc||'')}</textarea></label>
          </div>
        </section>
        <section class="rmw-rx-sec"><div class="rmw-rx-sec-head"><div><h4>${esc(ui('itemOptionsLabel'))}</h4><p>${esc(ui('itSecOptionsHelp'))}</p></div></div>${optsHtml}</section>
        <section class="rmw-rx-sec rmw-it-formula"><div class="rmw-rx-sec-head"><div><h4>${esc(ui('itSecFormula'))}</h4><p>${esc(ui('isFormulaHelp'))}</p></div><label class="rmw-it-tg bare"><input type="checkbox" role="switch" data-is-formula aria-label="${esc(ui('isFormulaLabel'))}"${formulaSlots.length?' checked':''}/><span class="rmw-it-sw" aria-hidden="true"></span></label></div>
          <div class="rmw-formula-builder rmw-it-builder" data-formula-wrap${formulaSlots.length?'':' hidden'}>${tplHtml}<div data-slots-wrap class="rmw-it-steps"></div>
            <div class="rmw-it-formula-foot"><button data-activation=write type="button" class="rmw-rx-add" data-add-slot>${itSvg('add')}<span>${esc(ui('addStepBtn'))}</span></button><button data-activation=write type="button" class="rmw-rx-link" data-save-formula-template>${esc(ui('itSaveTpl'))}</button></div>
            ${archivedItems.length?`<details class="rmw-archived-group"><summary>${esc(ui('archivedGroup'))} · ${archivedItems.length}</summary>${archivedItems.map(it=>`<button type="button" disabled>${esc(t(it.name))}</button>`).join('')}</details>`:''}
          </div>
        </section>
      </div>
      <aside class="rmw-rx-side rmw-it-side">
        <div class="rmw-it-media" data-media-tile>${mediaTile()}</div>
        <div class="rmw-it-macts"><label class="rmw-it-mbtn">${itSvg('photo')}<span>${esc(ui('itPhoto'))}</span><input hidden type="file" accept="image/*" data-photo/></label><label class="rmw-it-mbtn"><span>${esc(ui('itVideo'))}</span><input hidden type="file" accept="video/*" data-video/></label><button type="button" class="rmw-it-mbtn ghost" data-media-remove${photo||video?'':' hidden'}>${esc(ui('removeMediaBtn'))}</button></div>
        <p class="rmw-it-mstatus" data-media-status aria-live="polite"></p>
        <div class="rmw-it-tgs">${toggle('data-avail',x?.avail!==false,ui('availableOpt'),ui('itAvailHelp'))}${toggle('data-standalone',!x?.formulaOnly,ui('standalone'),ui('formulaOnly'))}${toggle('data-formula-choice-photo',!!x?.showPhotoInFormulas,ui('formulaChoicePhoto'),ui('formulaChoicePhotoHelp'))}</div>
      </aside>
    </div>`,foot:(x?`<button class="kb ghost danger rmw-it-archive" data-archive>${esc(x.archived?ui('restore'):ui('archive'))}</button>`:'')+`<button class="kb ghost" data-cancel>${esc(ui('cancelBtn'))}</button><button data-activation=write class="eq-cta-gradient" data-save>${esc(ui('saveBtn'))}</button>`});
    recipeStyle();itemStyle();
    m.el.classList.add('rmw-item-workspace','rmw-recipe-modal');
    const sheet=$('.kiwi-modal',m.el),body=$('.kiwi-modal-body',m.el);
    body?.addEventListener('scroll',()=>sheet?.classList.toggle('rmw-scrolled',body.scrollTop>4),{passive:true});
    const isFormulaCb=$('[data-is-formula]',m.el),formulaWrap=$('[data-formula-wrap]',m.el),slotsWrap=$('[data-slots-wrap]',m.el);
    const renderSlots=()=>{if(!slotsWrap)return;slotsWrap.innerHTML=formulaSlots.map(slotRowHtml).join('')||`<p class="rmw-st-empty">${esc(ui('itNoStep'))}</p>`;};
    const formulaTemplateSelect=$('[data-formula-template]',m.el),applyFormulaTemplate=$('[data-apply-formula-template]',m.el);
    if(applyFormulaTemplate)applyFormulaTemplate.onclick=()=>{const template=formulaTemplates.find(it=>it.id===formulaTemplateSelect?.value);if(!template)return;formulaSlots=JSON.parse(JSON.stringify(template.formula.slots));expandedFormulaSlot=formulaSlots.length?0:-1;isFormulaCb.checked=true;if(formulaWrap)formulaWrap.hidden=false;renderSlots();toast(ui('itFormulaCopied'),template.name);};
    const saveFormulaTemplateBtn=$('[data-save-formula-template]',m.el);
    if(saveFormulaTemplateBtn)saveFormulaTemplateBtn.onclick=()=>{const clean={slots:JSON.parse(JSON.stringify(formulaSlots))};if(!clean.slots.some(s=>s?.choices?.length)){toast(ui('itFormulaEmpty'),ui('itFormulaEmptyHelp'),'warn');return;}ask(ui('saveTemplateBtn'),ui('itTemplateName'),x?.name||'',name=>{S().saveFormulaTemplate(name,clean);toast(ui('itFormulaSaved'),name);});};
    isFormulaCb.onchange=()=>{const on=!!isFormulaCb.checked;if(on&&!formulaSlots.length){formulaSlots.push({id:'sl_1',label:'',min:1,max:1,choices:[]});expandedFormulaSlot=0;}if(formulaWrap)formulaWrap.hidden=!on;renderSlots();};
    $('[data-add-slot]',m.el).onclick=()=>{if(formulaSlots.length>=10)return;formulaSlots.push({id:'sl_'+(formulaSlots.length+1),label:'',min:1,max:1,choices:[]});expandedFormulaSlot=formulaSlots.length-1;renderSlots();$(`[data-slot-label="${formulaSlots.length-1}"]`,slotsWrap)?.focus();};
    slotsWrap.addEventListener('input',e=>{
      const pickerSearch=e.target.closest('[data-rmw-picker-search]');
      if(pickerSearch){const panel=pickerSearch.closest('[data-rmw-picker-panel]'),term=pickerSearch.value.trim().toLocaleLowerCase();let visible=0;panel.querySelectorAll('[data-picker-search]').forEach(option=>{const match=!term||(option.dataset.pickerSearch||'').includes(term);option.hidden=!match;if(match)visible+=1;});panel.querySelectorAll('[data-picker-group]').forEach(group=>{group.hidden=!group.querySelector('[data-picker-search]:not([hidden])');});const empty=panel.querySelector('[data-picker-empty]');if(empty)empty.hidden=visible!==0;return;}
      const lbl=e.target.closest('[data-slot-label]');if(lbl){const si=+lbl.dataset.slotLabel;if(formulaSlots[si])formulaSlots[si].label=lbl.value;return;}
      const min=e.target.closest('[data-slot-min]');if(min){const si=+min.dataset.slotMin;if(formulaSlots[si])formulaSlots[si].min=Math.max(0,Math.min(10,+min.value||0));return;}
      const max=e.target.closest('[data-slot-max]');if(max){const si=+max.dataset.slotMax;if(formulaSlots[si])formulaSlots[si].max=Math.max(1,Math.min(10,+max.value||1));return;}
      const ext=e.target.closest('[data-ch-extra]');if(ext){const [si,ci]=ext.dataset.chExtra.split('-').map(Number);if(formulaSlots[si]?.choices?.[ci])formulaSlots[si].choices[ci].extra=Math.max(0,+ext.value||0);}
    });
    const closePickers=()=>{$$('[data-rmw-picker-panel]',slotsWrap).forEach(panel=>{panel.hidden=true;panel.classList.remove('is-floating');panel.removeAttribute('style');});$$('[data-rmw-picker-toggle]',slotsWrap).forEach(trigger=>trigger.setAttribute('aria-expanded','false'));};
    slotsWrap.addEventListener('click',e=>{
      if(e.target.closest('[data-f-save-and-create]')){saveItem(()=>{openItem(null);});return;}
      const st=e.target.closest('[data-slot-toggle]');if(st){const si=+st.dataset.slotToggle;expandedFormulaSlot=expandedFormulaSlot===si?-1:si;renderSlots();return;}
      const ds=e.target.closest('[data-del-slot]');if(ds){const si=+ds.dataset.delSlot;formulaSlots.splice(si,1);if(expandedFormulaSlot===si)expandedFormulaSlot=Math.min(si,formulaSlots.length-1);else if(expandedFormulaSlot>si)expandedFormulaSlot-=1;renderSlots();return;}
      const dc=e.target.closest('[data-del-choice]');if(dc){const [si,ci]=dc.dataset.delChoice.split('-').map(Number);if(formulaSlots[si]?.choices){formulaSlots[si].choices.splice(ci,1);renderSlots();}return;}
      const pickerToggle=e.target.closest('[data-rmw-picker-toggle]');
      if(pickerToggle){const panel=$(`[data-rmw-picker-panel="${pickerToggle.dataset.rmwPickerToggle}"]`,slotsWrap),willOpen=panel&&panel.hidden;closePickers();if(panel&&willOpen){panel.hidden=false;panel.classList.add('is-floating');pickerToggle.setAttribute('aria-expanded','true');const r=pickerToggle.getBoundingClientRect(),w=Math.min(Math.max(r.width,520),innerWidth-24);panel.style.width=w+'px';panel.style.left=Math.max(12,Math.min(r.left,innerWidth-w-12))+'px';const h=Math.min(panel.scrollHeight,460),below=innerHeight-r.bottom;panel.style.top=(below>=Math.min(h,320)?r.bottom+8:Math.max(12,r.top-h-8))+'px';requestAnimationFrame(()=>$('[data-rmw-picker-search]',panel)?.focus());}return;}
      const pickerItem=e.target.closest('[data-rmw-picker-item]');
      if(pickerItem){const si=+pickerItem.dataset.rmwPickerSi,pid=pickerItem.dataset.rmwPickerItem;if(pid&&formulaSlots[si]){formulaSlots[si].choices=formulaSlots[si].choices||[];if(formulaSlots[si].choices.length<20&&!formulaSlots[si].choices.some(choice=>choice.itemId===pid)){formulaSlots[si].choices.push({itemId:pid,extra:0});renderSlots();}}return;}
    });
    slotsWrap.addEventListener('keydown',e=>{if(e.key!=='Escape')return;const panel=e.target.closest('[data-rmw-picker-panel]');if(!panel)return;const si=panel.dataset.rmwPickerPanel;panel.hidden=true;const trigger=$(`[data-rmw-picker-toggle="${si}"]`,slotsWrap);trigger?.setAttribute('aria-expanded','false');trigger?.focus();});
    m.el.addEventListener('click',e=>{if(e.target.closest('.rmw-st-add'))return;closePickers();});
    renderSlots();
    const archiveBtn=$('[data-archive]',m.el);
    if(archiveBtn)archiveBtn.onclick=()=>{S().updateItem(x.id,{archived:!x.archived});m.close();render();toast(ui('itSaved'),t(x.name));};
    const status=$('[data-media-status]',m.el),tile=$('[data-media-tile]',m.el),removeBtn=$('[data-media-remove]',m.el);
    const showMedia=()=>{tile.innerHTML=mediaTile();removeBtn.hidden=!(photo||video);};
    $('[data-photo]',m.el).onchange=async e=>{const u=await upload(e.target.files[0],'image',status);if(u){photo=u;video='';showMedia();}e.target.value='';};
    $('[data-video]',m.el).onchange=async e=>{const u=await upload(e.target.files[0],'video',status);if(u){video=u;photo='';showMedia();}e.target.value='';};
    removeBtn.onclick=()=>{photo='';video='';showMedia();status.textContent=ui('itMediaRemoved');};
    $('[data-cancel]',m.el).onclick=m.close;
    const nameInput=$('[data-name]',m.el),nameErr=$('[data-name-err]',m.el);
    nameInput.addEventListener('input',()=>{if(nameInput.value.trim()){nameErr.hidden=true;nameInput.removeAttribute('aria-invalid');}});
    const saveItem=(onSuccess)=>{
      const name=nameInput.value.trim();
      // Un nom vide n'enregistre rien : le dire, au lieu d'un bouton qui ne répond pas.
      if(!name){nameErr.hidden=false;nameInput.setAttribute('aria-invalid','true');nameInput.focus();return;}
      const validSlots=isFormulaCb.checked?formulaSlots.filter(s=>(s.label||'').trim()||(s.choices&&s.choices.length)).map(s=>({id:s.id||'sl_'+Math.random().toString(36).slice(2,6),label:s.label||ui('itDefaultStep'),min:s.min!=null?s.min:1,max:s.max!=null?s.max:1,choices:(s.choices||[]).map(c=>({itemId:c.itemId,extra:window.KiwiMenuRules.nonnegative(c.extra)}))})):[];
      const p={name,price:+$('[data-price]',m.el).value||0,catId:$('[data-cat]',m.el).value,desc:$('[data-desc]',m.el).value,avail:!!$('[data-avail]',m.el).checked,formulaOnly:!$('[data-standalone]',m.el).checked,showPhotoInFormulas:!!$('[data-formula-choice-photo]',m.el)?.checked,archived:!!x?.archived,photo,video,opts:$$('[data-opt]:checked',m.el).map(e=>e.dataset.opt),formula:validSlots.length?{slots:validSlots}:null};
      x?S().updateItem(x.id,p):S().addItem(p);m.close();render();toast(ui('itSaved'),name);
      if(typeof onSuccess==='function')onSuccess();
    };
    $('[data-save]',m.el).onclick=()=>saveItem();
  }
  /* Repère (KDS emoji) picker. It sat at « left: innerWidth − 390 », off the
     left edge of a phone, said « Aucun repère » in French under EN and AR, and
     stayed open until something was picked: no Escape, no click-away. */
  function emojiPicker(button){
    $$('.rmw-emoji-pop').forEach(x=>x.remove());
    const all=S().optionEmojis?.()||[],p=document.createElement('div'),r=button.getBoundingClientRect();
    p.className='rmw-emoji-pop';p.setAttribute('role','dialog');p.setAttribute('aria-label',ui('ogMarkPick'));
    p.innerHTML=`<button type="button" data-emoji="" class="rmw-none">${esc(ui('ogNoMark'))}</button>${all.map(e=>`<button type="button" data-emoji="${esc(e)}">${esc(e)}</button>`).join('')}`;
    document.body.appendChild(p);
    const w=p.offsetWidth,h=p.offsetHeight;
    p.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+'px';
    p.style.top=(r.bottom+6+h>innerHeight-8?Math.max(8,r.top-6-h):r.bottom+6)+'px';
    const close=()=>{p.remove();document.removeEventListener('pointerdown',away,true);document.removeEventListener('keydown',key,true);};
    const away=e=>{if(!p.contains(e.target)&&!button.contains(e.target))close();};
    const key=e=>{if(e.key==='Escape'){e.stopPropagation();close();button.focus();}};
    setTimeout(()=>{document.addEventListener('pointerdown',away,true);document.addEventListener('keydown',key,true);},0);
    p.onclick=e=>{const b=e.target.closest('[data-emoji]');if(!b)return;const v=b.dataset.emoji||'';button.dataset.value=v;button.innerHTML=v?esc(v):itSvg('add');button.classList.toggle('has',!!v);close();button.focus();};
    p.querySelector('button')?.focus();
  }
  function choiceRow(c){const price=+c?.price||0;return `<div class="rmw-og-row" data-choice data-id="${esc(c?.id||'')}"><button type="button" class="rmw-og-mark${c?.emoji?' has':''}" data-emoji-btn data-value="${esc(c?.emoji||'')}" aria-label="${esc(ui('ogMarkPick'))}">${c?.emoji?esc(c.emoji):itSvg('add')}</button><input class="rmw-rx-in" data-choice-name placeholder="${esc(ui('addChoicePlaceholder'))}" value="${esc(c?.name||'')}" aria-label="${esc(ui('ogChoiceName'))}" autocomplete="off"/><span class="rmw-rx-suffix"><input class="rmw-rx-in" type="number" min="0" step="0.01" inputmode="decimal" data-choice-price value="${price>0?price:''}" placeholder="0" aria-label="${esc(ui('ogSupplement'))}"/><i>MAD</i></span><button class="rmw-rx-del" type="button" data-choice-del aria-label="${esc(ui('ogRemoveChoice'))}">${itSvg('close')}</button></div>`;}
  /* Option group editor (2026-10-12). Two selects, a French-only help line,
     unlabelled price boxes pre-filled with « 0 », and a « Enregistrer » that
     did nothing at all when the name or every choice was empty. Now: the two
     rules are segmented controls on the liquid lens, a sentence says what the
     order screens will enforce (caisse, serveur, QR and the order API all read
     kind and required the same way), and errors sit under what they concern. */
  function openGroup(g){
    recipeStyle();itemStyle();groupStyle();
    const kind=g?.kind==='many'?'many':'one',req=g?.required?'1':'0';
    const seg=(name,val,opts)=>`<div class="rmw-og-seg" role="radiogroup" aria-labelledby="rmw-og-${name}-l" data-og-seg="${name}">${opts.map(([v,l])=>`<label class="rmw-og-segi${v===val?' on':''}"><input type="radio" name="rmw-og-${name}" value="${v}"${v===val?' checked':''}/><span>${esc(l)}</span></label>`).join('')}</div>`;
    const m=modal({title:g?ui('editGroupTitle'):ui('newGroupTitle'),width:680,body:`<div class="rmw-og">
      <section class="rmw-rx-sec">
        <div class="rmw-og-grid">
          <label class="rmw-it-f rmw-og-wide"><span>${esc(ui('groupNameLabel'))}</span><input class="rmw-rx-in" data-name value="${esc(g?.name||'')}" placeholder="${esc(ui('groupNamePlaceholder'))}" autocomplete="off"/><em class="rmw-it-err" data-og-err="name" hidden></em></label>
          <div class="rmw-it-f"><span id="rmw-og-kind-l">${esc(ui('groupTypeLabel'))}</span>${seg('kind',kind,[['one',ui('oneChoice')],['many',ui('manyChoices')]])}</div>
          <div class="rmw-it-f"><span id="rmw-og-req-l">${esc(ui('groupRequiredLabel'))}</span>${seg('req',req,[['0',ui('ogOptional')],['1',ui('ogRequired')]])}</div>
        </div>
        <p class="rmw-og-rule" data-og-rule aria-live="polite"></p>
      </section>
      <section class="rmw-rx-sec">
        <div class="rmw-rx-sec-head"><div><h4>${esc(ui('choicesLabel'))}</h4><p>${esc(ui('ogChoicesHelp'))}</p></div></div>
        <div class="rmw-og-cols" aria-hidden="true"><span>${esc(ui('ogMark'))}</span><span>${esc(ui('ogChoiceName'))}</span><span>${esc(ui('ogSupplement'))}</span><span></span></div>
        <div data-choices>${(g?.choices||[]).map(choiceRow).join('')||choiceRow(null)}</div>
        <em class="rmw-it-err rmw-og-choices-err" data-og-err="choices" hidden></em>
        <button data-activation=write class="rmw-rx-add" type="button" data-choice-add>${itSvg('add')}<span>${esc(ui('addChoiceBtnLabel'))}</span></button>
        <p class="rmw-og-hint">${esc(ui('ogMarkHelp'))}</p>
      </section>
    </div>`,foot:`<button class="kb ghost" data-cancel>${esc(ui('cancelBtn'))}</button><button data-activation=write class="eq-cta-gradient" data-save>${esc(ui('saveBtn'))}</button>`});
    m.el.classList.add('rmw-recipe-modal','rmw-og-modal');
    const wrap=$('[data-choices]',m.el),nameEl=$('[data-name]',m.el);
    const picked=(name)=>$(`input[name="rmw-og-${name}"]:checked`,m.el)?.value;
    const rule=()=>{const many=picked('kind')==='many',must=picked('req')==='1';$('[data-og-rule]',m.el).textContent=ui(many?(must?'ogRuleManyReq':'ogRuleManyOpt'):(must?'ogRuleOneReq':'ogRuleOneOpt'));};
    const setErr=(k,msg)=>{const e=$(`[data-og-err="${k}"]`,m.el);if(e){e.textContent=msg||'';e.hidden=!msg;}if(k==='name'){if(msg)nameEl.setAttribute('aria-invalid','true');else nameEl.removeAttribute('aria-invalid');}};
    rule();
    m.el.addEventListener('change',e=>{const s=e.target.closest('[data-og-seg]');if(!s)return;$$('.rmw-og-segi',s).forEach(l=>l.classList.toggle('on',!!$('input',l).checked));rule();});
    m.el.addEventListener('input',e=>{if(e.target===nameEl&&nameEl.value.trim())setErr('name','');if(e.target.matches('[data-choice-name]')&&e.target.value.trim()){e.target.removeAttribute('aria-invalid');if(!$$('[data-choice-name][aria-invalid="true"]',wrap).length)setErr('choices','');}});
    $('[data-choice-add]',m.el).onclick=()=>{wrap.insertAdjacentHTML('beforeend',choiceRow(null));$('[data-choice-name]',wrap.lastElementChild)?.focus();};
    wrap.onclick=e=>{const del=e.target.closest('[data-choice-del]');if(del){const row=del.closest('[data-choice]');if($$('[data-choice]',wrap).length>1)row.remove();else{row.dataset.id='';$('[data-choice-name]',row).value='';$('[data-choice-price]',row).value='';const b=$('[data-emoji-btn]',row);b.dataset.value='';b.innerHTML=itSvg('add');b.classList.remove('has');$('[data-choice-name]',row).focus();}return;}const b=e.target.closest('[data-emoji-btn]');if(b)emojiPicker(b);};
    $('[data-cancel]',m.el).onclick=m.close;
    $('[data-save]',m.el).onclick=()=>{
      const name=nameEl.value.trim();
      const all=$$('[data-choice]',wrap).map(r=>({el:r,id:r.dataset.id,name:$('[data-choice-name]',r).value.trim(),price:Math.max(0,+$('[data-choice-price]',r).value||0),emoji:$('[data-emoji-btn]',r).dataset.value||''}));
      const unnamed=all.filter(x=>!x.name&&(x.price>0||x.emoji)),rows=all.filter(x=>x.name);
      all.forEach(x=>{const inp=$('[data-choice-name]',x.el);if(unnamed.includes(x))inp.setAttribute('aria-invalid','true');else inp.removeAttribute('aria-invalid');});
      setErr('name',name?'':ui('ogNameRequired'));
      setErr('choices',unnamed.length?ui('ogChoiceUnnamed'):rows.length?'':ui('ogChoicesRequired'));
      if(!name){nameEl.focus();return;}
      if(unnamed.length){$('[data-choice-name]',unnamed[0].el).focus();return;}
      if(!rows.length){$('[data-choice-name]',wrap)?.focus();return;}
      const kindV=picked('kind')==='many'?'many':'one',required=picked('req')==='1';
      let id=g?.id;
      if(g){S().updateOptGroup(id,{name,kind:kindV,required});(g.choices||[]).filter(c=>!rows.some(x=>x.id===c.id)).forEach(c=>S().deleteOptChoice(id,c.id));rows.forEach(x=>x.id?S().updateOptChoice(id,x.id,{name:x.name,price:x.price,emoji:x.emoji}):S().addOptChoice(id,x.name,x.price,x.emoji));}
      else{S().addOptGroup(name);id=D().opts.at(-1)?.id;S().updateOptGroup(id,{kind:kindV,required});rows.forEach(x=>S().addOptChoice(id,x.name,x.price,x.emoji));}
      m.close();render();
    };
    setTimeout(()=>{if(!g)nameEl.focus();},60);
  }
  function groupStyle(){if($('#rmw-og-css'))return;const s=document.createElement('style');s.id='rmw-og-css';s.textContent=`
.rmw-og{display:grid;gap:14px;color:var(--ink)}
.rmw-og-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px 12px;align-items:start}
.rmw-og-wide{grid-column:1/-1}
.rmw-og .rmw-it-f{grid-template-columns:minmax(0,1fr)}
.rmw-og-seg{position:relative;display:flex;gap:2px;width:100%;box-sizing:border-box;padding:3px;border-radius:12px;background:color-mix(in srgb,var(--ink) 6%,var(--rx-field))}
.rmw-og-segi{position:relative;flex:1 1 0;min-width:0;cursor:pointer}
.rmw-og-segi input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.rmw-og-segi span{display:flex;align-items:center;justify-content:center;height:34px;padding:0 10px;border-radius:9px;font:500 13px var(--sans);color:var(--n-600);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color 160ms}
.rmw-og-segi.on span{color:var(--ink);font-weight:600}
.rmw-og-seg:not([data-kw-lens]) .rmw-og-segi.on span{background:var(--surface);box-shadow:0 1px 2px rgba(0,0,0,.06)}
.rmw-og-segi input:focus-visible+span{box-shadow:0 0 0 2px var(--atlas)}
.rmw-og-rule{display:flex;align-items:center;gap:9px;margin:14px 0 0;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--atlas) 7%,var(--rx-field));color:var(--n-700);font-size:12.5px;line-height:1.45}
.rmw-og-rule::before{content:'';flex:none;width:6px;height:6px;border-radius:50%;background:var(--atlas)}
.rmw-og-cols,.rmw-og-row{display:grid;grid-template-columns:44px minmax(0,1fr) 132px 32px;gap:8px;align-items:center}
.rmw-og-cols{padding:0 2px 6px;border-bottom:1px solid var(--n-200);font-size:11px;font-weight:600;color:var(--n-500)}
.rmw-og-row{padding:8px 0;border-bottom:1px solid var(--n-200)}
.rmw-og-mark{width:44px;height:38px;display:grid;place-items:center;padding:0;border:1px dashed var(--n-300);border-radius:10px;background:var(--rx-field);color:var(--n-500);font-size:20px;line-height:1;cursor:pointer;transition:border-color 140ms,color 140ms}
.rmw-og-mark.has{border-style:solid;border-color:var(--n-200)}
.rmw-og-mark svg{width:16px;height:16px;fill:currentColor}
.rmw-og-mark:hover,.rmw-og-mark:focus-visible{border-color:var(--atlas);color:var(--atlas);outline:0}
.rmw-og-row .rmw-rx-suffix .rmw-rx-in{padding-inline-end:42px;text-align:end}
.rmw-og-row .rmw-rx-del svg{width:16px;height:16px;fill:currentColor}
.rmw-og-row .rmw-rx-del:hover{color:#cb5238;background:color-mix(in srgb,#cb5238 9%,transparent)}
.rmw-og .rmw-rx-in[aria-invalid="true"]{border-color:#cb5238;box-shadow:0 0 0 3px color-mix(in srgb,#cb5238 14%,transparent)}
.rmw-og .rmw-it-err[hidden]{display:none}
.rmw-og-choices-err{display:block;margin-top:10px}
.rmw-og-hint{margin:12px 0 0;font-size:11.5px;line-height:1.45;color:var(--n-500)}
/* The picker lives on <body>, outside the sheet: it needs its own opaque surface (the skin's --surface is translucent). */
.rmw-emoji-pop{max-width:calc(100vw - 16px);box-sizing:border-box;background:var(--paper)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
html[data-theme="dark"] .rmw-emoji-pop{background:#151C18!important;border-color:rgba(255,255,255,.1)}
.rmw-emoji-pop button:focus-visible{outline:2px solid var(--atlas);outline-offset:1px}
@media(max-width:620px){.rmw-og-grid{grid-template-columns:1fr}.rmw-og-cols{display:none}.rmw-og-row{grid-template-columns:44px minmax(0,1fr) 32px;grid-template-areas:"mark name del" ". price .";row-gap:8px}.rmw-og-row>.rmw-og-mark{grid-area:mark}.rmw-og-row>[data-choice-name]{grid-area:name}.rmw-og-row>.rmw-rx-suffix{grid-area:price}.rmw-og-row>.rmw-rx-del{grid-area:del}.rmw-og .rmw-rx-in{font-size:16px}}
`;document.head.appendChild(s);}
  const {recipeUnitOptions, recipeIngredientRow, recipeLineInfo, recipeNutrition, recipeSummary, recipeDraft, openRecipe} = window.KiwiMenuWorkspaceParts.recipes({$, $$, esc, ui, venue, cash, cat, t, modal, recipeStyle: (...args)=>recipeStyle(...args), toast, S, render, pct1});
  function confirm(title,run,detail=ui('confirmDeleteDefault')){const m=modal({title,width:440,body:`<p>${esc(detail)}</p>`,foot:`<button class="kb ghost" data-cancel>${esc(ui('cancelBtn'))}</button><button class="kb danger" data-confirm>${esc(ui('delete'))}</button>`});$('[data-cancel]',m.el).onclick=m.close;$('[data-confirm]',m.el).onclick=()=>{run();m.close();render();};}
  let legacyMenuHandler=null;
  function restaurantMenuHandler(){
    /* The sidebar only exposes nav-menu for restaurant venues. Claim the route
     * immediately, even while MenuStore/venue hydration is still in flight, so
     * the legacy renderer can never flash on the first click after login. */
    if(isRestaurant()||document.querySelector('.sidebar nav a[data-nav="menu"]')){show(true);return;}
    if(legacyMenuHandler)return legacyMenuHandler.apply(this,arguments);
  }
  /* ═══════════════ Traductions de la carte (assets/menu-i18n.js) ═══════════════
   * La carte est traduite UNE FOIS par Kiwi AI, entrée par entrée, langue par
   * langue, et seulement pour ce qui manque ou a changé (KiwiMenuI18n.needs) ;
   * le libellé du patron n'est JAMAIS remplacé · la traduction vit à côté
   * (entity.i18n). Déclenchement : automatique 2,5 s après un changement de la
   * carte (import, scan, saisie), et à la main depuis l'onglet « Traductions »
   * où chaque cellule se corrige (une correction n'est plus jamais écrasée).
   * Sans session réelle (démo) : rien ne part sur le réseau. */
  let i18nBusy=false,i18nTimer=0,i18nCooldown=0,i18nProgress='',i18nChooserOpen=false;
  const I18N_BATCH=40;
  // Allumé par défaut ; l'opérateur le coupe dans kiwi-admin (features.menuLangs === false).
  const menuLangFeature=()=>window.KiwiConfig?.features?.menuLangs!==false;
  const menuNutritionFeature=()=>window.KiwiConfig?.features?.menuNutrition!==false;
  const I18N_LANG_LABELS={
    fr:{es:'Espagnol',de:'Allemand',it:'Italien',pt:'Portugais',nl:'Néerlandais',ru:'Russe','zh-Hans':'Chinois simplifié','zh-Hant':'Chinois traditionnel',ja:'Japonais',ko:'Coréen',tr:'Turc',he:'Hébreu',pl:'Polonais',sv:'Suédois',no:'Norvégien',da:'Danois',hi:'Hindi',id:'Indonésien',el:'Grec',uk:'Ukrainien'},
    en:{es:'Spanish',de:'German',it:'Italian',pt:'Portuguese',nl:'Dutch',ru:'Russian','zh-Hans':'Simplified Chinese','zh-Hant':'Traditional Chinese',ja:'Japanese',ko:'Korean',tr:'Turkish',he:'Hebrew',pl:'Polish',sv:'Swedish',no:'Norwegian',da:'Danish',hi:'Hindi',id:'Indonesian',el:'Greek',uk:'Ukrainian'},
    ar:{es:'الإسبانية',de:'الألمانية',it:'الإيطالية',pt:'البرتغالية',nl:'الهولندية',ru:'الروسية','zh-Hans':'الصينية المبسطة','zh-Hant':'الصينية التقليدية',ja:'اليابانية',ko:'الكورية',tr:'التركية',he:'العبرية',pl:'البولندية',sv:'السويدية',no:'النرويجية',da:'الدنماركية',hi:'الهندية',id:'الإندونيسية',el:'اليونانية',uk:'الأوكرانية'},
  };
  function menuLangLabel(code){const l=String(document.documentElement?.lang||'fr').toLowerCase().split('-')[0];return (I18N_LANG_LABELS[l]||I18N_LANG_LABELS.fr)[code]||code;}
  const realSession=()=>{try{return !!(window.KiwiEnv&&window.KiwiEnv.isReal&&window.KiwiEnv.isReal());}catch(_){return false;}};
  function i18nChunks(need){
    const out=[];let cur={cats:[],items:[],opts:[],n:0};
    const push=(k,e,w)=>{if(cur.n&&cur.n+w>I18N_BATCH){out.push(cur);cur={cats:[],items:[],opts:[],n:0};}cur[k].push(e);cur.n+=w;};
    (need.cats||[]).forEach(c=>push('cats',c,1+(c.sub||[]).length));
    (need.opts||[]).forEach(g=>push('opts',g,1+(g.choices||[]).length));
    (need.items||[]).forEach(it=>push('items',it,1));
    if(cur.n)out.push(cur);
    return out;
  }
  function i18nRefreshPanel(){if(tab==='i18n'){const p=$('[data-rmw-panel]');if(p)p.innerHTML=i18nPanel();}}
  async function ensureTranslations(o){
    o=o||{};
    const M=window.KiwiMenuI18n;if(!M||i18nBusy)return;
    if(!realSession()){if(!o.silent)toast(ui('i18nDemo'),'','info');return;}
    if(o.silent&&Date.now()<i18nCooldown)return;
    const d=D();
    if(!d.items.length&&!d.cats.length){if(!o.silent)toast(ui('i18nEmpty'),'','info');return;}
    const targets=(o.langs&&o.langs.length?o.langs:(menuLangFeature()?M.langs(d):M.LANGS)).map(M.asLang).filter(Boolean);
    const need=M.needs(d,targets,{force:o.force||false});
    const total=targets.reduce((n,l)=>n+(need[l]?need[l].count:0),0);
    if(!total){if(!o.silent)toast(ui('i18nUpToDate'),'','success');return;}
    i18nBusy=true;let written=0,failed='';
    const slug=venue()||'';
    i18nProgress=ui('i18nBusy',{n:total});i18nRefreshPanel();
    try{
      for(const lang of targets){
        if(!need[lang]||!need[lang].count)continue;
        for(const chunk of i18nChunks(need[lang])){
          let res=null;
          try{
            res=await fetch('/api/ai/menu-translate',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
              body:JSON.stringify({merchant:slug,targetLang:lang,cats:chunk.cats,items:chunk.items,opts:chunk.opts})});
          }catch(_){failed='network';break;}
          if(res.status===429){failed='quota';break;}
          let data=null;try{data=await res.json();}catch(_){}
          if(!res.ok||!data||!data.ok){failed=(data&&(data.error||data.reason))||'error';break;}
          // Le store écrit entity.i18n et republie la carte (menu-catalog.js → schedulePublish).
          written+=S().setI18n(lang,data,{force:o.force||false})||0;
        }
        if(failed)break;
      }
    }finally{i18nBusy=false;i18nProgress='';}
    if(failed){
      i18nCooldown=Date.now()+(failed==='quota'?6*3600e3:10*60e3);
      if(!o.silent)toast(failed==='quota'?ui('i18nQuota'):ui('i18nError'),'','warn');
    }else if(!o.silent){toast(ui('i18nDone',{n:written}),'','success');}
    if(document.body.classList.contains('page-menu'))render();
  }
  function scheduleAutoTranslate(){
    clearTimeout(i18nTimer);
    i18nTimer=setTimeout(()=>{if(isRestaurant())ensureTranslations({silent:true});},2500);
  }
  function i18nPanel(){
    i18nStyle();
    const M=window.KiwiMenuI18n,d=D();
    if(!M)return `<div class="rmw-empty"><p>${esc(ui('reloadPage'))}</p></div>`;
    const L=menuLangFeature()?M.langs(d):M.LANGS,sum=M.summary(d,L);
    const available=M.EXTRA.filter(l=>!L.includes(l));
    const picker=menuLangFeature()?`<div class="rmw-lang-select"><button type="button" class="rmw-lang-trigger" data-action="rmw-i18n-toggle" aria-expanded="${i18nChooserOpen?'true':'false'}"${available.length?'':' disabled'}><span class="rmw-lang-trigger-plus">+</span><span><b>${esc(ui('i18nAddLang'))}</b><small>${esc(ui('i18nAvailable',{n:available.length}))}</small></span></button>${i18nChooserOpen&&available.length?`<section class="rmw-lang-popover"><div class="rmw-lang-popover-head"><div><b>${esc(ui('i18nChooseLang'))}</b><span>${esc(ui('i18nChooseHint'))}</span></div><button type="button" data-action="rmw-i18n-toggle">${esc(ui('i18nClosePicker'))}</button></div><div class="rmw-lang-grid">${available.map(l=>`<button data-activation=write type="button" data-action="rmw-i18n-add" data-arg="${l}"><span class="rmw-lang-code">${esc(l)}</span><span class="rmw-lang-copy"><b>${esc(menuLangLabel(l))}</b><small dir="${M.rtl(l)?'rtl':'ltr'}">${esc(M.NAMES[l])}</small></span><span class="rmw-lang-add">+</span></button>`).join('')}</div></section>`:''}</div>`:'';
    const head=`<div class="rmw-i18n-head"><div><div class="rmw-i18n-title">${esc(ui('i18nTitle'))}</div><p class="rmw-i18n-hint">${esc(ui('i18nHint'))}</p></div><div class="rmw-i18n-acts"><button class="btn-slim" data-action="rmw-i18n-fill"${i18nBusy?' disabled':''}>${esc(ui('i18nFill'))}</button><button class="btn-slim" data-action="rmw-i18n-redo"${i18nBusy?' disabled':''}>${esc(ui('i18nRedo'))}</button></div></div>${picker}<p class="rmw-i18n-hint" role="note">${esc(ui('i18nReview'))}</p>`;
    const stats=`<div class="rmw-i18n-stats">${L.map(l=>{const s=sum[l],extra=M.EXTRA.includes(l),label=extra?menuLangLabel(l):(M.NAMES[l]||l),native=extra&&M.NAMES[l]!==label?M.NAMES[l]:'';return `<div class="rmw-i18n-stat"><span class="rmw-i18n-stat-name"><b>${esc(label)}</b>${native?`<small dir="${M.rtl(l)?'rtl':'ltr'}">${esc(native)}</small>`:''}</span><span>${s.ok+s.manual}/${s.total} ${esc(ui('i18nStatusOk'))}</span>${s.unreviewed?`<span class="is-stale">${s.unreviewed} ${esc(ui('i18nStatusUnreviewed'))}</span>`:''}${s.stale?`<span class="is-stale">${s.stale} ${esc(ui('i18nStatusStale'))}</span>`:''}${s.missing?`<span class="is-missing">${s.missing} ${esc(ui('i18nStatusMissing'))}</span>`:''}${extra?`<button type="button" data-action="rmw-i18n-remove" data-arg="${l}" title="${esc(ui('i18nRemoveLang'))}" aria-label="${esc(ui('i18nRemoveLang'))} ${esc(label)}">×</button>`:''}</div>`;}).join('')}${i18nProgress?`<div class="rmw-i18n-busy"><span class="rmw-i18n-spin" aria-hidden="true"></span>${esc(i18nProgress)}</div>`:''}</div>`;
    const stLabel=(st)=>ui('i18nStatus'+st.charAt(0).toUpperCase()+st.slice(1));
    const cell=(kind,id,sub,e,l,field)=>{
      const x=e.i18n&&e.i18n[l];const st=M.status(e,l);
      const val=x?(field==='desc'?(x.desc||''):(x.name||'')):'';
      return `<td class="st-${st}"><input type="text" data-rmw-i18n data-kind="${kind}" data-id="${esc(id)}" data-sub="${esc(sub||'')}" data-lang="${l}" data-field="${field}" value="${esc(val)}" placeholder="${st==='stale'?esc(stLabel('stale')):''}" title="${esc(stLabel(st))}" dir="${M.rtl(l)?'rtl':'ltr'}" />${st==='unreviewed'||st==='stale'?`<span>${esc(stLabel(st))}</span><button type="button" data-action="rmw-i18n-approve" data-kind="${kind}" data-id="${esc(id)}" data-sub="${esc(sub||'')}" data-lang="${l}">${esc(ui('i18nApprove'))}</button>`:''}</td>`;
    };
    const row=(kind,id,sub,e,mark,field)=>`<tr><td class="rmw-i18n-src">${mark?`<span class="rmw-i18n-kind">${esc(mark)}</span>`:''}${esc(field==='desc'?(e.desc||''):e.name)}</td>${L.map(l=>cell(kind,id,sub,e,l,field||'name')).join('')}</tr>`;
    const rows=[];
    const section=(t)=>rows.push(`<tr class="rmw-i18n-section"><td colspan="${1+L.length}">${esc(t)}</td></tr>`);
    if(d.cats.length){section(ui('i18nSections'));d.cats.forEach(c=>{rows.push(row('cat',c.id,'',c,''));(c.sub||[]).forEach(s=>rows.push(row('sub',c.id,s.id,s,'↳')));});}
    const items=d.items.filter(x=>!x.archived);
    if(items.length){section(ui('i18nItems'));items.forEach(it=>{rows.push(row('item',it.id,'',it,''));if(it.desc)rows.push(row('item',it.id,'',it,ui('i18nDesc'),'desc'));if(it.allergens?.length)rows.push(`<tr><td>${esc(it.allergens.map(k=>UI_I18N.fr['allergen_'+k]||k).join(' · '))}</td>${L.map(l=>`<td>${esc(it.allergens.map(k=>(UI_I18N[l]||UI_I18N.en)['allergen_'+k]||k).join(' · '))}</td>`).join('')}</tr>`);});}
    if((d.opts||[]).length){section(ui('i18nOptions'));d.opts.forEach(g=>{rows.push(row('opt',g.id,'',g,''));(g.choices||[]).forEach(c=>rows.push(row('choice',g.id,c.id,c,'↳')));});}
    if(!rows.length)return head+`<div class="rmw-empty"><p>${esc(ui('i18nEmpty'))}</p></div>`;
    return head+stats+`<div class="rmw-i18n-wrap" tabindex="0" role="region" aria-label="${esc(ui('i18nTitle'))}"><table class="rmw-i18n"><thead><tr><th>${esc(ui('i18nOriginal'))}</th>${L.map(l=>`<th>${esc(M.NAMES[l]||l)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  function onI18nEdit(input){
    const k=input.dataset;const v=input.value;
    const patch=k.field==='desc'?{desc:v}:{name:v};
    S().setI18nEntry(k.kind,k.id,k.sub||null,k.lang,patch);
    i18nRefreshPanel();
  }
  function i18nStyle(){if($('#rmw-i18n-css'))return;const s=document.createElement('style');s.id='rmw-i18n-css';s.textContent=`
.rmw-i18n-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:0 0 14px}
.rmw-i18n-title{font:650 16px var(--sans);letter-spacing:-.01em;color:var(--ink)}
.rmw-i18n-hint{max-width:70ch;margin:4px 0 0;font-size:12px;line-height:1.45;color:var(--n-500)}
.rmw-i18n-acts{display:flex;gap:8px;flex-wrap:wrap}
.rmw-lang-select{margin:0 0 16px}
.rmw-lang-trigger{display:inline-flex;align-items:center;gap:10px;min-height:48px;padding:7px 14px 7px 8px;border:1px solid color-mix(in srgb,var(--atlas) 30%,var(--n-200));border-radius:13px;background:color-mix(in srgb,var(--atlas) 7%,var(--surface));color:var(--ink);text-align:start;cursor:pointer}
.rmw-lang-trigger:hover{border-color:var(--atlas);background:color-mix(in srgb,var(--atlas) 11%,var(--surface))}
.rmw-lang-trigger:disabled{opacity:.48;cursor:default}
.rmw-lang-trigger-plus{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:var(--atlas);color:var(--paper);font:500 22px/1 var(--sans)}
.rmw-lang-trigger>span:last-child{display:grid;gap:2px}
.rmw-lang-trigger b{font:650 12px var(--sans)}
.rmw-lang-trigger small{color:var(--n-500);font:500 10px var(--sans)}
.rmw-lang-popover{margin-top:9px;padding:14px;border:1px solid var(--n-200);border-radius:16px;background:var(--paper-soft);box-shadow:0 16px 40px rgba(0,0,0,.12)}
.rmw-lang-popover-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}
.rmw-lang-popover-head>div{display:grid;gap:3px}
.rmw-lang-popover-head b{font:650 13px var(--sans);color:var(--ink)}
.rmw-lang-popover-head span{font-size:11px;color:var(--n-500)}
.rmw-lang-popover-head button{border:0;background:transparent;color:var(--n-500);font:600 11px var(--sans);cursor:pointer}
.rmw-lang-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:7px}
.rmw-lang-grid>button{display:grid;grid-template-columns:34px 1fr 24px;align-items:center;gap:9px;min-height:56px;padding:7px 9px;border:1px solid var(--n-200);border-radius:11px;background:var(--surface);color:var(--ink);text-align:start;cursor:pointer}
.rmw-lang-grid>button:hover{border-color:var(--atlas);background:color-mix(in srgb,var(--atlas) 7%,var(--surface));transform:translateY(-1px)}
.rmw-lang-code{display:grid;place-items:center;min-height:30px;border-radius:8px;background:var(--paper-soft);color:var(--n-500);font:650 9px var(--mono);text-transform:uppercase}
.rmw-lang-copy{display:grid;gap:2px;min-width:0}
.rmw-lang-copy b{overflow:hidden;color:var(--ink);font:650 12px var(--sans);text-overflow:ellipsis;white-space:nowrap}
.rmw-lang-copy small{overflow:hidden;color:var(--n-500);font:500 11px var(--sans);text-overflow:ellipsis;white-space:nowrap}
.rmw-lang-add{display:grid;place-items:center;width:23px;height:23px;border-radius:7px;background:color-mix(in srgb,var(--atlas) 12%,var(--surface));color:var(--atlas);font:600 16px/1 var(--sans)}
.rmw-i18n-stats{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
.rmw-i18n-stat{display:flex;gap:10px;align-items:center;padding:8px 9px 8px 13px;border:1px solid var(--n-200);border-radius:11px;background:var(--surface);font-size:12px;color:var(--n-500)}
.rmw-i18n-stat b{color:var(--ink);font-weight:650}
.rmw-i18n-stat-name{display:grid;gap:1px}
.rmw-i18n-stat-name small{color:var(--n-500);font:500 10px var(--sans)}
.rmw-i18n-stat>button{display:grid;place-items:center;width:25px;height:25px;margin-inline-start:2px;border:0;border-radius:7px;background:var(--paper-soft);color:var(--n-500);font:500 15px/1 var(--sans);cursor:pointer}
.rmw-i18n-stat>button:hover{background:color-mix(in srgb,#c94835 12%,var(--surface));color:#b94b38}
.rmw-i18n-stat .is-stale{color:#a77617}.rmw-i18n-stat .is-missing{color:#b94b38}
.rmw-i18n-busy{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--atlas)}
.rmw-i18n-spin{width:14px;height:14px;border:2px solid var(--n-200);border-top-color:var(--atlas);border-radius:50%;animation:rmw-spin .8s linear infinite}
.rmw-i18n-wrap{overflow:auto;border:1px solid var(--n-200);border-radius:13px;background:var(--surface)}
table.rmw-i18n{width:100%;border-collapse:collapse;min-width:760px;font-size:12.5px}
table.rmw-i18n th{position:sticky;top:0;z-index:1;padding:10px 12px;text-align:start;font:700 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--n-500);background:var(--paper-soft);border-bottom:1px solid var(--n-200)}
table.rmw-i18n td{padding:4px 8px;border-bottom:1px solid var(--n-200);vertical-align:middle}
table.rmw-i18n tr:last-child td{border-bottom:0}
table.rmw-i18n .rmw-i18n-section td{padding:10px 12px 6px;font:700 10px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--atlas);background:color-mix(in srgb,var(--atlas) 5%,var(--surface))}
table.rmw-i18n .rmw-i18n-src{min-width:180px;max-width:300px;padding-inline-start:12px;color:var(--ink);font-weight:550}
.rmw-i18n-kind{display:inline-block;margin-inline-end:7px;color:var(--n-500);font-weight:500}
table.rmw-i18n input{width:100%;min-width:170px;height:34px;padding:0 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--ink);font:500 12.5px var(--sans)}
table.rmw-i18n input:hover{border-color:var(--n-200)}
table.rmw-i18n input:focus{outline:0;border-color:var(--atlas);background:var(--paper-soft)}
table.rmw-i18n td.st-missing input{background:color-mix(in srgb,#b94b38 6%,transparent)}
table.rmw-i18n td.st-stale input{background:color-mix(in srgb,#a77617 8%,transparent)}
table.rmw-i18n td.st-manual input{border-inline-start:3px solid var(--atlas)}
@media(max-width:700px){.rmw-lang-trigger{width:100%}.rmw-lang-popover{padding:10px}.rmw-lang-popover-head{align-items:center}.rmw-lang-popover-head span{display:none}.rmw-lang-grid{grid-template-columns:1fr 1fr}.rmw-lang-grid>button{grid-template-columns:30px 1fr 22px;min-height:52px;padding:6px}.rmw-lang-code{font-size:11px}}
@media(max-width:430px){.rmw-lang-grid{grid-template-columns:1fr}}
`;document.head.appendChild(s);}
  function wire(){
    const H=window.Kiwi?.handlers;if(!H)return false;
    H['rmw-section-actions']=()=>openSectionActions();
    H['rmw-tab']=e=>{const k=e.dataset.tab;if(ANALYSIS_TABS[k]&&openAnalysis(k))return;if(ANALYSIS_TABS[k])return;setTab(k);render();};
    H['rmw-tab-pick']=()=>openTabPicker();
    H['rmw-sales-period']=e=>{const k=e.dataset.period;if(!SALES_PRESETS.includes(k))return;salesPeriod=k;try{localStorage.setItem('kiwiMenuSalesPeriod',k);}catch(_){}if(analysisActive())window.KiwiFinance.render();};
    H['rmw-hours-period']=e=>{hoursPeriod=e.dataset.period;if(analysisActive())window.KiwiFinance.render();else render();};
    H['rmw-cat-filter']=e=>{filter=e.dataset.cat;subFilter=null;render();};
    H['rmw-cat-move']=(_e,arg)=>{const[id,delta]=String(arg||'').split('::');S().moveCategory(id,+delta);};
    H['rmw-sub-filter']=e=>{subFilter=e.dataset.sub||null;render();};
    H['rmw-sub-add']=(_e,cid)=>ask(ui('newSubcategoryTitle'),ui('subNamePlaceholder'),'',v=>{S().addSubcategory(cid||filter,v);subFilter=null;});
    H['rmw-sub-rename']=(_e,arg)=>{const[cid,sid]=String(arg||'').split('::'),s=(cat(cid)?.sub||[]).find(x=>x.id===sid);if(s)ask(ui('renameSubcategoryTitle'),ui('newNameLabel'),s.name,v=>S().renameSubcategory(cid,sid,v));};
    H['rmw-sub-delete']=(_e,arg)=>{const[cid,sid]=String(arg||'').split('::'),s=(cat(cid)?.sub||[]).find(x=>x.id===sid),n=D().items.filter(x=>x.catId===cid&&x.subId===sid).length;if(s)confirm(ui('deleteSubcategoryConfirm', { name: s.name }),()=>{S().deleteSubcategory(cid,sid);subFilter=null;},ui('deleteSubcategoryDesc', { n }));};
    H['rmw-classify']=(_e,cid)=>openClassify(cid||filter);
    H['rmw-cat-add']=()=>openCategory(null);
    H['rmw-cat-edit']=(_e,id)=>{const c=cat(id);if(c)openCategory(c);};
    H['rmw-cat-delete']=(_e,id)=>{const c=cat(id),n=D().items.filter(x=>x.catId===id).length;if(c)confirm(ui('deleteCategoryConfirm', { name: c.name }),()=>{S().deleteCategory(id);filter='all';subFilter=null;},ui('deleteCategoryDesc', { n }));};
    H['rmw-item-add']=()=>openItem(null);
    H['rmw-item-edit']=(_e,id)=>openItem(item(id));
    H['rmw-item-more']=(_e,id)=>{openItemMenu=openItemMenu===id?null:id;render();};
    H['rmw-item-avail']=(_e,id)=>{const x=item(id);if(x&&!x.archived)S().updateItem(id,{avail:x.avail===false});};
    H['rmw-item-archive']=(_e,id)=>{const x=item(id);openItemMenu=null;if(x)S().updateItem(id,{archived:!x.archived});};
    H['rmw-item-delete']=(_e,id)=>{const x=item(id);openItemMenu=null;if(x)confirm(ui('deleteItemConfirm', { name: x.name }),()=>S().deleteItem(id));};
    H['rmw-group-add']=()=>openGroup(null);
    H['rmw-group-edit']=(_e,id)=>openGroup(group(id));
    H['rmw-group-delete']=(_e,id)=>{const g=group(id);if(g)confirm(ui('deleteGroupConfirm', { name: g.name }),()=>S().deleteOptGroup(id));};
    H['rmw-station-add']=()=>ask(ui('addStationTitle'),ui('stationNameLabel'),'',v=>S().addStation(v));
    H['rmw-station-edit']=(_e,id)=>ask(ui('renameStationTitle'),ui('stationNameLabel'),station(id)?.name,v=>S().renameStation(id,v));
    H['rmw-station-delete']=(_e,id)=>confirm(ui('deleteStationConfirm', { name: station(id)?.name||ui('stationDefault') }),()=>S().deleteStation(id));
    H['rmw-recipe-edit']=(_e,id)=>{const x=item(id);if(x)openRecipe(x);};
    H['rmw-nutrition-filter']=(_e,k)=>{nutriFilter=k||'all';render();};
    H['rmw-nutrition-hide']=(_e,id)=>{const x=item(id);if(!x)return;S().updateItem(id,{hideNutrition:x.hideNutrition!==true});render();toast(ui('nutritionTitle'),x.hideNutrition?ui('nutritionVisibleToggle'):ui('nutritionHiddenToggle'));};
    H['rmw-reactivate']=(_e,id)=>{S().updateItem(id,{avail:true});render();};
    H['rmw-menu-scan']=()=>{if(window.KiwiMenuScan?.open)window.KiwiMenuScan.open({onDone:()=>render()});else window.Kiwi?.toast?.(ui('scanUnavailable'),{type:'warn',desc:ui('reloadPage')});};
    H['rmw-menu-translate']=()=>{setTab('i18n');render();};
    H['rmw-i18n-approve']=(el)=>{const k=el.dataset;S().setI18nEntry(k.kind,k.id,k.sub||null,k.lang,{});i18nRefreshPanel();};
    H['rmw-i18n-fill']=()=>ensureTranslations({silent:false});
    H['rmw-i18n-redo']=()=>confirm(ui('i18nRedoConfirm'),()=>{S().clearI18n(null,true);ensureTranslations({silent:false,force:true});},ui('i18nRedoDesc'));
    H['rmw-i18n-toggle']=()=>{i18nChooserOpen=!i18nChooserOpen;i18nRefreshPanel();};
    H['rmw-i18n-add']=(_e,lang)=>{const M=window.KiwiMenuI18n,l=M?.asLang(lang);if(!l||M.LANGS.includes(l))return;i18nChooserOpen=false;S().setLanguages(M.langs({langs:M.langs(D()).concat(l)}));render();ensureTranslations({silent:false,langs:[l]});};
    H['rmw-i18n-remove']=(_e,lang)=>{const M=window.KiwiMenuI18n,l=M?.asLang(lang);if(!l||M.LANGS.includes(l))return;const run=()=>{S().clearI18n(l,false);S().setLanguages(M.langs({langs:M.langs(D()).filter(x=>x!==l)}));render();};const s=M.summary(D(),[l])[l];if(s&&s.manual)confirm(ui('i18nRemoveConfirm'),run,ui('i18nRemoveManual',{n:s.manual}));else run();};
    if(H['nav-menu']!==restaurantMenuHandler){legacyMenuHandler=H['nav-menu']||legacyMenuHandler;H['nav-menu']=restaurantMenuHandler;}
    return true;
  }
  document.addEventListener('click',e=>{if(openItemMenu&&!e.target.closest('[data-rmw-menu-root]')){openItemMenu=null;if(document.body.classList.contains('page-menu'))render();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&openItemMenu){openItemMenu=null;if(document.body.classList.contains('page-menu'))render();}});
  function bind(){if(uiBound)return;uiBound=true;document.addEventListener('input',e=>{if(e.target.matches('[data-rmw-search]')){query=e.target.value;const p=$('[data-rmw-panel]');if(!p)return;/* Le panneau est reconstruit en entier a chaque frappe : le champ qui porte
     le focus est detruit, la saisie s'arretait donc apres une seule lettre.
     On rend le focus au nouveau champ en replacant le curseur ou il etait. */
const pos=e.target.selectionStart;const html=menuPanel();if(window.KiwiCatalogUI)window.KiwiCatalogUI.replace(p,html);else p.innerHTML=html;const next=$('[data-rmw-search]',p);if(next){next.focus();try{next.setSelectionRange(pos,pos);}catch(_){}}}});document.addEventListener('change',e=>{if(e.target.matches('[data-rmw-route]')){S().setCategoryStation(e.target.dataset.rmwRoute,e.target.value);render();}else if(e.target.matches('[data-rmw-i18n]')){onI18nEdit(e.target);}});window.addEventListener('click',e=>{const control=e.target.closest?.('[data-action^="rmw-"]');if(control){wire();let handler=window.Kiwi?.handlers?.[control.dataset.action];if(control.dataset.action==='rmw-formula-duplicate'&&typeof handler!=='function')handler=(_el,id)=>{const before=new Set(D().items.map(it=>it.id));S().duplicateItem(id);const copy=D().items.find(it=>!before.has(it.id));if(copy)openItem(copy);};if(typeof handler==='function'){e.preventDefault();e.stopImmediatePropagation();handler(control,control.dataset.arg);return;}}const a=e.target.closest?.('[data-nav="menu"]');if(a){e.preventDefault();show(true);}},true);}
  const {style, nutritionStyle, shellStyle, searchStyle, recipeStyle, itemStyle, performanceStyle, hoursStyle} = window.KiwiMenuWorkspaceParts.styles({$});
  function catalogSheet(title, actions){
    const m=modal({title,width:480,body:`<div class="catalog-sheet">${actions.map(a=>`<button type="button" class="${a.danger?'danger':''}" data-catalog-action="${esc(a.id)}">${catalogIcon(a.icon||'menu')}<span${a.key?` data-i18n="catalog.${esc(a.key)}"`:''}>${esc(a.label)}</span></button>`).join('')}</div>`});
    m.el.querySelectorAll('[data-catalog-action]').forEach(button=>button.onclick=()=>{const action=actions.find(a=>a.id===button.dataset.catalogAction);m.close();action?.run();});
  }
  function openSectionActions(){
    const selected=filter==='all'?null:cat(filter);
    const actions=[{id:'new',icon:'category',label:ui('newSection').replace(/^\+\s*/,''),run:()=>openCategory(null)},
      {id:'reorder',key:'reorder',icon:'swap_horiz',label:catalogText('reorder','Réordonner les sections'),run:openSectionReorder}];
    if(selected)actions.push({id:'rename',icon:'tune',label:ui('renameSection'),run:()=>openCategory(selected)},
      {id:'delete',icon:'delete',label:ui('deleteSection'),danger:true,run:()=>window.Kiwi.handlers['rmw-cat-delete'](null,selected.id)});
    catalogSheet(catalogText('sectionActions','Actions des sections'),actions);
  }
  function openSectionReorder(){
    const m=modal({title:catalogText('reorder','Réordonner les sections'),width:560,body:'<div class="catalog-reorder"></div>',foot:`<button class="kb primary" data-catalog-done>${esc(ui('doneBtn'))}</button>`});
    const list=m.el.querySelector('.catalog-reorder');
    const move=(id,position)=>{const at=D().cats.findIndex(c=>c.id===id),delta=position-at;for(let i=0;i<Math.abs(delta);i++)S().moveCategory(id,Math.sign(delta));draw();};
    const draw=()=>{
      const top=list.scrollTop;
      list.innerHTML=D().cats.map((c,i)=>`<div class="catalog-reorder-row" data-reorder-id="${esc(c.id)}"><button class="catalog-more catalog-drag" type="button" aria-label="${esc(catalogText('moveSection','Déplacer la section'))}: ${esc(t(c.name))}">${catalogIcon('menu')}</button><strong>${esc(t(c.name))}</strong><select data-kiwi-native-select aria-label="${esc(catalogText('position','Position'))}: ${esc(t(c.name))}">${D().cats.map((_,j)=>`<option value="${j}"${i===j?' selected':''}>${j+1}</option>`).join('')}</select></div>`).join('');
      list.scrollTop=top;
      list.querySelectorAll('[data-reorder-id]').forEach(row=>{
        row.querySelector('select').onchange=e=>move(row.dataset.reorderId,+e.target.value);
        const handle=row.querySelector('button');let destination=null;
        handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();destination=null;handle.setPointerCapture(e.pointerId);};
        handle.onpointermove=e=>{if(!handle.hasPointerCapture(e.pointerId))return;e.preventDefault();
          const rows=[...list.children];const nearest=rows.reduce((best,r)=>Math.abs(e.clientY-(r.getBoundingClientRect().top+r.offsetHeight/2))<Math.abs(e.clientY-(best.getBoundingClientRect().top+best.offsetHeight/2))?r:best,rows[0]);
          rows.forEach(r=>r.classList.toggle('catalog-drop',r===nearest));destination=rows.indexOf(nearest);
          const bounds=list.getBoundingClientRect();if(e.clientY>bounds.bottom-35)list.scrollTop+=10;else if(e.clientY<bounds.top+35)list.scrollTop-=10;
        };
        handle.onpointerup=e=>{if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);if(destination!==null)move(row.dataset.reorderId,destination);};
        handle.onpointercancel=()=>{destination=null;list.querySelectorAll('.catalog-drop').forEach(r=>r.classList.remove('catalog-drop'));};
      });
    };
    draw();m.el.querySelector('[data-catalog-done]').onclick=m.close;
  }
  function openCardActions(x){
    catalogSheet(t(x.name),[
      {id:'edit',icon:'tune',label:ui('viewAndEdit'),run:()=>openItem(item(x.id))},
      ...(!x.archived?[{id:'availability',icon:'visibility',label:x.avail===false?ui('reactivate'):ui('unavailableBadge'),run:()=>S().updateItem(x.id,{avail:x.avail===false})}]:[]),
      {id:'archive',icon:'inventory_2',label:x.archived?ui('restore'):ui('archive'),run:()=>S().updateItem(x.id,{archived:!x.archived})},
      ...(x.formula?[{id:'reuse',icon:'folder_copy',label:ui('reuse'),run:()=>window.Kiwi.handlers['rmw-formula-duplicate'](null,x.id)}]:[]),
      {id:'delete',icon:'delete',label:ui('delete'),danger:true,run:()=>confirm(ui('deleteItemConfirm',{name:x.name}),()=>S().deleteItem(x.id))}
    ]);
  }
  function directCardAction(e){
    const control=e.target.closest?.('[data-rmw-command]');if(!control)return;
    const x=item(control.dataset.arg);if(!x)return;
    e.preventDefault();e.stopPropagation();
    if(control.dataset.rmwCommand==='edit')openItem(x);
    if(control.dataset.rmwCommand==='actions')openCardActions(x);
    if(control.dataset.rmwCommand==='avail'&&!x.archived)S().updateItem(x.id,{avail:x.avail===false});
  }
  let booted=false,storeBound=false,uiBound=false;
  function boot(){
    if(!window.Kiwi?.handlers){setTimeout(boot,50);return;}
    if(!booted){booted=true;style();nutritionStyle();performanceStyle();hoursStyle();bind();}
    /* Wire navigation before waiting for MenuStore. This closes the startup
     * window in which venues.js could still send the first click to its old UI. */
    wire();
    /* Existing composed menus are the saved templates: reuse makes an
     * independent copy with the same stages, choices, extras and options, then
     * opens that copy immediately so only its name/price need adapting. */
    window.Kiwi.handlers['rmw-formula-duplicate']=(_e,id)=>{const before=new Set(D().items.map(it=>it.id));S().duplicateItem(id);const copy=D().items.find(it=>!before.has(it.id));if(copy)openItem(copy);};
    /* Coût simple → brouillon : l'éditeur de recette s'ouvre pré-rempli ; rien
       n'est écrit avant son bouton Enregistrer. */
    const recipeFromSheet=(id,seed,from)=>{const x=item(id);if(!x||!seed||!window.KiwiRestaurantRecipes)return false;openRecipe(x,seed,from||{});return true;};
    window.KiwiRestaurantMenuWorkspace={show,render,isRestaurant,recipeFromSheet,analysis:{
      performance(){style();performanceStyle();hoursStyle();return `<div class="rmw-analysis-panel">${performancePanel()}</div>`;},
      hours(){style();performanceStyle();hoursStyle();return `<div class="rmw-analysis-panel">${hoursPanel()}</div>`;},
      sales(){style();performanceStyle();hoursStyle();salesStyle();return `<div class="rmw-analysis-panel">${salesPanel()}</div>`;},
      /* Le registre et le coût par plat que lit la Performance : la vue
         d'ensemble d'« Analyse du menu » les lit aussi, pour ne jamais
         afficher une autre marge que celle de l'onglet d'à côté. */
      ledger(w){return menuLedger(w);},
      /* Les quadrants et leurs deux seuils, tels que la matrice les trace. */
      /* Souvent pris ensemble, tel que la section l'affiche. */
      pairs(days=30){const q=pairsData(days);return {tickets:q.tickets,enough:q.enough,min:q.min,pairs:q.pairs.map(x=>({from:x.from.id,to:x.to.id,together:x.together,share:x.share,lift:x.lift}))};},
      quadrants(days=30){const p=performanceData(days);return {popularFrom:p.medQty,averageContribution:p.medProfit,items:p.measured.map(x=>({id:x.item?.id??x.id??null,name:x.item?.name??x.name??'',qty:x.qty,unitProfit:x.unitProfit,quadrant:x.quadrant}))};},
      insights(){const p=performanceData(30),est=costEstimates();return perfInsights(p,est).map(x=>({key:x.key,text:x.text,item:x.item?x.item.id:null}));},
      costOf(item){const hit=recipeCostResolver([{item}]).of({item});if(hit)return hit;try{return window.KiwiCost?.of?.({kind:'menu',id:item.id,name:item.name})||null;}catch(_){return null;}}
    }};
    if(!S()){setTimeout(boot,50);return;}
    if(!storeBound){storeBound=true;const refresh=()=>{if(document.body.classList.contains('page-menu')&&isRestaurant())render();};S().subscribe(refresh);S().subscribe(scheduleAutoTranslate);window.KiwiSales?.subscribe?.(refresh);window.KiwiRestaurantRecipes?.subscribe?.(refresh);window.KiwiHours?.subscribe?.(refresh);window.KiwiVenue?.subscribe?.(()=>{hoursPeriod=null;if(document.body.classList.contains('page-menu')&&isRestaurant())show();});try{window.addEventListener('kiwi:langchange',()=>{if(document.body.classList.contains('page-menu')&&isRestaurant())render();});}catch(_){}}
    if(document.body.classList.contains('page-menu')&&isRestaurant())show();
  }
  /* The legacy menu initializes at DOMContentLoaded. Waiting for window.load
   * left it visible until every low-priority asset had finished, which is why
   * a restaurant briefly saw the old screen (and sometimes had to revisit the
   * route). Run immediately after the legacy DOMContentLoaded listener, before
   * the first paint, then re-assert the handler at load because venues.js also
   * performs a final compatibility rewire there. */
  bind();
  document.addEventListener('click',directCardAction,true);
  document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches?.('[data-rmw-card-edit]'))directCardAction(e);},true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('load',boot,{once:true});
})();
