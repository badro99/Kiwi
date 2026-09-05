#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · GARDE-FOU des sorties du MODE COMMANDE
 * ---------------------------------------------------------------------------
 * Le serveur ouvre une mesa, le client n'est finalement pas prêt à commander,
 * et il veut revenir en arrière. Ça a été impossible : la croix du panneau
 * appelait closeRightPanel(), écrit pour la salle, qui efface `selectedId` et
 * laisse `mode` à 'order'. À partir de là la caisse n'était plus utilisable :
 *
 *   · les pastilles Salle / À emporter répondaient « valide ou annule d'abord »,
 *     alors qu'il n'y avait plus rien à valider ni à annuler ;
 *   · « Envoyer en cuisine » et « Annuler commande » disparaissaient avec le
 *     panneau, et commençaient de toute façon par `if (!selectedId) return` :
 *     ils ne faisaient rien, et sans le dire ;
 *   · on pouvait continuer à taper des plats, voir le total monter, appuyer sur
 *     « Envoyer en cuisine » — et rien ne partait en cuisine.
 *
 * Seul un rechargement de la page en sortait. Le comptoir l'a signalé ainsi :
 * « on ne peut pas revenir en arrière, plus aucun bouton ne marche ».
 *
 * `mode` et `selectedId` sont les deux moitiés d'un même état. Ce test vérifie
 * qu'elles ne peuvent plus se séparer : on rejoue les six sorties possibles sur
 * une machine à états extraite de la page, et on exige qu'AUCUNE ne laisse la
 * caisse en mode commande sans mesa.
 *
 * On teste des contrats de source (le câblage des boutons) ET un invariant de
 * comportement — parce que c'est l'invariant, pas la forme du code, qui a
 * manqué ici.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CAISSE = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) pass++; else fails.push(label); }
function eq(label, got, want) {
  if (got === want) pass++;
  else fails.push(`${label} — attendu ${JSON.stringify(want)}, obtenu ${JSON.stringify(got)}`);
}

/* ── 1. Les contrats de source ────────────────────────────────────────────
 * Ce sont les lignes exactes dont l'absence a produit la panne. Un test de
 * comportement seul ne les protège pas : on peut très bien recâbler la croix
 * sur closeRightPanel() sans que le modèle ci-dessous s'en aperçoive. */

// La croix du panneau doit connaître le mode commande.
const closeHandler = (CAISSE.match(/\$\('#rp-close'\)\.addEventListener\('click',[\s\S]{0,2400}?\n {4}\}\);/) || [''])[0];
ok('la croix du panneau existe toujours', !!closeHandler);
ok('la croix traite explicitement le mode commande',
  /mode === 'order'/.test(closeHandler));
ok('la croix ne jette pas une commande déjà saisie',
  /orderInProgressCount\(\)\s*>\s*0/.test(closeHandler));
ok('la croix sur une mesa vide annule proprement (retour salle)',
  /cancelNewOrder\(\)/.test(closeHandler));
/* closeRightPanel() reste la bonne réponse EN SALLE — ce qu'on exige, c'est que
 * le mode commande soit intercepté AVANT d'y tomber. On compare donc l'appel
 * lui-même (parenthèses + point-virgule), pas la mention dans le commentaire
 * qui raconte la panne. */
ok("la croix n'atteint closeRightPanel() qu'après avoir écarté le mode commande",
  closeHandler.lastIndexOf('closeRightPanel();') > closeHandler.indexOf("mode === 'order'"));

// Les pastilles doivent laisser sortir quand il n'y a rien à perdre.
const pillHandler = (CAISSE.match(/\$\$\('\.mode-pill'\)\.forEach[\s\S]{0,1400}?\n {4}\}\);/) || [''])[0];
ok('les pastilles de mode existent toujours', !!pillHandler);
ok('une mesa VIDE peut être quittée par les pastilles',
  /orderInProgressCount\(\)\s*>\s*0/.test(pillHandler) && /cancelNewOrder\(\)/.test(pillHandler));
