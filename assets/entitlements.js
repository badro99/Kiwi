(function(){
  'use strict';
  var WA='https://wa.me/212624495159?text='+encodeURIComponent('Bonjour Kiwi, je souhaite activer mon abonnement pour mon établissement.');
  var params;try{params=new URLSearchParams(location.search);}catch(_){params=new URLSearchParams();}
  var wantsOperator=params.get('op')==='1';
  var wantsPrivacy=wantsOperator&&params.get('privacy')==='1';
  /* Query flags select a mode; they never authorize it. Identity is settled by
     /api/me and only its signed operator answer may lift the subscription gate. */
  var operator=false,privacy=false,privacyInstalled=false;
  var pending=false, modal=null, pill=null;
  var nativeFetch=window.fetch&&window.fetch.bind(window);

  function node(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function showPaywall(){
    if(operator||!pending)return true;
    if(modal){modal.hidden=false;return false;}
    modal=node('div','kiwi-entitlement-layer');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Abonnement Kiwi requis');
    var card=node('section','kiwi-entitlement-card'),head=node('div','kiwi-entitlement-head'),kick=node('div','kiwi-entitlement-kicker');kick.append(node('span'),document.createTextNode(' Activation Kiwi'));
    head.append(kick,node('h2','',"Votre espace est prêt. Activez Kiwi pour passer à l'action."),node('p','',"Explorez librement votre tableau de bord. Dès que votre abonnement est validé, les ajouts, exports, encaissements et réglages deviennent disponibles, sans perdre votre configuration."));
    var benefits=node('div','kiwi-entitlement-benefits');[['Tout est conservé','Votre onboarding et vos réglages restent en place.'],['Activation humaine','L’équipe Kiwi vérifie votre formule avec vous.'],['Ouverture immédiate','God Mode active uniquement votre établissement.']].forEach(function(x){var d=node('div');d.append(node('b','',x[0]),document.createTextNode(x[1]));benefits.append(d);});
    var actions=node('div','kiwi-entitlement-actions'),cta=node('a','',"Parler à Kiwi sur WhatsApp"),later=node('button','',"Continuer à explorer");cta.href=WA;cta.target='_blank';cta.rel='noopener';later.type='button';later.onclick=function(){modal.hidden=true;};actions.append(cta,later);card.append(head,benefits,actions);modal.append(card);document.body.append(modal);cta.focus();return false;
  }
  function showPill(){if(pill||operator||!pending)return;pill=node('button','kiwi-entitlement-pill');pill.type='button';pill.append(node('i'),document.createTextNode('Mode découverte · Activer Kiwi'));pill.onclick=showPaywall;document.body.append(pill);}
  function blockedWord(el){
    if(!el)return false;if(el.closest('nav,.sidebar,[role="tablist"],.kiwi-entitlement-layer,.kiwi-entitlement-pill'))return false;
    if(el.hasAttribute&&el.hasAttribute('download'))return true;
    var s=((el.getAttribute('data-action')||'')+' '+(el.getAttribute('aria-label')||'')+' '+(el.textContent||'')).toLowerCase();
    return /(ajout|nouve|cré|creer|enregistr|sauveg|export|télécharg|telecharg|imprim|génér|gener|import|supprim|modifi|publi|activ|désactiv|desactiv|encaiss|rembours|envoyer|valider|connecter|commander)/.test(s);
  }
  function explorationControl(el){
    var s=((el.type||'')+' '+(el.name||'')+' '+(el.id||'')+' '+(el.className||'')+' '+(el.placeholder||'')+' '+(el.getAttribute&&el.getAttribute('aria-label')||'')).toLowerCase();
    return /search|recher|filter|filtr|date|range|period|périod|tri|sort/.test(s)||el.closest('[role="search"],[data-filter]');
  }
  function installSubscription(){
    document.addEventListener('click',function(e){if(!pending||operator)return;var el=e.target&&e.target.closest&&e.target.closest('button,a,[role="button"]');if(blockedWord(el)){e.preventDefault();e.stopImmediatePropagation();showPaywall();}},true);
    document.addEventListener('beforeinput',function(e){if(!pending||operator||explorationControl(e.target))return;e.preventDefault();e.stopImmediatePropagation();showPaywall();},true);
    document.addEventListener('click',function(e){if(!pending||operator)return;var el=e.target&&e.target.closest&&e.target.closest('input,select,textarea,[contenteditable="true"]');if(el&&!explorationControl(el)){e.preventDefault();e.stopImmediatePropagation();showPaywall();}},true);
    document.addEventListener('submit',function(e){if(!pending||operator)return;var f=e.target;if(f&&/search|filter/i.test(String(f.getAttribute('role')||'')+' '+String(f.className||'')))return;e.preventDefault();e.stopImmediatePropagation();showPaywall();},true);
    if(nativeFetch)window.fetch=function(input,init){var method=String((init&&init.method)||'GET').toUpperCase(),url=String(typeof input==='string'?input:(input&&input.url)||'');if(pending&&!operator&&!/^(GET|HEAD|OPTIONS)$/.test(method)&&!/^\/(?:api\/config|api\/me|auth\/|api\/support)/.test(url)){showPaywall();return Promise.resolve(new Response(JSON.stringify({error:'subscription-required'}),{status:402,headers:{'Content-Type':'application/json'}}));}return nativeFetch(input,init);};
  }
  function privacyToast(){var t=node('div','kiwi-privacy-toast','Mode confidentialité : action désactivée pour protéger le client.');document.body.append(t);setTimeout(function(){t.remove();},2600);}
  function sensitive(el){
    if(!el||el.closest('.kiwi-privacy-bar,.kiwi-entitlement-layer,script,style,nav,.sidebar,[role="tablist"],[data-range]'))return false;
    var direct=Array.prototype.filter.call(el.childNodes,function(n){return n.nodeType===3;}).map(function(n){return n.textContent||'';}).join(' ').trim();
    var s=el.children.length?direct:(el.textContent||'').trim();if(!s)return false;
    return /\d/.test(s)||/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(s);
  }
  function mask(root){
    if(!privacy)return;root=root||document.body;if(root.nodeType===1&&sensitive(root))root.classList.add('kiwi-private-value');
    root.querySelectorAll('*').forEach(function(el){if(sensitive(el))el.classList.add('kiwi-private-value');});
    root.querySelectorAll('input[type="number"],input[type="tel"],input[type="email"],input[data-money]').forEach(function(el){el.classList.add('kiwi-private-input');el.readOnly=true;});
  }
  function installPrivacy(){
    if(!privacy||privacyInstalled)return;privacyInstalled=true;document.documentElement.classList.remove('kiwi-privacy-pending');document.documentElement.classList.add('kiwi-privacy-mode');
    var bar=node('div','kiwi-privacy-bar','Mode confidentialité · chiffres masqués · lecture seule');var quit=node('button','',"Quitter");quit.type='button';quit.onclick=function(){params.delete('privacy');location.search=params.toString();};bar.append(quit);document.body.append(bar);
    mask(document.body);var queued=false;new MutationObserver(function(){if(queued)return;queued=true;setTimeout(function(){queued=false;mask(document.body);},40);}).observe(document.body,{childList:true,subtree:true,characterData:true});
    document.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();privacyToast();},true);
    document.addEventListener('click',function(e){var el=e.target&&e.target.closest&&e.target.closest('button,[role="button"]');if(!el||el.closest('.kiwi-privacy-bar')||el.closest('nav,.sidebar,[role="tablist"]'))return;if(blockedWord(el)){e.preventDefault();e.stopImmediatePropagation();privacyToast();}},true);
    if(nativeFetch)window.fetch=function(input,init){var method=String((init&&init.method)||'GET').toUpperCase();if(!/^(GET|HEAD|OPTIONS)$/.test(method)){return Promise.resolve(new Response(JSON.stringify({error:'privacy-read-only'}),{status:403,headers:{'Content-Type':'application/json'}}));}return nativeFetch(input,init);};
  }
  function acceptConfig(cfg){var s=cfg&&cfg.subscription;pending=!!(s&&s.active===false);if(pending)showPill();else if(pill){pill.remove();pill=null;}}
  document.addEventListener('kiwi-config',function(e){acceptConfig(e.detail||window.KiwiConfig);});
  function confirmIdentity(state){
    operator=!!(state&&state.operator===true);privacy=operator&&wantsPrivacy;
    document.documentElement.classList.remove('kiwi-privacy-pending');
    if(operator){if(pill){pill.remove();pill=null;}if(modal){modal.remove();modal=null;}}
    if(privacy)installPrivacy();
  }
  function boot(){
    installSubscription();acceptConfig(window.KiwiConfig);
    document.addEventListener('kiwi-identity',function(e){confirmIdentity(e&&e.detail);},{once:true});
    var identity=window.KiwiIdentity;
    if(identity&&identity.ready&&typeof identity.ready.then==='function')identity.ready.then(confirmIdentity,function(){confirmIdentity(null);});
    else confirmIdentity(null);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.KiwiSubscription={active:function(){return !pending;},guard:function(){return pending?showPaywall():true;},open:showPaywall,whatsapp:WA};
})();
