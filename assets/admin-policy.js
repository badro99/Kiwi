/* Shared operator definitions. Pure: no browser, database, or clock side effects. */
(function(root, factory){
  var policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  else root.KiwiAdminPolicy = policy;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  function access(c){
    if (c.status === 'suspended' || c.store_status === 'suspended') return 'suspended';
    return c.store_status === 'pending' || c.subscription === 'pending' ? 'pending' : 'active';
  }
  function civilDate(now){ return new Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Casablanca',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)); }
  function commercial(c, now){
    var a = access(c), today = civilDate(now);
    if (a !== 'active') return a;
    var trial = c.subscription_kind === 'trial';
    var start = trial ? c.trial_start : c.subscription_start;
    var end = trial ? c.trial_end : c.subscription_end;
    if (end && end < today) return 'expired';
    if (start && start > today) return 'scheduled';
    if (trial) return 'trial';
    if (!c.plan && !(Number(c.mrr) > 0)) return 'unpriced';
    return 'active';
  }
  function signals(rows, now){
    var result = [];
    (rows || []).filter(function(c){return !c.demo;}).forEach(function(c){
      function add(kind, priority, title, detail, tab){ result.push({id:c.merchant+':'+kind,signal_key:kind,merchant:c.merchant,priority:priority,title:title,detail:detail,tab:tab||'summary'}); }
      var a = access(c), cs = commercial(c, now);
      if (a === 'pending') add('access',2,'Accès en attente','Vérifier les prérequis avant d’ouvrir les opérations.','commercial');
      if (a === 'suspended') add('suspended',2,'Établissement suspendu','Décider de la suite et consigner le suivi.','commercial');
      if (cs === 'unpriced') add('terms',3,'Conditions commerciales à compléter','L’accès est ouvert. Aucun tarif n’est enregistré.','commercial');
      if (cs === 'expired') add('renewal',2,'Échéance dépassée','Vérifier le renouvellement. Ce signal ne prouve pas un impayé.','commercial');
      var end = c.subscription_kind === 'trial' ? c.trial_end : c.subscription_end;
      var days = end ? (Date.parse(end+'T12:00:00Z')-Date.parse(civilDate(now)+'T12:00:00Z'))/86400000 : null;
      if (a === 'active' && days != null && days >= 0 && days <= 7) add('renewal-soon',2,'Échéance dans '+days+' j','Préparer le point commercial et la prochaine étape.','commercial');
      if (a === 'active' && c.last_ts && now-c.last_ts > 7*86400000) add('activity',2,'Activité à vérifier','Aucune vente reçue depuis plus de 7 jours. Vérifier fermeture et synchronisation.','summary');
      if (a === 'active' && !c.last_ts) add('onboarding',2,'Premier usage à accompagner','Aucune vente reçue. Vérifier le parcours adapté au métier.','onboarding');
      if (!c.city) add('profile',4,'Localisation à renseigner','Compléter la ville dans la fiche commerciale.','commercial');
    });
    return result.sort(function(a,b){return a.priority-b.priority || a.merchant.localeCompare(b.merchant) || a.id.localeCompare(b.id);});
  }
  function onboarding(type){
    var steps = [
      ['contact','Confirmer le contact et les conditions','Contact de suivi, offre ou essai et prochain rendez-vous confirmés.'],
      ['catalog','Préparer le catalogue','Articles, prix et catégories relus avec le commerçant.'],
      ['access','Vérifier les accès et appareils','Chaque personne utilise le rôle prévu et le bon établissement.'],
      ['hardware','Valider le matériel sur place','Impression et équipements requis testés, résultat confirmé par le commerçant.']
    ];
    var flow = type === 'hotel' ? 'Réservation, arrivée, note client et règlement vérifiés.' : type === 'pressing' ? 'Dépôt, étiquettes, atelier et retrait vérifiés.' : /restaurant|cafe|fastfood|pizzeria|boulangerie|traiteur|foodtruck/.test(type || '') ? 'Commande, cuisine, service, règlement et rapport vérifiés.' : 'Vente, reçu, stock et rapport vérifiés.';
    steps.push(['workflow','Vérifier un parcours complet',flow],['handover','Former et transmettre','Équipe formée, guide partagé et prochaine vérification planifiée.']);
    return steps.map(function(s){return {key:'onboarding:'+s[0],title:s[1],detail:s[2]};});
  }
  function businessDay(d){var p=String(d||'').split('-');return p.length===3?new Date(Date.UTC(+p[0],+p[1]-1,+p[2])).toLocaleDateString('fr-FR',{day:'numeric',month:'short',timeZone:'UTC'}):String(d||'');}
  function ago(ts, now){if(!ts)return 'jamais';var m=Math.max(0,Math.round((now-ts)/60000));return m<1?'à l’instant':m<60?'il y a '+m+' min':m<48*60?'il y a '+Math.round(m/60)+' h':'il y a '+Math.round(m/1440)+' j';}
  function fmt(n){return Number(n||0).toLocaleString('fr-MA',{maximumFractionDigits:2});}
  /* One verdict per establishment from facts the server already holds: the
   * tills' own sync report, the latest Z comparison, sale conflicts and 7-day
   * activity (src rows already scoped to this merchant). Each problem says what
   * was observed. Silence counts only against the establishment's own rhythm. */
  function storeHealth(c, src, now){
    var problems=[], watch=[], tills=[], seen={};
    (src.caisseSync||[]).forEach(function(r){if(r.app!=='caisse'||!r.deviceId||seen[r.deviceId])return;seen[r.deviceId]=1;tills.push(r);});
    var live=tills.filter(function(t){return now-t.updated_ts<24*3600000;});
    var pending=0, blocked=0, oldest=0;
    live.forEach(function(t){var s=t.sync;if(!s)return;pending+=s.total||0;blocked+=s.blocked||0;if(s.oldestPendingAt&&(!oldest||s.oldestPendingAt<oldest))oldest=s.oldestPendingAt;});
    if(blocked)problems.push(blocked+' vente(s) refusée(s) par le serveur, bloquée(s) en caisse');
    if(pending-blocked>0&&oldest&&now-oldest>30*60000)problems.push((pending-blocked)+' vente(s) non confirmée(s) depuis '+ago(oldest,now).replace('il y a ',''));
    var z=(src.zChecks||[])[0]||null;
    if(z&&z.status!=='matched')problems.push('Z du '+businessDay(z.business_day)+' : écart '+fmt((Number(z.reported_cents)-Number(z.server_cents))/100)+' MAD'+(z.missing_count?' · '+z.missing_count+' vente(s) absente(s) du serveur':'')+(z.blocked_count?' · '+z.blocked_count+' bloquée(s)':''));
    var conflicts=(src.conflicts||[]).length;
    if(conflicts)problems.push(conflicts+' vente(s) reçue(s) deux fois avec des montants différents');
    var act=(src.activity||[])[0]||{}, days=Number(act.active_days_7d)||0;
    var last=Math.max(Number(c.last_ts)||0,Number(act.last_ts)||0);
    if(days>=3&&last&&now-last>26*3600000)watch.push('Aucune vente reçue depuis '+ago(last,now).replace('il y a ','')+', alors qu’il vend '+days+' jours sur 7');
    if(days>=1&&tills.length&&!live.length)watch.push('Aucune caisse n’a donné signe de vie depuis 24 h');
    var errs=(src.errors||[]).reduce(function(n,e){return n+(Number(e.count)||1);},0);
    if(errs)watch.push(errs+' erreur(s) applicative(s) sur 7 jours');
    var level=problems.length?'bad':watch.length?'warn':(days||live.length)?'good':'idle';
    return {client:c,level:level,problems:problems,watch:watch,tills:tills.length,live:live.length,pending:pending,blocked:blocked,z:z,days:days,last:last,errors:errs};
  }
  return {access:access,commercial:commercial,civilDate:civilDate,signals:signals,onboarding:onboarding,storeHealth:storeHealth,businessDay:businessDay,ago:ago};
});