ok('une commande COMMENCÉE garde son garde-fou',
  /Valide ou annule la commande d\\?'abord/.test(pillHandler));

// Annuler doit réussir même sans mesa — c'était la dernière issue, et elle
// partait en `return` silencieux.
const cancelFn = (CAISSE.match(/function cancelNewOrder\(\)\s*\{[\s\S]{0,3400}?\n {4}\}/) || [''])[0];
ok('cancelNewOrder existe toujours', !!cancelFn);
ok("cancelNewOrder ne renonce plus quand il n'y a pas de mesa",
  !/^\s*if \(!selectedId\) return;/m.test(cancelFn));
ok('cancelNewOrder repasse toujours par le retour salle', /backToSalle\(\)/.test(cancelFn));
ok('cancelNewOrder survit à une table disparue du plan',
  /if \(t\) \{ t\.status/.test(cancelFn));

// Le bouton d'envoi ne doit plus être muet.
const validateWire = (CAISSE.match(/getElementById\('validate-order'\)\.addEventListener\([\s\S]{0,700}?\n {4}\}\);/) || [''])[0];
ok('« Envoyer en cuisine » est toujours câblé', !!validateWire);
ok('« Envoyer en cuisine » sans mesa ramène à la salle au lieu de se taire',
  /backToSalle\(\)/.test(validateWire));

// validateOrder ne doit pas lever si le plan a été redessiné pendant la saisie
// (setupRealSalle reconstruit `tables`) — une exception tue l'écouteur et rend
// le bouton mort, exactement le symptôme corrigé.
const validateFn = (CAISSE.match(/function validateOrder\(tableId\)\s*\{[\s\S]{0,900}?t\.status/) || [''])[0];
ok('validateOrder se garde contre une table disparue', /if \(!t\)/.test(validateFn));

// L'addition remise à zéro quand le panneau se vide — sinon la barre repliée du
// téléphone garde le montant de la note précédente.
const emptyFn = (CAISSE.match(/function showEmpty\(\)\s*\{[\s\S]{0,1400}?\n {4}\}/) || [''])[0];
ok('showEmpty remet le total à zéro (barre repliée du téléphone)',
  /#rp-total'\)\.textContent = fmtMAD\(0\)/.test(emptyFn));

/* ── 1 bis. ROUVRIR une mesa pour ajouter ────────────────────────────────────
 * Deuxième panne remontée du comptoir : « on met les couverts, on ajoute des
 * articles, mais on ne peut PAS en rajouter — si quelqu'un arrive, ou si la
 * table prend un dessert ». Une fois la mesa validée, un clic dessus n'ouvrait
 * plus que l'addition et ses moyens de paiement. Les deux contournements
 * possibles étaient faux : annuler la mesa (donc effacer le repas) ou passer
 * par « À emporter » (l'article se décroche de la table).
 *
 * La reprise a une contrainte dure : ce qui est DÉJÀ parti en cuisine ne doit
 * ni repartir, ni pouvoir être modifié à la caisse, ni disparaître si le
 * serveur se ravise. */
ok('le bouton « Ajouter des articles » existe dans le panneau',
  /id="rp-add-items"/.test(CAISSE));
const resumeFn = (CAISSE.match(/function resumeTableOrder\(id\)\s*\{[\s\S]{0,1200}?\n {4}\}/) || [''])[0];
ok('resumeTableOrder existe', !!resumeFn);
ok('resumeTableOrder retourne bien dans le mode commande', /setMode\('order'\)/.test(resumeFn));
ok('resumeTableOrder survit à une table disparue du plan', /if \(!t\)/.test(resumeFn));
ok("resumeTableOrder ne rouvre pas une note déjà encaissée", /'khlass'/.test(resumeFn));
ok("resumeTableOrder n'écrase pas la commande en cours",
  /if \(!tableOrders\[id\]\) tableOrders\[id\] = \[\];/.test(resumeFn));

// Le compteur de garde doit ignorer ce qui est déjà en cuisine, sinon la
// sortie qu'on vient d'ouvrir se referme sur toute mesa rouverte.
const countFn = (CAISSE.match(/function orderInProgressCount\(\)\s*\{[\s\S]{0,400}?\n {4}\}/) || [''])[0];
ok('orderInProgressCount ne compte que ce qui n’est pas encore parti',
  /l\.sent \? 0 : l\.qty/.test(countFn));

// L'empilement d'un article ne doit JAMAIS retomber sur une ligne déjà partie :
// sinon l'addition monte et aucun bon ne part — facturé, jamais préparé.
const addFn = (CAISSE.match(/function pushTableOrderLine\(tableId, item, opts\)\s*\{[\s\S]{0,2200}?\n {4}\}/) || [''])[0];
ok("un ajout ne s'empile jamais sur une ligne déjà en cuisine",
  /find\(l => l\.id === item\.id && !l\.sent/.test(addFn));

// Et une ligne partie ne se décrémente pas depuis la caisse.
const qtyFn = (CAISSE.match(/function changeTableOrderLineQty\(tableId, uid, delta\)\s*\{[\s\S]{0,900}?\n {4}\}/) || [''])[0];
ok('une ligne déjà en cuisine ne se modifie pas depuis la caisse',
  /if \(line\.sent\)/.test(qtyFn));

// Annuler sur une mesa qui mange n'efface que les ajouts.
ok("annuler sur une mesa servie ne jette que les ajouts",
  /tableSentCount\(selectedId\) > 0/.test(cancelFn)
  && /filter\(l => l\.sent\)/.test(cancelFn));

/* ── 1 ter. ANNULER UNE TABLE ORDERPRO DEPUIS SALLE ────────────────────────
 * Un client peut ouvrir la table via NFC, consulter la carte, puis partir sans
 * commander. « Annuler mesa » doit rendre la table et fermer sa session, sans
 * jamais effacer un repas déjà envoyé en cuisine. */
const cancelTableStart = CAISSE.indexOf("else if (a === 'cancel-table')");
const cancelTableEnd = CAISSE.indexOf('\n      });\n    });', cancelTableStart);
const cancelTableWire = cancelTableStart >= 0 && cancelTableEnd > cancelTableStart
  ? CAISSE.slice(cancelTableStart, cancelTableEnd)
  : '';
ok('le bouton Annuler mesa distingue une commande déjà envoyée',
  /tableSentCount\(selectedId\) === 0/.test(cancelTableWire));
ok('Annuler mesa remet une table sans commande à zéro',
  /cancelOpenTable\(selectedId\)/.test(cancelTableWire));
ok('Annuler mesa protège une table avec commande en cours',
  /annulation impossible/.test(cancelTableWire));
const cancelOpenFn = (CAISSE.match(/function cancelOpenTable\(id\)\s*\{[\s\S]{0,1400}?\n    \}/) || [''])[0];
ok('cancelOpenTable existe et libère la session OrderPro',
  /releasePhoneTable\(id, 'caisse', true\)/.test(cancelOpenFn));
ok('cancelOpenTable remet le statut à khawya',
  /t\.status = 'khawya'/.test(cancelOpenFn));
const releaseFn = (CAISSE.match(/function releasePhoneTable\(id, why, force\)\s*\{[\s\S]{0,900}?\n    \}/) || [''])[0];
ok('releasePhoneTable peut fermer une session sans pastille locale',
  /!seat && !force/.test(releaseFn));

// La cuisine ne reçoit que le neuf — la règle existait, elle doit tenir.
const sendFn = (CAISSE.match(/function sendTableToKitchen\(tableId\)\s*\{[\s\S]{0,2600}?\n {4}\}/) || [''])[0];
ok('sendTableToKitchen n’envoie que les lignes non parties', /!l\.sent/.test(sendFn));
ok('sendTableToKitchen marque les lignes envoyées', /l\.sent = true/.test(sendFn));

/* ── 2. L'invariant, rejoué ───────────────────────────────────────────────
 * Un modèle réduit de l'état réel (mode, mesa sélectionnée, lignes saisies) et
 * des cinq gestes qui doivent en sortir. La règle unique : après n'importe
 * quelle séquence, on ne doit JAMAIS être en mode commande sans mesa — c'est
 * cet état-là, et lui seul, qui bloquait la caisse. */
function makeTill() {
  const s = { mode: 'salle', selected: null, orders: {}, cart: [], kitchen: [], toast: '' };

  /* Ce qui est EN JEU : les lignes saisies et pas encore parties. Une ligne
     déjà en cuisine ne se perd pas si on sort, donc elle ne doit pas retenir
     le serveur — c'est toute la différence entre garder son travail et
     l'emprisonner. */
  const count = () => (s.mode !== 'order' || !s.selected)
    ? 0 : (s.orders[s.selected] || []).filter((l) => !l.sent).length;
  const sentCount = (id) => (s.orders[id] || []).filter((l) => l.sent).length;
  const backToSalle = () => { s.mode = 'salle'; };

  return {
    state: s,
    openTable(id) { s.selected = id; s.orders[id] = []; s.mode = 'order'; },
    // rouvrir une mesa installée pour ajouter (dessert, retardataire)
    resume(id) {
      const target = id || s.selected;
      if (!target || !(target in s.orders)) return;
      s.selected = target; s.mode = 'order';
    },
    addDish(n) {
      if (s.mode === 'order' && s.selected) (s.orders[s.selected] ||= []).push({ n, sent: false });
      else s.cart.push(n);
    },
    // la croix du panneau
    pressX() {
      if (s.mode === 'order') {
        if (count() > 0) { s.toast = 'refus'; return; }
        this.cancel(); return;
      }
      s.selected = null;                       // closeRightPanel(), en salle
    },
    // une pastille de mode
    pressPill(to) {
      if (s.mode === 'order') {
        if (count() > 0) { s.toast = 'refus'; return; }
        this.cancel();
        if (to !== 'salle') s.mode = to;
        return;
      }
      s.mode = to;
    },
    cancel() {
      // Une mesa qui mange déjà : on ne jette QUE les ajouts en cours.
      if (s.selected && sentCount(s.selected) > 0) {
        s.orders[s.selected] = s.orders[s.selected].filter((l) => l.sent);
        backToSalle();
        return;
      }
      if (s.selected) { delete s.orders[s.selected]; s.selected = null; }
      backToSalle();
    },
    send() {
      if (s.mode !== 'order') return;
      if (!s.selected) { s.cart = []; backToSalle(); s.toast = 'aucune mesa'; return; }
      const fresh = (s.orders[s.selected] || []).filter((l) => !l.sent);
      if (fresh.length) {
        s.kitchen.push({ table: s.selected, items: fresh.map((l) => l.n) });
        fresh.forEach((l) => { l.sent = true; });
      }
      backToSalle();
    },
  };
}

const stuck = (t) => t.state.mode === 'order' && !t.state.selected;

// a) le geste exact du comptoir : mesa ouverte par erreur, puis la croix.
{
  const t = makeTill();
  t.openTable('T1');
  t.pressX();
  ok('mesa vide + croix → on sort du mode commande', t.state.mode === 'salle');
  ok('mesa vide + croix → la caisse n’est pas bloquée', !stuck(t));
  eq('mesa vide + croix → la table est rendue libre', t.state.orders.T1, undefined);
}

// b) la même chose par la pastille « Salle » — le geste le plus naturel.
{
  const t = makeTill();
  t.openTable('T1');
  t.pressPill('salle');
  eq('mesa vide + pastille Salle → retour salle', t.state.mode, 'salle');
  ok('mesa vide + pastille Salle → pas de blocage', !stuck(t));
}

// c) une commande commencée ne part pas d'un doigt distrait.
{
  const t = makeTill();
  t.openTable('T1'); t.addDish('tajine');
  t.pressX();
  eq('commande saisie + croix → on reste sur la commande', t.state.mode, 'order');
  eq('commande saisie + croix → rien n’est perdu', t.state.orders.T1.length, 1);
  t.pressPill('vrap');
  eq('commande saisie + pastille → refus aussi', t.state.mode, 'order');
  eq('commande saisie + pastille → rien n’est perdu', t.state.orders.T1.length, 1);
  ok('commande saisie → la caisse reste utilisable', !stuck(t));
}

// d) les deux sorties dessinées font bien ce qu'elles annoncent.
{
  const t = makeTill();
  t.openTable('T2'); t.addDish('the'); t.addDish('salade');
  t.send();
  eq('Envoyer en cuisine → retour salle', t.state.mode, 'salle');
  eq('Envoyer en cuisine → la cuisine reçoit la table', t.state.kitchen.length, 1);
  eq('Envoyer en cuisine → avec ses deux plats', t.state.kitchen[0].items.length, 2);

  const u = makeTill();
  u.openTable('T3'); u.addDish('salade');
  u.cancel();
  eq('Annuler commande → retour salle', u.state.mode, 'salle');
  eq('Annuler commande → la mesa est vidée', u.state.orders.T3, undefined);
  eq('Annuler commande → rien ne fuit vers « À emporter »', u.state.cart.length, 0);
}

// e) l'état bloqué, s'il survenait quand même, doit se rattraper tout seul.
{
  const t = makeTill();
  t.openTable('T1');
  t.state.selected = null;                     // on force l'ancienne panne
  ok('état bloqué reproduit pour le test', stuck(t));
  t.send();
  ok('« Envoyer en cuisine » rattrape un état bloqué', !stuck(t));

  const u = makeTill();
  u.openTable('T1'); u.state.selected = null;
  u.cancel();
  ok('« Annuler commande » rattrape un état bloqué', !stuck(u));

  const v = makeTill();
  v.openTable('T1'); v.state.selected = null;
  v.pressPill('salle');
  ok('une pastille rattrape un état bloqué', !stuck(v));

  const w = makeTill();
  w.openTable('T1'); w.state.selected = null;
  w.pressX();
  ok('la croix rattrape un état bloqué', !stuck(w));
}

/* g) LE GESTE MANQUANT : la table redemande quelque chose ───────────────────
 * Le scénario mot pour mot du comptoir — couverts posés, articles saisis,
 * envoyés… et « on ne peut pas en rajouter ». */
{
  const t = makeTill();
  t.openTable('T4');
  t.addDish('tajine'); t.addDish('the');
  t.send();
  eq('mesa envoyée → retour salle', t.state.mode, 'salle');
  eq('mesa envoyée → la cuisine a les deux plats', t.state.kitchen[0].items.length, 2);

  // quelqu'un arrive / la table prend un dessert
  t.resume('T4');
  eq('on peut rouvrir la commande de la mesa', t.state.mode, 'order');
  eq('rouvrir ne perd rien de ce qui est déjà en cuisine', t.state.orders.T4.length, 2);
  t.addDish('cornes de gazelle');
  t.send();
  eq('le deuxième envoi ne relance PAS tout le repas', t.state.kitchen.length, 2);
  eq('le deuxième envoi ne porte que le nouveau plat', t.state.kitchen[1].items.length, 1);
  eq('… et c’est bien le dessert', t.state.kitchen[1].items[0], 'cornes de gazelle');
  eq("l'addition porte les trois articles", t.state.orders.T4.length, 3);
}

// h) rouvrir puis se raviser : les ajouts partent, le repas reste.
{
  const t = makeTill();
  t.openTable('T5'); t.addDish('couscous'); t.send();
  t.resume('T5'); t.addDish('dessert');
  t.cancel();
  eq('annuler un ajout → retour salle', t.state.mode, 'salle');
  eq('annuler un ajout → le repas en cuisine est intact', t.state.orders.T5.length, 1);
  eq('annuler un ajout → le repas est bien celui qui cuit', t.state.orders.T5[0].sent, true);
  ok('annuler un ajout → la mesa reste ouverte', t.state.selected === 'T5');
  eq('annuler un ajout → rien ne repart en cuisine', t.state.kitchen.length, 1);
}

// i) rouvrir une mesa qui mange, puis la croix sans rien taper : on sort, et le
//    repas ne bouge pas. C'est le « ouvert par erreur » version deuxième tour.
{
  const t = makeTill();
  t.openTable('T6'); t.addDish('harira'); t.send();
  t.resume('T6');
  t.pressX();
  eq('mesa servie + croix → retour salle', t.state.mode, 'salle');
  eq('mesa servie + croix → le repas est intact', t.state.orders.T6.length, 1);
  ok('mesa servie + croix → pas de blocage', !stuck(t));
}

// f) balayage : aucune suite de gestes ne doit produire l'état bloqué, NI
//    faire disparaître un plat déjà lancé en cuisine.
{
  const gestes = ['X', 'pillSalle', 'pillVrap', 'send', 'cancel', 'dish', 'resume'];
  let bad = null, lost = null, tried = 0;
  for (const a of gestes) for (const b of gestes) for (const c of gestes) for (const d of gestes) {
    const t = makeTill();
    t.openTable('T1');
    for (const g of [a, b, c, d]) {
      if (g === 'X') t.pressX();
      else if (g === 'pillSalle') t.pressPill('salle');
      else if (g === 'pillVrap') t.pressPill('vrap');
      else if (g === 'send') t.send();
      else if (g === 'cancel') t.cancel();
      else if (g === 'resume') t.resume('T1');
      else t.addDish('plat');
    }
    tried++;
    const seq = [a, b, c, d].join(' → ');
    if (stuck(t) && !bad) bad = seq;
    /* Ce qui est parti en cuisine et n'a PAS été délibérément annulé doit se
       retrouver sur l'addition. Le seul effacement légitime est `cancel` sur
       une mesa sans rien d'envoyé — donc si la cuisine a reçu quelque chose et
       que la mesa existe encore, ses lignes envoyées doivent être là. */
    const sentToKitchen = t.state.kitchen.reduce((n, k) => n + k.items.length, 0);
    const stillBilled = (t.state.orders.T1 || []).filter((l) => l.sent).length;
    if (sentToKitchen > 0 && (t.state.orders.T1 !== undefined) && stillBilled !== sentToKitchen && !lost) {
      lost = seq;
    }
  }
  ok(`aucune des ${tried} suites de 4 gestes ne bloque la caisse`
    + (bad ? ` (bloquée par : ${bad})` : ''), !bad);
  ok('aucune suite ne fait disparaître de l’addition un plat déjà en cuisine'
    + (lost ? ` (perdu par : ${lost})` : ''), !lost);
}

/* ── Verdict ──────────────────────────────────────────────────────────────── */
const line = '─'.repeat(64);
console.log('\n' + line);
if (fails.length) {
  console.log(`\x1b[31m✗ ${fails.length} échec(s) sur ${pass + fails.length}.\x1b[0m`);
  fails.forEach((f) => console.log('  \x1b[31m✗\x1b[0m ' + f));
  console.log(line);
  process.exit(1);
}
console.log(`  \x1b[32m✓\x1b[0m mode commande : sorties ET reprises (${pass} contrôles — croix, pastilles, `
  + 'envoi, annulation,\n    rattrapage, ajout sur mesa servie, balayage 4 gestes)');
console.log(line);
