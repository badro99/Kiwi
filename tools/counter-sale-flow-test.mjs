/* Vente au comptoir · le comptoir ne joue plus au client absent
 * ───────────────────────────────────────────────────────────────────────────
 * Trois défauts signalés depuis la salle, le même jour, et qui se tiennent :
 *
 * 1. « Marquer prêt » puis « Remettre au client » s'affichaient sur une vente
 *    saisie AU COMPTOIR. Le client est devant la caisse : les deux boutons
 *    n'informent personne et ajoutent deux gestes au coup de feu.
 * 2. L'app serveur annonçait « commande envoyée · cuisine » sans rien envoyer.
 * 3. Le même envoi sautait SILENCIEUSEMENT les lignes sans identifiant.
 *
 * (2) et (3) sont le même défaut vu deux fois : une sortie anticipée qui
 * répondait `{ ok: true }` à un lot vide. C'est le plus grave de la liste,
 * parce que le produit AFFIRME avoir fait une chose qu'il n'a pas faite.
 *
 * Ce contrôle lit les sources : il n'y a pas de DOM ici, et le vrai parcours
 * navigateur est couvert ailleurs. Ce qu'il empêche, c'est la régression par
 * réécriture — que quelqu'un remette `ok: true` sur le chemin vide, ou
 * rebranche les deux boutons sur une vente du comptoir. */
import fs from 'fs';
import assert from 'assert';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`✓ ${name}`); }

const serveur = fs.readFileSync(new URL('../kiwi-serveur.html', import.meta.url), 'utf8');
const caisse = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');

/* ── 1 · l'envoi cuisine ne peut plus mentir ─────────────────────────────── */

check('an empty send batch is never reported as a successful kitchen send', () => {
  /* Le défaut exact : `if (!pending) return Promise.resolve({ ok: true, nothing: true });`
   * suivi d'un appelant qui ne teste que `res.ok`. */
  assert.ok(!/if \(!pending\) return Promise\.resolve\(\{ ok: true, nothing: true \}\);/.test(serveur),
    'the unconditional ok:true on an empty batch must be gone');
  /* Des lignes attendaient et aucune n'a pu partir ⇒ échec franc. */
  assert.match(serveur, /if \(dropped > 0\) return Promise\.resolve\(\{ ok: false, error: 'unsendable-lines', dropped \}\);/);
});

check('a line without an id is counted instead of being silently dropped', () => {
  assert.ok(!/if \(!dq \|\| !l\.id\) return;/.test(serveur),
    'the combined guard hid unsendable lines inside the "nothing to send" case');
  assert.match(serveur, /if \(!l\.id\) \{ dropped\+\+; return; \}/);
  assert.match(serveur, /'unsendable-lines':/);
});

