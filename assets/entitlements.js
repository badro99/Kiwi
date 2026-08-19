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
  /* ── LE PANNEAU D'ACTIVATION ───────────────────────────────────────────────
   * Il s'ouvre quand un compte encore en attente touche une action payante, et
   * il doit se REFERMER : « Continuer à explorer » est la moitié utile de
   * l'écran, celle qui rend le tableau de bord visitable en attendant.
   *
   * Il ne se refermait pas. `modal.hidden = true` posait bien l'attribut, mais
   * la règle `.kiwi-entitlement-layer{display:grid}` d'entitlements.css bat le
   * `[hidden]{display:none}` de la feuille du navigateur : le panneau restait
   * peint, par-dessus tout, et le bouton semblait mort. Rien en console, rien
   * dans le réseau — le clic partait, il n'avait simplement aucun effet visible.
   * On ferme donc par CLASSE (`.is-off`, écrite dans notre propre feuille, donc
   * de force égale et déclarée après), et l'attribut reste pour l'accessibilité.
   *
   * Trois sorties plutôt qu'une, parce qu'un panneau dont on doute qu'il se
   * ferme est un panneau qu'on essaie de fermer par tous les moyens : la croix,
   * la touche Échap, le fond. */
  var lastFocus=null;
  function closePaywall(){
    if(!modal)return;
    modal.classList.add('is-off');modal.hidden=true;
    document.documentElement.classList.remove('kiwi-entitlement-open');
    try{if(lastFocus&&lastFocus.focus)lastFocus.focus();else if(pill)pill.focus();}catch(_){}
  }
  function openPaywall(){
    modal.classList.remove('is-off');modal.hidden=false;
    document.documentElement.classList.add('kiwi-entitlement-open');
  }
  function showPaywall(){
    if(operator||!pending)return true;
    try{lastFocus=document.activeElement;}catch(_){lastFocus=null;}
    if(modal){openPaywall();focusFirst();return false;}
    modal=node('div','kiwi-entitlement-layer');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Abonnement Kiwi requis');
    var card=node('section','kiwi-entitlement-card');card.tabIndex=-1;var head=node('div','kiwi-entitlement-head'),kick=node('div','kiwi-entitlement-kicker');kick.append(node('span'),document.createTextNode(' Activation Kiwi'));
    /* La croix : une sortie visible, avant même de lire les boutons du bas. */
    var x=node('button','kiwi-entitlement-x');x.type='button';x.setAttribute('aria-label','Fermer et continuer à explorer');x.textContent='\u00d7';x.onclick=closePaywall;
    head.append(kick,node('h2','',"Votre espace est prêt."),node('p','',"Explorez tout le tableau de bord dès maintenant. L\u2019activation ouvre les ajouts, les exports et les encaissements \u2014 votre configuration reste en place, rien n\u2019est \u00e0 refaire."));
    var benefits=node('div','kiwi-entitlement-benefits');
    /* « God Mode » est notre mot d'atelier, pas celui du commerçant : il lisait
       ici le nom d'une console qu'il ne verra jamais. */
    [['Rien ne se perd','Votre param\u00e9trage et vos articles restent en place.'],
     ['Une vraie personne','L\u2019\u00e9quipe Kiwi valide votre formule avec vous.'],
     ['Ouverture le jour m\u00eame','Votre \u00e9tablissement s\u2019ouvre d\u00e8s l\u2019accord, sans r\u00e9installation.']].forEach(function(x2,i){var d=node('div');d.append(node('em','',String(i+1)),node('b','',x2[0]),node('span','',x2[1]));benefits.append(d);});
    var actions=node('div','kiwi-entitlement-actions'),cta=node('a','',"Parler \u00e0 Kiwi sur WhatsApp"),later=node('button','',"Continuer \u00e0 explorer");
    cta.href=WA;cta.target='_blank';cta.rel='noopener';
    later.type='button';later.className='kiwi-entitlement-later';later.onclick=closePaywall;
    actions.append(cta,later);
    var foot=node('div','kiwi-entitlement-foot','Vous gardez l\u2019acc\u00e8s en lecture aussi longtemps que vous le souhaitez.');
    card.append(x,head,benefits,actions,foot);modal.append(card);
    /* Le fond ferme, la carte non : un clic dans la carte ne doit pas la fermer. */
    modal.addEventListener('mousedown',function(e){if(e.target===modal)closePaywall();});
    modal.addEventListener('keydown',function(e){
      if(e.key==='Escape'){e.stopPropagation();closePaywall();return;}
      if(e.key!=='Tab')return;
      /* Piège à focus : sans lui, la tabulation sort du panneau et parcourt un
         tableau de bord que le panneau recouvre — on tabule dans le vide. */
      var f=modal.querySelectorAll('button,a[href]');if(!f.length)return;
      var first=f[0],last=f[f.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    });
    document.body.append(modal);openPaywall();focusFirst();return false;
  }
  /* Le focus va sur la CARTE, pas sur un bouton : posé sur « Continuer à
     explorer », l'anneau de focus faisait de la sortie l'action la plus voyante
     de l'écran ; posé sur WhatsApp, c'était une main sur l'épaule. La carte
     reçoit le focus (tabindex=-1), la lecture d'écran annonce le dialogue, et
     la première tabulation tombe sur la croix. */
  function focusFirst(){try{modal.querySelector('.kiwi-entitlement-card').focus({preventScroll:true});}catch(_){}}
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
    if(operator){if(pill){pill.remove();pill=null;}if(modal){modal.remove();modal=null;}document.documentElement.classList.remove('kiwi-entitlement-open');}
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
