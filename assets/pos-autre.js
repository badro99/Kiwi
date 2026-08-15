/* Flexible POS for onboarding trade `autre`: sale + custom work tracking. */
(function(){
  'use strict';
  let root, view='sale', cart=[];
  const paired=()=>{try{return JSON.parse(localStorage.getItem('kiwiPairedVenue')||'null')||{};}catch(_){return{};}};
  const merchant=()=>paired().merchant||'demo-autre';
  const catalogKey=()=>`kiwi:posAutre:catalog:${merchant()}`;
  function catalog(){try{const a=JSON.parse(localStorage.getItem(catalogKey())||'[]');return Array.isArray(a)?a:[];}catch(_){return[];}}
  function saveCatalog(a){try{localStorage.setItem(catalogKey(),JSON.stringify(a.slice(0,300)));}catch(_) {}}
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=n=>{try{return(+n||0).toLocaleString('fr-FR',{maximumFractionDigits:2});}catch(_){return String(+n||0);}};
  function mount(el){
    root=el;
    const p=paired();
    root.innerHTML=`<div class="ot-app"><aside class="ot-rail"><div class="ot-brand"><img class="kiwi-pos-logo" src="assets/kiwi-newlogo-inverse.svg" alt="Kiwi"></div><div class="ot-venue"><strong>${esc(p.name||'Mon activité')}</strong><span>${esc(p.location||'Caisse polyvalente')}</span></div><nav class="ot-nav"><button class="on" data-ot-view="sale"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M5 6l1 15h12l1-15M9 10v7M15 10v7"/></svg>Encaisser</button><button data-ot-view="work"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3h6l1 3h3v15H5V6h3zM8 12h8M8 16h5"/></svg>Suivi d’activité</button><button data-ot-view="day"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V9M10 19V5M16 19v-7M22 19V2"/></svg>Journée</button></nav><div class="ot-foot"><button class="ot-lock">Verrouiller</button></div></aside><main class="ot-main" data-ot-main></main></div>`;
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
    render();
  }
  function catalogDashboardOnly(){window.KiwiCaisseToast?.('Articles et prix se gèrent dans le tableau de bord.');}
  function render(){
    const host=root.querySelector('[data-ot-main]');
    if(view==='day')return renderDay(host);
    const items=catalog();
    const productHtml=items.length
      ? items.map(x=>`<button class="ot-product" data-ot-item="${esc(x.id)}"><strong>${esc(x.name)}</strong><span>${fmt(x.price)} MAD</span></button>`).join('')
      : '<div class="ot-empty">Ajoutez vos articles dans le tableau de bord.</div>';
    const lineHtml=cart.length
      ? cart.map((x,i)=>`<div class="ot-line"><span>${esc(x.name)}</span><strong>${fmt(x.price)} MAD</strong><button data-ot-remove="${i}" aria-label="Retirer">×</button></div>`).join('')
      : '<div class="ot-empty">Touchez un article.</div>';
    const amount=total();
    host.innerHTML=`<header class="ot-head"><div><h1>Encaisser</h1><p>Un catalogue libre pour les activités qui ne rentrent dans aucune case.</p></div><span class="ot-dashboard-only">Articles et prix se gèrent dans le tableau de bord</span></header><div class="ot-sale"><section class="ot-products"><div class="ot-grid">${productHtml}</div></section><aside class="ot-ticket"><h2>Ticket</h2><div class="ot-lines">${lineHtml}</div><div class="ot-total"><span>Total</span><strong>${fmt(amount)} MAD</strong></div><div class="ot-pay"><button data-ot-pay="especes"${amount?'':' disabled'}>Espèces</button><button data-ot-pay="carte"${amount?'':' disabled'}>Carte</button></div></aside></div>`;
    host.onclick=e=>{
      const add=e.target.closest('[data-ot-add]');
      if(add){catalogDashboardOnly();return;}
      const it=e.target.closest('[data-ot-item]');
      if(it){const x=items.find(y=>y.id===it.dataset.otItem);if(x){cart.push(x);render();}return;}
      const rem=e.target.closest('[data-ot-remove]');
      if(rem){cart.splice(+rem.dataset.otRemove,1);render();return;}
      const pay=e.target.closest('[data-ot-pay]');
      if(pay)checkout(pay.dataset.otPay);
    };
  }
  function total(){return cart.reduce((n,x)=>n+(+x.price||0),0);}
  function checkout(method){const amount=total();if(!(amount>0))return;const ref=window.KiwiPosSale?.stamp?.('A-'+window.KiwiPosSale.nextSeq('autre',1))||('A-'+Date.now());window.KiwiPosSale?.record?.('autre',{total:amount,method,label:cart[0]?.name+(cart.length>1?` +${cart.length-1}`:''),ref,lines:cart.map(x=>({name:x.name,qty:1,total:x.price}))});cart=[];window.KiwiCaisseToast?.('Vente encaissée · '+fmt(amount)+' MAD');render();}
  function addModal() { catalogDashboardOnly(); return; }
  function renderDay(host){const t=window.KiwiPosSale?.totals?.('autre')||{total:0,cash:0,card:0,count:0};host.innerHTML=`<header class="ot-head"><div><h1>Journée</h1><p>Uniquement les ventes réellement encaissées sur ce terminal.</p></div></header><section class="ot-day"><div class="ot-day-grid"><div class="ot-stat"><span>Ventes</span><strong>${t.count}</strong></div><div class="ot-stat"><span>Recette</span><strong>${fmt(t.total)} MAD</strong></div><div class="ot-stat"><span>Espèces / carte</span><strong>${fmt(t.cash)} / ${fmt(t.card)}</strong></div></div></section>`;}
  function onShow(){if(root)render();}
  window.KiwiPosDispatch.register({id:'autre',greet:{line1:'Bonjour,',em:'bienvenue.',sub:'Caisse polyvalente'},mount,onShow});
})();