check('"Lancer la commande" only announces the kitchen when something left', () => {
  /* `nothing` doit être traité AVANT le succès, sinon le drapeau « non
   * envoyée » est effacé et le serveur repart au plan de salle. */
  assert.match(serveur, /if \(res\.ok && res\.nothing\) \{/);
  assert.match(serveur, /rien de nouveau à envoyer/);
  /* Envoi partiel : ce qui est resté à quai doit être dit. */
  assert.match(serveur, /res\.dropped > 0[\s\S]{0,120}NON envoyée\(s\)/);
  assert.match(serveur, /ok: true, number: j\.number, dropped,/);
});

check('the dirty flag survives a send that sent nothing', () => {
  /* Le retour anticipé doit rendre la main AVANT `dirtyOrders.delete`. */
  /* On part de l'appel réseau, pas du début de la branche : le chemin de
   * démonstration (SV_DEMO) efface lui aussi le drapeau, plus haut, et
   * fausserait la comparaison de position. */
  const handler = serveur.slice(serveur.indexOf('svSendOrder(sentId).then((res) => {'));
  const nothingAt = handler.indexOf('res.ok && res.nothing');
  const clearAt = handler.indexOf('dirtyOrders.delete(sentId)');
  assert.ok(nothingAt > 0 && clearAt > 0 && nothingAt < clearAt,
    'the nothing-sent branch must return before the table is marked sent');
});

/* ── 2 · la vente au comptoir se termine en étant payée ───────────────────── */

check('provenance is known at creation, not only once the queue answers', () => {
  assert.match(caisse, /opChannel: 'caisse',/);
  assert.match(caisse, /function vrapIsCounterSale\(o\) \{/);
  /* OrderPro reste OrderPro : seul 'kiwi' désigne le client à distance. */
  assert.match(caisse, /if \(o\.opChannel\) return o\.opChannel !== 'kiwi';/);
});

check('a counter sale offers neither "Marquer prêt" nor "Remettre au client"', () => {
  assert.match(caisse, /const readyBtn = \(!ready && o\.status !== 'held' && !counterSale\)/);
  assert.match(caisse, /\} else if \(!o\.pickedUp && !counterSale\) \{/);
  /* …et une commande OrderPro les garde : c'est tout l'intérêt de la
   * distinction, le client absent doit toujours être prévenu puis constaté. */
  assert.match(caisse, /data-vrap-handover="\$\{o\.num\}">Remettre au client<\/button>/);
});

check('paying a counter sale hands it over, so no session is left open', () => {
  assert.match(caisse, /if \(vrapIsCounterSale\(o\)\) \{\s*\n\s*o\.pickedUp = true;/);
  /* `served` part alors par le chemin habituel — celui-là même qu'empruntait
   * « Remettre » — donc la session takeout se ferme comme avant. */
  assert.match(caisse, /const remoteStatus = o\.pickedUp \? 'served' : /);
  /* On ne ment pas sur l'état cuisine au passage. */
  assert.ok(!/o\.pickedUpAt = vrapHandoverTime\(o\.pickedUpTs\);\s*\n\s*if \(o\.status !== 'ready'\) o\.status = 'ready';/.test(caisse),
    'payment must not fake a ready kitchen state');
});

check('the server still accepts served straight from accepted', () => {
  /* Le point d'appui de tout ce qui précède : sans lui, encaisser une vente
   * encore en cuisine répondrait 409 et la carte resterait EN COURS. */
  const queue = fs.readFileSync(new URL('../functions/api/order/queue.js', import.meta.url), 'utf8');
  assert.match(queue, /served:\s*\['ready', 'accepted'\],/);
});


/* ── 3 · annuler un article déjà en cuisine, sans remboursement ───────────── */

check('removing a cooking takeaway line opens the cancellation reason instead of vanishing', () => {
  /* Le défaut : `changeCartLineQty` retirait la ligne du panier sans rien dire.
   * La brigade continuait de préparer un plat sorti de l'addition. */
  assert.match(caisse, /if \(delta < 0 && editing && editing\.opId && editing\.status !== 'held'\) \{\s*\n\s*openCaisseVoidModal\(null, line, \{ orderId: editing\.opId, cart: true \}\);/);
  /* `held` = pas encore payée donc pas encore partie en cuisine : rien à
   * annuler, la ligne se retire comme dans un panier neuf. */
  assert.match(caisse, /editing\.status !== 'held'/);
});

check('a takeaway void names its order, since it has no table', () => {
  assert.match(caisse, /\.\.\.\(scope\.orderId \? \{ orderId: scope\.orderId \} : \{ table: tableId \}\)/);
  /* Le serveur sait déjà viser une commande par son id — rien de neuf côté API. */
  const queue = fs.readFileSync(new URL('../functions/api/order/queue.js', import.meta.url), 'utf8');
  assert.match(queue, /if \(b\.voidLine\.orderId\) \{/);
});

check('the line leaves the cart only once the kitchen has been told', () => {
  const confirm = caisse.slice(caisse.indexOf('async function confirmCaisseVoid()'));
  const postAt = confirm.indexOf("fetch('/api/order/queue'");
  const removeAt = confirm.indexOf('cart = applyGroupedLineQtyDelta(cart, line, -1);');
  assert.ok(postAt > 0 && removeAt > postAt,
    'the local removal must follow the server call, never precede it');
  /* Un échec réseau rend la main AVANT de toucher au panier : l'addition ne
   * doit jamais perdre une ligne que la cuisine n'a pas vue partir. */
  assert.match(confirm, /catch \(err\) \{[\s\S]{0,220}?return;\s*\n\s*\}/);
});

check('cancelling an item is not a refund path', () => {
  /* La garde qui rend tout cela vrai : `voidLine` ne vise que des commandes
   * NON encaissées. Tant qu'aucun argent n'est pris, il n'y a rien à rendre —
   * et une fois encaissé, rendre l'argent EST un remboursement, par
   * définition. Ce contrôle fige la frontière plutôt que de la franchir. */
  const queue = fs.readFileSync(new URL('../functions/api/order/queue.js', import.meta.url), 'utf8');
  /* On vise les marqueurs UNIQUES du gestionnaire : le bloc d'autorisation,
   * plus haut, commence par les mêmes mots et donnerait une tranche vide. */
  const voidBlock = queue.slice(queue.indexOf("if (b && b.voidLine && typeof b.voidLine === 'object')"), queue.indexOf("if (b && b.editLine && typeof b.editLine === 'object')"));
  assert.ok(voidBlock.includes('paid_ts IS NULL'),
    'voidLine must stay scoped to unpaid orders');
  assert.ok(!/rf-confirm|Rembourser/.test(voidBlock),
    'the item cancellation must not reach into the refund modal');
});

console.log(`\nVente au comptoir : ${checks} contrôles passés.`);
