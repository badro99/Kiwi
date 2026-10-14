/* Flexible POS for onboarding trade `autre`: sale + custom work tracking. */
(function(){
  'use strict';
  let root, view='sale', cart=[];
  const paired=()=>{try{return window.KiwiPlatform?.pairedVenue?.()||JSON.parse(localStorage.getItem('kiwiPairedVenue')||'null')||{};}catch(_){return{};}};
  const merchant=()=>window.KiwiPlatform?.pairedMerchant?.()||paired().merchant||'demo-autre';
  const catalogKey=()=>`kiwi:posAutre:catalog:${merchant()}`;
  /* Le catalogue de CE commerçant, celui que l'inventaire du tableau de bord tient
     (KiwiBoutiqueCatalog, sous la clé du commerce appairé), comme pour le fleuriste.
     L'écran disait « Articles et prix se gèrent dans le tableau de bord » mais ne
     relisait qu'une liste locale que plus rien n'écrivait : la caisse « autre »
     n'avait jamais d'articles. Un article sans prix ne se vend pas d'ici (Kiwi ne
     vend aucun tarif que personne n'a fixé) ; il est compté pour le dire. */
  let unpriced=0;
  function boardCatalog(){
    const C=window.KiwiBoutiqueCatalog,m=window.KiwiPlatform?.pairedMerchant?.()||paired().merchant||'';
    if(!C||!C.listProducts||!m)return null;
    try{if(C.use)C.use(m);}catch(_){}
    let list=[];try{list=C.listProducts()||[];}catch(_){return null;}
    unpriced=0;
    return list.map(pr=>{const name=String(pr&&pr.name||'').trim();const price=roundMoney(+(pr&&pr.priceMAD)||0);if(!name)return null;if(!(price>0)){unpriced++;return null;}return{id:'p-'+String(pr.id),productId:String(pr.id),name:name.slice(0,60),price};}).filter(Boolean);
  }
  function catalog(){
    const board=boardCatalog();
    if(board&&(board.length||unpriced))return board;
    try{const a=JSON.parse(localStorage.getItem(catalogKey())||'[]');return Array.isArray(a)?a:[];}catch(_){return[];}
  }
  function saveCatalog(a){try{localStorage.setItem(catalogKey(),JSON.stringify(a.slice(0,300)));}catch(_) {}}
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>{try{return(window.KiwiNumber?.format((+n||0), {maximumFractionDigits:2}) ?? (+n||0).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {maximumFractionDigits:2}));}catch(_){return String(+n||0);}};
  const roundMoney=n=>Math.round((+n||0)*100)/100;
  /* Montant libre : « 12 », « 12,5 », « 12.50 ». Rien d'autre (pas de signe, pas
     de lettres), au plus 2 décimales, jamais zéro. 0 = refusé. */
  function parseAmount(raw){
    const s=String(raw==null?'':raw).trim().replace(/\s/g,'').replace(',','.');
    if(!/^\d{1,7}(\.\d{1,2})?$/.test(s))return 0;
    return roundMoney(parseFloat(s));
  }
  function addCustom(raw,label){
    const amount=parseAmount(raw);
    if(!(amount>0))return false;
    const name=String(label||'').trim().slice(0,60)||'Article libre';
    cart.push({id:'libre',name,price:amount,free:true});
    window.KiwiCaisseToast?.('Article libre · '+fmt(amount)+' MAD');
    return true;
  }
  function closeCustom(){const m=root&&root.querySelector('.ot-modal');if(m)m.remove();}
  function openCustom(){
    if(!root||root.querySelector('.ot-modal'))return;
    const m=document.createElement('div');
    m.className='ot-modal';
    m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-label','Montant libre');
    m.innerHTML='<form novalidate><h2>Montant libre</h2><label for="ot-amt">Montant (MAD)</label><input id="ot-amt" data-ot-amount inputmode="decimal" autocomplete="off" placeholder="0" aria-describedby="ot-err"><label for="ot-desc">Description (facultatif)</label><input id="ot-desc" data-ot-desc maxlength="60" autocomplete="off" placeholder="Article libre"><p class="ot-err" id="ot-err" role="alert" hidden>Saisissez un montant supérieur à zéro.</p><div class="ot-modal-actions"><button type="button" data-ot-cancel>Annuler</button><button type="submit" data-ot-confirm>Ajouter au ticket</button></div></form>';
    root.appendChild(m);
    const amt=m.querySelector('[data-ot-amount]'),desc=m.querySelector('[data-ot-desc]'),err=m.querySelector('.ot-err');
    amt.addEventListener('input',()=>{err.hidden=true;});
    m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-ot-cancel]'))closeCustom();});
    m.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeCustom();}});
    m.querySelector('form').addEventListener('submit',e=>{
      e.preventDefault();
      if(!addCustom(amt.value,desc.value)){err.hidden=false;amt.focus();return;}
      closeCustom();render();
    });
    window.KiwiCaisseLang?.apply?.(m);
    setTimeout(()=>{try{amt.focus();}catch(_){}},0);
  }
  /* kiwiSkin2027:till (étape 4 (15), §18.3 « Business-type tills ») : le même
     cadre que la caisse restaurant, KiwiTillFrame (le rail, la grille, l'addition,
     l'encaissement), monté dans la racine du métier. Ce qui est propre à
     « autre » reste dans le volet du menu : le montant libre (la fenêtre livrée),
     la journée. Le panier, record() et le stock restent les livrés. Drapeau
     éteint : rien ne change. */
  let kit=false,kitView='sale';
  const kitAvailable=()=>{try{return document.documentElement.getAttribute('data-skin-2027')==='till'&&!!window.KiwiTillFrame&&!!window.KiwiKit&&!!customElements.get('k-rail')&&!!customElements.get('k-menu-grid');}catch(_){return false;}};
  const KIT_METHOD={cash:'especes',card:'carte',other:'wallet'};
  function mountKit(el){
    root=el;kit=true;
    root.innerHTML='<div class="ot-k"><div class="ot-k-rail"></div><main class="ot-k-main"><div class="ot-k-menu"></div><div class="ot-k-day" hidden></div></main><aside class="ot-k-bill k-till-bill"></aside></div>';
    window.KiwiTillFrame.mount({menu:root.querySelector('.ot-k-menu'),bill:root.querySelector('.ot-k-bill'),rail:root.querySelector('.ot-k-rail'),menuPane:root.querySelector('.ot-k-main'),act:kitAct});
    watchCatalog();
    render();
  }
  function kitPaint(){
    const F=window.KiwiTillFrame,items=catalog(),p=paired();
    const qty=id=>cart.filter(x=>x.id===id).length;
    const sections=[{id:'articles',title:'Articles',items:[{id:'__libre',name:'Montant libre',price:null,options:true,qty:0}]
      .concat(items.map(x=>({id:String(x.id),name:x.name,price:x.price,qty:qty(x.id)})))}];
    const lines=cart.map((x,i)=>({id:String(i),qty:1,name:x.name,mods:[],price:x.price,sent:false,sentAt:'',sentQty:0}));
    const day=root.querySelector('.ot-k-day'),menu=root.querySelector('.ot-k-menu');
    if(day)day.hidden=kitView!=='day';
    if(menu)menu.hidden=kitView==='day';
    if(kitView==='day'&&day)renderDay(day);
    F.paint({sections,bill:{title:'Ticket',meta:p.name||'',lines,total:total(),plain:true},rail:{value:kitView,label:'Caisse',items:[
      {id:'sale',icon:'shopping_bag',label:'Encaisser'},{id:'work',icon:'receipt_long',label:'Suivi d’activité'},{id:'day',icon:'today',label:'Journée'}],footer:{cashier:p.name||'Kiwi'}}});
  }
  function kitPay(){
    const amount=total();
    if(!(amount>0))return;
    window.KiwiTillFrame.openPay({bill:'Ticket',due:amount,method:null,tipPct:0,noTip:true});
  }
  function kitConfirm(kind,value){
    const F=window.KiwiTillFrame,pay=F.pay(),method=KIT_METHOD[kind],amount=total();
    if(!method||!(amount>0))return;
    if(kind==='cash'&&roundMoney(+(value&&value.received)||0)<amount)return;
    const change=kind==='cash'?roundMoney((+value.received||0)-amount):0;
    checkout(method);
    pay.paid();
    if(change>0)window.KiwiCaisseToast?.('Monnaie à rendre · '+fmt(change)+' MAD');
    setTimeout(()=>{F.closePay();render();},1200);
  }
  function kitAct(verb,id,value){
    const F=window.KiwiTillFrame;
    if(verb==='rail.select'){
      if(id==='work'){window.KiwiPosWorkspaces?.open?.(root,'autre');return;}
      kitView=id==='day'?'day':'sale';render();return;
    }
    if(verb==='rail.cashier'){window.KiwiPosDispatch?.lock?.();return;}
    if(verb==='pay.confirm'){kitConfirm(id,value||{});return;}
    if(verb==='pay.leave'){F.closePay();render();return;}
    if(F.busy())return;
    if(verb==='add'||verb==='options'){
      if(id==='__libre'){openCustom();return;}
      const x=catalog().find(y=>String(y.id)===id);
      if(x){cart.push(x);render();}
      return;
    }
    if(verb==='step'){const i=+id;if(!(i>=0&&i<cart.length))return;if(value&&value.dir>0)cart.push(cart[i]);else cart.splice(i,1);render();return;}
    if(verb==='remove'){const i=+id;if(i>=0&&i<cart.length){cart.splice(i,1);render();}return;}
    if(verb==='pay'){kitPay();return;}
  }
  function mount(el){
    if(kitAvailable())return mountKit(el);
    root=el;
    const p=paired();
    root.innerHTML=`<div class="ot-app"><aside class="ot-rail"><div class="ot-brand"><img class="kiwi-pos-logo" src="assets/kiwi-newlogo-inverse.svg" alt="Kiwi"></div><div class="ot-venue"><strong>${esc(p.name||'Mon activité')}</strong><span>${esc(p.location||'Caisse polyvalente')}</span></div><nav class="ot-nav"><button class="on" data-ot-view="sale"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M5 6l1 15h12l1-15M9 10v7M15 10v7"/></svg>Encaisser</button><button data-ot-view="work"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6l1 3h3v15H5V6h3zM8 12h8M8 16h5"/></svg>Suivi d’activité</button><button data-ot-view="day"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V9M10 19V5M16 19v-7M22 19V2"/></svg>Journée</button></nav><div class="ot-foot"><div class="ot-lang" data-kcl-host></div><button class="ot-lock">Verrouiller</button></div></aside><main class="ot-main" data-ot-main></main></div>`;
    root.querySelector('.ot-nav').onclick=e=>{
      const b=e.target.closest('[data-ot-view]');
      if(!b)return;
      view=b.dataset.otView;
      root.querySelectorAll('[data-ot-view]').forEach(x=>x.classList.toggle('on',x===b));
      if(view==='work'){
        window.KiwiPosWorkspaces?.open?.(root,'autre');
        view='sale';
        root.querySelector('[data-ot-view="sale"]').click();
        return;
      }
      render();
    };
    root.querySelector('.ot-lock').onclick=()=>window.KiwiPosDispatch?.lock?.();
    watchCatalog();
    render();
  }
  function catalogDashboardOnly(){window.KiwiCaisseToast?.('Articles et prix se gèrent dans le tableau de bord.');}
  function render(){
    if(kit)return kitPaint();
    const host=root.querySelector('[data-ot-main]');
    if(view==='day')return renderDay(host);
    const items=catalog();
    const customTile='<button class="ot-product ot-custom" data-ot-custom><strong>Montant libre</strong><span>Saisir un montant</span></button>';
    const productHtml=customTile+(items.length
      ? items.map(x=>`<button class="ot-product" data-ot-item="${esc(x.id)}"><strong>${esc(x.name)}</strong><span>${fmt(x.price)} MAD</span></button>`).join('')
      : '<div class="ot-empty">Ajoutez vos articles dans le tableau de bord.</div>')
      +(unpriced?`<div class="ot-empty ot-unpriced"><span>Articles sans prix, pas encore en vente</span> · <b>${unpriced}</b></div>`:'');
    const lineHtml=cart.length
      ? cart.map((x,i)=>`<div class="ot-line"><span>${esc(x.name)}</span><strong>${fmt(x.price)} MAD</strong><button data-ot-remove="${i}" aria-label="Retirer">×</button></div>`).join('')
      : '<div class="ot-empty">Touchez un article.</div>';
    const amount=total();
    host.innerHTML=`<header class="ot-head"><div><h1>Encaisser</h1><p>Un catalogue libre pour les activités qui ne rentrent dans aucune case.</p></div><span class="ot-dashboard-only">Articles et prix se gèrent dans le tableau de bord</span></header><div class="ot-sale"><section class="ot-products"><div class="ot-grid">${productHtml}</div></section><aside class="ot-ticket"><h2>Ticket</h2><div class="ot-lines">${lineHtml}</div><div class="ot-total"><span>Total</span><strong>${fmt(amount)} MAD</strong></div><div class="ot-pay"><button data-ot-pay="especes"${amount?'':' disabled'}>Espèces</button><button data-ot-pay="carte"${amount?'':' disabled'}>Carte</button></div></aside></div>`;
    host.onclick=e=>{
      const add=e.target.closest('[data-ot-add]');
      if(add){catalogDashboardOnly();return;}
      if(e.target.closest('[data-ot-custom]')){openCustom();return;}
      const it=e.target.closest('[data-ot-item]');
      if(it){const x=items.find(y=>y.id===it.dataset.otItem);if(x){cart.push(x);render();}return;}
      const rem=e.target.closest('[data-ot-remove]');
      if(rem){cart.splice(+rem.dataset.otRemove,1);render();return;}
      const pay=e.target.closest('[data-ot-pay]');
      if(pay)checkout(pay.dataset.otPay);
    };
  }
  function total(){return roundMoney(cart.reduce((n,x)=>n+(+x.price||0),0));}
  function checkout(method){const amount=total();if(!(amount>0))return;const ref=window.KiwiPosSale?.stamp?.('A-'+window.KiwiPosSale.nextSeq('autre',1))||('A-'+Date.now());window.KiwiPosSale?.record?.('autre',{total:amount,method,label:cart[0]?.name+(cart.length>1?` +${cart.length-1}`:''),ref,lines:cart.map(x=>({name:x.name,qty:1,total:x.price,itemId:x.productId||undefined}))});
    /* le stock suit la vente, article par article, avec le numéro de ticket */
    cart.forEach(x=>{if(x.productId){try{window.KiwiPosWorkspaces?.catalog?.sell?.(x.productId,1,ref);}catch(_){}}});
    cart=[];window.KiwiCaisseToast?.('Vente encaissée · '+fmt(amount)+' MAD');render();}
  function addModal() { catalogDashboardOnly(); return; }
  function renderDay(host){const t=window.KiwiPosSale?.totals?.('autre')||{total:0,cash:0,card:0,count:0};host.innerHTML=`<header class="ot-head"><div><h1>Journée</h1><p>Uniquement les ventes réellement encaissées sur ce terminal.</p></div></header><section class="ot-day"><div class="ot-day-grid"><div class="ot-stat"><span>Ventes</span><strong>${t.count}</strong></div><div class="ot-stat"><span>Recette</span><strong>${fmt(t.total)} MAD</strong></div><div class="ot-stat"><span>Espèces / carte</span><strong>${fmt(t.cash)} / ${fmt(t.card)}</strong></div></div></section>`;}
  /* Le cadre est partagé : au retour sur ce métier, il revient dans sa racine. */
  function onShow(){if(!root)return;if(kit){const r=root;mountKit(r);return;}render();}
  let watching=false;
  function watchCatalog(){if(watching)return;const C=window.KiwiBoutiqueCatalog;if(C&&C.subscribe){watching=true;try{C.subscribe(()=>{if(root&&view==='sale')render();});}catch(_){}}}
  window.KiwiPosDispatch.register({id:'autre',greet:{line1:'Bonjour,',em:'bienvenue.',sub:'Caisse polyvalente'},mount,onShow});
})();
