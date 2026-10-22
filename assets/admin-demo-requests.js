/* Console opérateur · « Démos » : les demandes de démo du site public
 * (POST /api/demo-request, lues par /api/admin/demo-requests).
 * Reprend la coque du support (assets/admin-support.css, classes ks-*) :
 * une liste à gauche, la demande à droite, et trois gestes : appeler,
 * écrire sur WhatsApp, changer le statut. Le bouton du haut compte les
 * demandes nouvelles. */
(function(){'use strict';
  var launch=document.getElementById('demo-console');if(!launch)return;
  var STATUSES=[['new','Nouvelles','Nouvelle'],['contacted','Contactées','Contactée'],['scheduled','Démo planifiée','Démo planifiée'],['done','Démo faite','Démo faite'],['lost','Sans suite','Sans suite'],['spam','Indésirables','Indésirable']];
  var LABEL={},PLURAL={};STATUSES.forEach(function(s){PLURAL[s[0]]=s[1];LABEL[s[0]]=s[2];});
  var DAYS={today:'aujourd’hui',tomorrow:'demain',week:'cette semaine',later:'plus tard'},PARTS={morning:'le matin',afternoon:'l’après-midi',evening:'en fin de journée'};
  var LANGS={fr:'français',en:'anglais',ar:'arabe',de:'allemand',es:'espagnol',it:'italien',nl:'néerlandais'};
  var state={status:'new',requests:[],counts:{},selected:''};
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  /* L'heure du Maroc, celle que le site annonce au visiteur, quel que soit le
     fuseau de l'ordinateur de l'opérateur. */
  function dt(ts){return ts?new Date(Number(ts)).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short',timeZone:(globalThis.KiwiZoneLaw?.effectiveZone('Africa/Casablanca', Number(ts)) || 'Africa/Casablanca')}):'·';}
  /* « Demain » est relatif à l'envoi : lu trois jours plus tard, il désigne un
     autre jour. La vraie date s'écrit à côté, au jour civil du Maroc de
     l'envoi (même règle que slotDate() dans functions/api/_demo-requests.js). */
  function slotDate(d,ts){if(!Number(ts)||['today','tomorrow','week'].indexOf(d)<0)return'';var c={};new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-GB',{timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(Number(ts)).forEach(function(x){c[x.type]=x.value;});var day=new Date(Date.UTC(+c.year,+c.month-1,+c.day,12));if(d==='tomorrow')day.setUTCDate(day.getUTCDate()+1);if(d==='week')day.setUTCDate(day.getUTCDate()+((7-day.getUTCDay())%7));var t=new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('fr-FR',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).format(day);return d==='week'?'jusqu’au '+t:t;}
  function slot(r){var d=DAYS[r.slot_day]||'',p=PARTS[r.slot_part]||'';return [d,d?slotDate(r.slot_day,r.created_ts):'',p].filter(Boolean).join(', ')||'à convenir';}
  var FAMILIES={restaurant:'Restauration',boutique:'Commerce',spa:'Beauté et bien-être',hotel:'Hôtel ou riad'};
  function trade(r){var t=window.KiwiTrades&&window.KiwiTrades.LIST&&window.KiwiTrades.LIST.filter(function(x){return x.id===r.trade;})[0];return t?(t.label&&(t.label.fr||t.label.en))||t.id:(FAMILIES[r.trade]||r.trade||'');}
  /* 06 12 34 56 78 → 212612345678 ; +212… et 00212… gardent leur indicatif. */
  function intl(phone){var p=String(phone||'');if(p.charAt(0)==='+')return p.slice(1);if(p.slice(0,2)==='00')return p.slice(2);if(p.charAt(0)==='0')return '212'+p.slice(1);return p;}
  function waLink(r){var hello=(r.lang==='ar'?'السلام عليكم '+r.first_name+'، معك فريق Kiwi بخصوص طلب العرض '+r.reference+'.':r.lang==='en'?'Hello '+r.first_name+', this is the Kiwi team about your demo request '+r.reference+'.':'Bonjour '+r.first_name+', ici l’équipe Kiwi, au sujet de votre demande de démo '+r.reference+'.');return 'https://wa.me/'+encodeURIComponent(intl(r.phone))+'?text='+encodeURIComponent(hello);}
  function tell(s){if(typeof window.notify==='function'){window.notify(s);return;}var old=document.querySelector('.ks-toast');if(old)old.remove();var n=document.createElement('div');n.className='ks-toast';n.setAttribute('role','status');n.textContent=s;document.body.appendChild(n);requestAnimationFrame(function(){n.classList.add('show');});setTimeout(function(){n.classList.remove('show');setTimeout(function(){n.remove();},220);},3600);}
  async function req(url,opts){var r=await fetch(url,Object.assign({credentials:'same-origin',headers:{'Content-Type':'application/json'}},opts||{})),j=await r.json().catch(function(){return{};});if(!r.ok)throw new Error(j.error||'http-'+r.status);return j;}
  function setBadge(n){launch.innerHTML='Démos'+(n?'<span class="ks-launch-count">'+n+'</span>':'');launch.setAttribute('aria-label',n?'Démos, '+n+(n>1?' nouvelles':' nouvelle'):'Démos');}
  var root=null;
  function shell(){var el=document.createElement('div');el.className='ks-shell';el.setAttribute('data-kd','');el.innerHTML='<style>.ks-shell[data-kd] a.ks-btn{display:inline-flex;align-items:center;text-decoration:none}</style><header class="ks-head"><div><h2>Demandes de démo</h2><p>Envoyées depuis le site · à rappeler au créneau choisi</p></div><span class="ks-space"></span><button data-kd-refresh>Rafraîchir</button><button data-kd-close>Fermer</button></header><main class="ks-body"><nav class="ks-tabs" data-kd-tabs></nav><div class="ks-work" data-kd-work></div></main>';document.body.appendChild(el);return el;}
  async function open(){if(!root){root=shell();bind();}root.hidden=false;await load();}
  function close(){if(root)root.hidden=true;}
  function bind(){
    root.addEventListener('click',async function(e){var b=e.target.closest('button');if(!b||!root.contains(b))return;
      if(b.hasAttribute('data-kd-close'))return close();
      if(b.hasAttribute('data-kd-refresh'))return load();
      if(b.dataset.kdTab){state.status=b.dataset.kdTab;state.selected='';return load();}
      if(b.dataset.kdRow){state.selected=b.dataset.kdRow;return render();}
      if(b.dataset.kdSet)return move(b.dataset.kdSet);
    });
    root.addEventListener('keydown',function(e){if(e.key==='Escape'&&!root.hidden)close();});
  }
  async function load(){try{var j=await req('/api/admin/demo-requests?status='+encodeURIComponent(state.status));state.requests=j.requests||[];state.counts=j.counts||{};if(!state.requests.some(function(x){return x.id===state.selected;}))state.selected=state.requests[0]&&state.requests[0].id||'';setBadge(state.counts.new||0);render();}catch(e){tell('Démos indisponibles · '+e.message);}}
  async function move(status){var r=state.requests.find(function(x){return x.id===state.selected;});if(!r||r.status===status)return;try{await req('/api/admin/demo-requests',{method:'PATCH',body:JSON.stringify({id:r.id,status:status})});tell(r.reference+' · '+LABEL[status]);await load();}catch(e){tell('Action refusée · '+e.message);}}
  function tabs(){var all=0;Object.keys(state.counts).forEach(function(k){all+=state.counts[k];});return STATUSES.map(function(s){var n=state.counts[s[0]]||0;return'<button class="ks-tab'+(state.status===s[0]?' on':'')+'" data-kd-tab="'+s[0]+'">'+s[1]+(n?' · '+n:'')+'</button>';}).join('')+'<button class="ks-tab'+(state.status==='all'?' on':'')+'" data-kd-tab="all">Toutes'+(all?' · '+all:'')+'</button>';}
  function row(r){return'<button class="ks-row'+(r.id===state.selected?' on':'')+'" data-kd-row="'+esc(r.id)+'"><span class="ks-row-top"><b>'+esc(r.business)+'</b><span class="ks-pill">'+esc(LABEL[r.status]||r.status)+'</span></span><p>'+esc(r.first_name)+' · '+esc(slot(r))+' · '+esc(dt(r.created_ts))+'</p></button>';}
  function field(label,value){return'<div><span class="ks-label">'+label+'</span><div>'+value+'</div></div>';}
  function detail(r){
    var moves=STATUSES.filter(function(s){return s[0]!==r.status;}).map(function(s){return'<button class="ks-btn" data-kd-set="'+s[0]+'">'+s[2]+'</button>';}).join('');
    var notified={sent:'Équipe prévenue par e-mail.',failed:'L’e-mail d’alerte a échoué : cette console est la seule trace.',unconfigured:'Aucun e-mail d’alerte configuré : cette console est la seule trace.'}[r.notified]||'';
    return'<div class="ks-detail"><h3>'+esc(r.business)+'</h3><div class="ks-meta">'+esc(r.reference)+' · reçue le '+esc(dt(r.created_ts))+' · '+esc(LABEL[r.status]||r.status)+(r.handled_by?' par '+esc(r.handled_by):'')+'</div>'
      +'<div class="ks-actions"><a class="ks-btn primary" href="tel:'+esc(r.phone)+'">Appeler '+esc(r.phone)+'</a><a class="ks-btn" target="_blank" rel="noopener" href="'+esc(waLink(r))+'">Écrire sur WhatsApp</a>'+(r.email?'<a class="ks-btn" href="mailto:'+esc(r.email)+'">'+esc(r.email)+'</a>':'')+'</div>'
      +'<div class="ks-form"><div class="ks-form-row">'+field('Prénom',esc(r.first_name))+field('Activité',esc(trade(r))||'·')+field('Rappel souhaité',esc(slot(r)))+field('Langue du site',esc(LANGS[r.lang]||r.lang||'·'))+'</div>'
      +(r.note?'<div class="ks-msg"><small>Ce que le commerçant aimerait voir</small><p>'+esc(r.note)+'</p></div>':'')
      +'<div><span class="ks-label">Passer à</span><div class="ks-actions" style="margin-top:4px">'+moves+'</div></div>'
      +(notified?'<p class="ks-meta">'+esc(notified)+(r.page?' Page : '+esc(r.page):'')+'</p>':'')+'</div></div>';
  }
  function render(){if(!root)return;root.querySelector('[data-kd-tabs]').innerHTML=tabs();var r=state.requests.find(function(x){return x.id===state.selected;});root.querySelector('[data-kd-work]').innerHTML='<div class="ks-grid"><section class="ks-panel"><div class="ks-list">'+(state.requests.length?state.requests.map(row).join(''):'<div class="ks-empty">Aucune demande dans cette vue.</div>')+'</div></section><section class="ks-panel">'+(r?detail(r):'<div class="ks-empty">Choisissez une demande.</div>')+'</section></div>';}
  launch.addEventListener('click',function(){open();});
  setTimeout(async function(){try{var j=await req('/api/admin/demo-requests?status=new');setBadge((j.counts&&j.counts.new)||0);}catch(_){}},1400);
  window.KiwiDemoConsole={open:open,close:close,_intl:intl,_waLink:waLink,_slot:slot};
})();
