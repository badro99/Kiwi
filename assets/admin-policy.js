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
  return {access:access,commercial:commercial,civilDate:civilDate,signals:signals,onboarding:onboarding};
});
