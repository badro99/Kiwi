/* Kiwi · Carte : recipes. Installation inerte, aucun accès au DOM au chargement. */
(function () {
  'use strict';
  const parts = window.KiwiMenuWorkspaceParts ||= {};
  parts.recipes = function ({$, $$, esc, ui, venue, cash, cat, t, modal, recipeStyle, toast, S, render, pct1}) {
  /* menu-part:recipes */
  /* Unités courtes dans la liste (« g », « kg », « Botte ») : le libellé long
     « Gramme (g) » était tronqué en « Gramme (... » dans une cellule étroite. */
  function recipeUnitOptions(value){
    const api=window.KiwiRestaurantUnits,selected=api?.normalize?.(value,'')||'';
    return `<option value="">${esc(ui('rxChoose'))}</option>${(api?.list?.()||[]).map(unit=>`<option value="${esc(unit.id)}" title="${esc(unit.label)}"${unit.id===selected?' selected':''}>${esc(unit.family==='mass'||unit.family==='volume'?unit.id:unit.label)}</option>`).join('')}`;
  }
  function recipeIngredientRow(line,idx){
    const name=line?.name||'';
    return `<div class="rmw-rx-row" data-recipe-ing data-stock-id="${esc(line?.stockId||'')}">` +
      `<div class="rmw-rx-name">` +
      `<input class="rmw-rx-in" list="rmw-stock-ingredients" data-ing-name value="${esc(name)}" placeholder="${esc(ui('rxIngPh'))}" aria-label="${esc(ui('rxIngredient'))}"/>` +
      `<small data-ing-meta>` +
      `</small>` +
      `</div>` +
      `<div class="rmw-rx-qty">` +
      `<input class="rmw-rx-in" type="number" inputmode="decimal" min="0" step="0.001" data-ing-qty value="${+line?.qty||0}" placeholder="0" aria-label="${esc(ui('rxQty'))}"/>` +
      `<select class="rmw-rx-unit" data-ing-unit data-kiwi-native-select aria-label="${esc(ui('rxChoose'))}">${recipeUnitOptions(line?.unit)}</select>` +
      `</div>` +
      `<div class="rmw-rx-cost" data-ing-cost>·</div>` +
      `<button data-activation=write class="rmw-rx-del" type="button" data-ing-delete aria-label="${esc(ui('rxRemove',{name:name||ui('rxIngredient')}))}">` +
      `<svg viewBox="0 -960 960 960" aria-hidden="true">` +
      `<path fill="currentColor" d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/>` +
      `</svg>` +
      `</button>` +
      `</div>`;
  }
  /* L'état d'une ligne, tel que le stock le voit : liée, sans prix, unité
     incompatible, quantité absente. Le coût de ligne n'est jamais inventé. */
  function recipeLineInfo(row,api,inv){
    const units=window.KiwiRestaurantUnits,name=$('[data-ing-name]',row).value.trim(),qty=Math.max(0,+$('[data-ing-qty]',row).value||0),unit=units?.normalize?.($('[data-ing-unit]',row).value,'')||'';
    if(!name)return{empty:true};
    const hit=inv.find(s=>String(s.id)===row.dataset.stockId)||inv.find(s=>String(s.name).trim().toLowerCase()===name.toLowerCase());
    let info=null;
    try{
      info=api.ingredientInfo?.({stockId:hit?.id||'',name,qty,unit},venue())||null;
    }catch(_){
      info=null;
    }
    const stock=info?.stock||hit||null;
    if(!stock)return{name,state:'unlinked',meta:ui('rxUnlinked')};
    if(info?.cost==null)return{name,state:'noprice',meta:ui('rxNoPrice')};
    if(!(qty>0))return{name,state:'noqty',meta:ui('rxLinked',{price:cash(info.cost),unit:info.stockUnit||stock.unit||''})};
    if(info.quantityInStockUnit==null)return{name,state:'unit',meta:ui('rxUnitMismatch',{unit:info.stockUnit||stock.unit||''})};
    return{name,state:'ok',cost:info.lineCost,meta:ui('rxLinked',{price:cash(info.cost),unit:info.stockUnit||stock.unit||''})};
  }
  function recipeNutrition(draft,api,hide){
    const n=api.nutrition?.(draft,venue()),hasLines=(draft.ingredients||[]).some(l=>+l.qty>0),missing=n?[...new Set([...(n.missingNutrition||[]),...(n.missingConversion||[]),...(n.missingAllergens||[])])]:[];
    const toggle=`<label class="rmw-nutri-toggle" title="${esc(ui('nutritionHideHint'))}">` +
      `<input type="checkbox" data-hide-nutrition${hide?' checked':''}/>` +
      `<span>${esc(ui('nutritionHide'))}</span>` +
      `</label>`;
    let nutrition;
    if(!hasLines)nutrition=`<div class="rmw-nutrition-state empty">` +
      `<div class="rmw-nutri-head">` +
      `<span class="rmw-nutri-dot mode">` +
      `<i>` +
      `</i>${esc(ui('nutritionShort'))}</span>` +
      `<span class="rmw-nutri-muted">${esc(ui('nutritionAwaitsRecipe'))}</span>` +
      `</div>${toggle}</div>`;else if(n?.complete)nutrition=`<div class="rmw-nutrition-state complete">` +
        `<div class="rmw-nutri-head">` +
        `<span class="rmw-nutri-dot req">` +
        `<i>` +
        `</i>${esc(ui('nutritionComplete'))}</span>${toggle}</div>` +
        `<div class="rmw-nutrition-values">` +
        `<bdi dir="ltr">${n.nutrition.kcal} kcal</bdi>` +
        `<bdi dir="ltr">P ${n.nutrition.protein} g</bdi>` +
        `<bdi dir="ltr">G ${n.nutrition.carbs} g</bdi>` +
        `<bdi dir="ltr">L ${n.nutrition.fat} g</bdi>` +
        `</div>` +
        `<div class="rmw-nutrition-allergens">` +
        `<b>${esc(ui('nutritionAllergens'))}</b>` +
        `<span>${esc(n.allergens.length?n.allergens.map(key=>ui(`allergen_${key}`)).join(' · '):ui('nutritionNone'))}</span>` +
        `</div>` +
        `<small>${esc(ui('nutritionIndicative'))}</small>` +
        `</div>`;else nutrition=`<div class="rmw-nutrition-state incomplete">` +
          `<div class="rmw-nutri-head">` +
          `<span class="rmw-nutri-dot opt">` +
          `<i>` +
          `</i>${esc(ui('nutritionIncomplete'))}</span>` +
          `<span class="rmw-nutri-muted">${esc(ui('nutritionMissing',{n:missing.length}))}</span>` +
          `</div>` +
          `<div class="rmw-nutri-head-acts">` +
          `<button class="btn-slim" type="button" data-nutrition-fix>${esc(ui('nutritionFix'))}</button>${toggle}</div>` +
          `</div>`;
    return nutrition;
  }
  /* Le panneau de droite : ce que la recette coûte et rapporte, par portion,
     sur la même base que l'Analyse du menu (KiwiCost.marginOf : hors TVA
     quand les prix l'incluent). Inconnu : « · », jamais un zéro. */
  function recipeSummary(x,draft,api,hide,lines){
    const m=api.metrics(x,draft,venue()),price=+x.price||0,C=window.KiwiCost;
    const cost=m.costComplete?m.theoreticalCost:null,mg=cost!=null&&C?.marginOf?C.marginOf(price,cost):null;
    let vatIn=false;
    try{
      const b=C?.basis?.();
      vatIn=!!(b&&b.mode==='rate'&&b.included);
    }catch(_){
      vatIn=false;
    }
    const todo=(lines||[]).filter(l=>!l.empty&&l.state!=='ok');
    const known=(lines||[]).reduce((n,l)=>n+(l.cost>0?l.cost:0),0)/Math.max(1,+draft.portions||1);
    let cls='todo',title=ui('rxStatusTodo'),detail=todo.length?ui('rxMissing',{n:todo.length,names:todo.slice(0,4).map(l=>l.name).join(', ')+(todo.length>4?'…':'')}):'';
    if(m.costComplete){
      cls='ok';
      title=ui('rxStatusOk');
      detail=ui('rxOkHint');
    }
    if(m.costComplete&&m.actualCost!=null){
      const gap=Math.abs(m.variancePct||0),g=window.KiwiNumber?.format(gap,{maximumFractionDigits:0})??Math.round(gap);
      cls=gap>15?'gap':gap>5?'watch':'ok';
      title=ui(gap>15?'rxStatusGap':gap>5?'rxStatusWatch':'rxStatusOk');
      detail=ui(m.variancePct>0?'rxGapUp':'rxGapDown',{gap:g+' %'});
    }
    const ht=vatIn?` <em>${esc(ui('rxHT'))}</em>`:'';
    const fc=mg?pct1(100-mg.pct):'·';
    return `<div class="rmw-rx-status ${cls}">` +
      `<b>${esc(title)}</b>${detail?`<span>${esc(detail)}</span>`:''}${todo.length?`<button type="button" class="rmw-rx-link" data-nutrition-fix>${esc(ui('rxToStock'))}</button>`:''}</div>
      <div class="rmw-rx-hero${cost==null?' partial':''}">` +
      `<span>${esc(ui('rxCostPortion'))}</span>` +
      `<b>${cost!=null?cash(cost):known>0?esc(ui('rxAtLeast',{amount:cash(known)})):'·'}</b>${cost==null&&known>0?`<small>${esc(ui('rxAtLeastSub'))}</small>`:''}</div>
      <dl class="rmw-rx-facts">` +
      `<div>` +
      `<dt>${esc(ui('rxPrice'))}</dt>` +
      `<dd>${price?cash(price):'·'}</dd>` +
      `</div>` +
      `<div>` +
      `<dt>${esc(ui('rxContribution'))}${ht}</dt>` +
      `<dd class="${mg&&mg.profit<0?'neg':''}">${mg?cash(mg.profit):'·'}</dd>` +
      `</div>` +
      `<div>` +
      `<dt>${esc(ui('rxFoodCost'))}${ht}</dt>` +
      `<dd>${fc}</dd>` +
      `</div>` +
      `<div>` +
      `<dt>${esc(ui('rxObserved'))}</dt>` +
      `<dd>${m.actualCost!=null?cash(m.actualCost):`<small>${esc(ui('rxObservedWait'))}</small>`}</dd>` +
      `</div>` +
      `</dl>
      ${recipeNutrition(draft,api,hide)}`;
  }
  function recipeDraft(root,x,api){
    const inv=api.inventory(venue()),units=window.KiwiRestaurantUnits;
    return{itemName:x.name,portions:Math.max(1,+$('[data-portions]',root)?.value||1),prepMinutes:Math.max(0,+$('[data-minutes]',root)?.value||0),ingredients:$$('[data-recipe-ing]',root).map(row=>{
        const name=$('[data-ing-name]',row).value.trim(),hit=inv.find(s=>String(s.id)===row.dataset.stockId)||inv.find(s=>String(s.name).trim().toLowerCase()===name.toLowerCase());
        return{stockId:hit?.id||'',name,qty:Math.max(0,+$('[data-ing-qty]',row).value||0),unit:units?.normalize?.($('[data-ing-unit]',row).value||hit?.unit,'')||''};
      }).filter(line=>line.name||line.stockId),steps:$('[data-steps]',root)?.value.split('\n').map(v=>v.trim()).filter(Boolean)||[],note:$('[data-note]',root)?.value||''};
  }
  function openRecipe(x,seed,from){
    const api=window.KiwiRestaurantRecipes,had=!!api?.get(x.id,x.name,venue()),r=seed||api?.get(x.id,x.name,venue())||{portions:1,prepMinutes:0,ingredients:[],steps:[],note:''},inv=api?.inventory(venue())||[];
    const rows=r.ingredients.length?r.ingredients:[{stockId:'',name:'',qty:0,unit:''}];
    recipeStyle();
    const catName=cat(x.catId)?.name?t(cat(x.catId).name):'';
    const m=modal({title:ui('rxTitle',{name:t(x.name)}),desc:esc(ui('rxDesc',{cat:catName,price:cash(x.price)}).replace(/^ · /,'')),width:1080,body:`<div class="rmw-rx">${seed?`<div class="rmw-rx-draft" data-recipe-draft>` +
        `<b>${esc(ui('recipeDraftTitle'))}</b>` +
        `<span>${esc(ui('recipeDraftFrom',{name:from?.sheet||''}))}${had?' '+esc(ui('recipeDraftExisting')):''}</span>` +
        `</div>`:''}<datalist id="rmw-stock-ingredients">${inv.map(s=>`<option value="${esc(s.name)}">${esc(s.unit||'')} · ${cash(s.costPerUnit)}</option>`).join('')}</datalist>` +
        `<div class="rmw-rx-main">` +
        `<section class="rmw-rx-sec">` +
        `<header class="rmw-rx-sec-head">` +
        `<div>` +
        `<h4>${esc(ui('rxComposition'))}</h4>` +
        `<p>${esc(ui('rxCompositionSub'))}</p>` +
        `</div>` +
        `<div class="rmw-rx-meta">` +
        `<label>` +
        `<span>${esc(ui('rxPortions'))}</span>` +
        `<input class="rmw-rx-in" type="number" inputmode="numeric" min="1" step="1" data-portions value="${r.portions||1}"/>` +
        `</label>` +
        `<label>` +
        `<span>${esc(ui('rxPrep'))}</span>` +
        `<span class="rmw-rx-suffix">` +
        `<input class="rmw-rx-in" type="number" inputmode="numeric" min="0" step="1" data-minutes value="${r.prepMinutes||0}"/>` +
        `<i>${esc(ui('rxMin'))}</i>` +
        `</span>` +
        `</label>` +
        `</div>` +
        `</header>` +
        `<div class="rmw-rx-cols" aria-hidden="true">` +
        `<span>${esc(ui('rxIngredient'))}</span>` +
        `<span>${esc(ui('rxQty'))}</span>` +
        `<span>${esc(ui('rxLineCost'))}</span>` +
        `<span>` +
        `</span>` +
        `</div>` +
        `<div data-recipe-ingredients>${rows.map(recipeIngredientRow).join('')}</div>` +
        `<button data-activation=write class="rmw-rx-add" type="button" data-ing-add>` +
        `<svg viewBox="0 -960 960 960" aria-hidden="true">` +
        `<path fill="currentColor" d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/>` +
        `</svg>` +
        `<span>${esc(ui('rxAdd'))}</span>` +
        `</button>${inv.length?'':`<p class="rmw-rx-hint">${esc(ui('rxNoStock'))}</p>`}</section>` +
        `<section class="rmw-rx-sec">` +
        `<header class="rmw-rx-sec-head">` +
        `<div>` +
        `<h4>${esc(ui('rxMethod'))}</h4>` +
        `</div>` +
        `</header>` +
        `<div class="rmw-rx-notes">` +
        `<label>` +
        `<span>${esc(ui('rxSteps'))}</span>` +
        `<textarea class="rmw-rx-in" data-steps placeholder="${esc(ui('rxStepsPh'))}">${esc((r.steps||[]).join('\n'))}</textarea>` +
        `</label>` +
        `<label>` +
        `<span>${esc(ui('rxNotes'))}</span>` +
        `<textarea class="rmw-rx-in" data-note placeholder="${esc(ui('rxNotesPh'))}">${esc(r.note||'')}</textarea>` +
        `</label>` +
        `</div>` +
        `</section>` +
        `</div>` +
        `<aside class="rmw-rx-side" data-recipe-summary>` +
        `</aside>` +
        `</div>`,foot:`<button class="kb ghost" data-cancel>${esc(ui('cancelBtn'))}</button>` +
          `<button data-activation=write class="eq-cta-gradient" data-save>${esc(ui('saveBtn'))}</button>`});
    m.el.classList.add('rmw-recipe-modal');
    let hideDraft=!!x.hideNutrition;
    const wrap=$('[data-recipe-ingredients]',m.el),refresh=()=>{
      const info=$$('[data-recipe-ing]',m.el).map(row=>{
        const li=recipeLineInfo(row,api,inv),meta=$('[data-ing-meta]',row),costEl=$('[data-ing-cost]',row);
        row.dataset.state=li.empty?'':li.state;
        if(meta)meta.textContent=li.empty?'':li.meta;
        if(costEl)costEl.textContent=li.cost!=null?cash(li.cost):'·';
        return li;
      });
      $('[data-recipe-summary]',m.el).innerHTML=recipeSummary(x,recipeDraft(m.el,x,api),api,hideDraft,info);
    };
    refresh();
    m.el.addEventListener('change',e=>{
      if(e.target.matches('[data-hide-nutrition]')){
        hideDraft=!!e.target.checked;
        return;
      }
      if(e.target.matches('[data-ing-unit]'))refresh();
    });
    m.el.addEventListener('input',e=>{
      if(e.target.matches('[data-hide-nutrition]'))return;
      const row=e.target.closest('[data-recipe-ing]');
      if(row&&e.target.matches('[data-ing-name]')){
        const hit=inv.find(s=>String(s.name).trim().toLowerCase()===e.target.value.trim().toLowerCase());
        row.dataset.stockId=hit?.id||'';
        if(hit&&$('[data-ing-unit]',row))$('[data-ing-unit]',row).value=window.KiwiRestaurantUnits?.normalize?.(hit.unit)||hit.unit||'unité';
      }
      refresh();
    });
    m.el.addEventListener('click',e=>{
      if(!e.target.closest('[data-nutrition-fix]'))return;
      m.close();
      window.Kiwi?.handlers?.['nav-stock']?.();
    });
    wrap.onclick=e=>{
      const del=e.target.closest('[data-ing-delete]');
      if(!del)return;
      del.closest('[data-recipe-ing]').remove();
      if(!wrap.children.length)wrap.insertAdjacentHTML('beforeend',recipeIngredientRow({},0));
      refresh();
    };
    $('[data-ing-add]',m.el).onclick=()=>{
      wrap.insertAdjacentHTML('beforeend',recipeIngredientRow({},wrap.children.length));
      $('[data-ing-name]',wrap.lastElementChild).focus();
    };
    $('[data-cancel]',m.el).onclick=m.close;
    $('[data-save]',m.el).onclick=()=>{
      const draft=recipeDraft(m.el,x,api);
      if(!draft.ingredients.some(line=>line.qty>0)){
        toast(ui('rxToastQtyT'),ui('rxToastQty'),'warn');
        return;
      }
      if(draft.ingredients.some(line=>!line.unit)){
        toast(ui('rxToastUnitT'),ui('rxToastUnit'),'warn');
        return;
      }
      S().updateItem(x.id,{hideNutrition:hideDraft});
      api.save(x.id,draft,venue());
      m.close();
      render();
      toast(ui('rxSavedT'),ui('rxSaved'));
    };
  }
  /* /menu-part:recipes */
  return {recipeUnitOptions, recipeIngredientRow, recipeLineInfo, recipeNutrition, recipeSummary, recipeDraft, openRecipe};
  };
})();
