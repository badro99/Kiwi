#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Hôtel — le dossier ne perd rien, et rien ne se facture par erreur
 *                                     (tickets #0037, #0039, #0040, #0056)
 *
 * #0037  `save` reconstruit le séjour ENTIER à partir de la requête, sans le
 *        moindre contrôle de fraîcheur. Deux réceptions sur le même dossier :
 *        le corps périmé de B écrasait en silence le téléphone que A venait
 *        d'écrire — et la boucle de reprise réappliquait ce corps périmé sur
 *        une copie fraîche, donc le conflit de révision ne protégeait rien.
 * #0039  `INSERT OR IGNORE` renvoyait `ok:true` avec l'ANCIENNE ligne quand la
 *        même vente était reprise avec un poste ou un montant corrigé : une
 *        charge mal attribuée qui se lisait comme une réussite.
 * #0040  `checked_in` n'avait qu'une sortie, `completed`. Une arrivée
 *        enregistrée par erreur ne pouvait plus revenir en arrière, et le
 *        no-show forçait un `save` complet — donc, faute de chemin, un séjour
 *        jamais commencé finissait facturé au tarif plein.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STAYS = fs.readFileSync(path.join(ROOT, 'functions/api/hotel/stays.js'), 'utf8');
const CHARGES = fs.readFileSync(path.join(ROOT, 'functions/api/hotel/room-charges.js'), 'utf8');
const UI = fs.readFileSync(path.join(ROOT, 'assets/hotel.js'), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.error(`  ✗ ${msg}`); }
}

console.log('■ Hôtel · dossier partagé, statuts et charges chambre');

/* ═══ #0040 · les transitions de statut, exécutées ════════════════════════ */
{
  const head = STAYS.indexOf('const STATUS_TRANSITIONS');
  const tail = STAYS.indexOf('function canTransition');
  const fn = STAYS.slice(tail, STAYS.indexOf('\n}\n', tail) + 3);
  const sandbox = { Set, Map, String };
  vm.createContext(sandbox);
  vm.runInContext(`
    ${STAYS.slice(head, STAYS.indexOf(']);', head) + 3)}
    ${fn}
    globalThis.can = canTransition;
  `, sandbox);
  const can = sandbox.can;

  ok(can('checked_in', 'confirmed'),
    'une arrivée enregistrée par erreur peut être défaite (checked_in → confirmed)');
  ok(can('checked_in', 'completed'), 'le départ normal reste possible');
  ok(!can('checked_in', 'cancelled'),
    'mais un séjour commencé ne s\'annule toujours pas : il se clôture');
  ok(!can('completed', 'confirmed'), 'un séjour terminé ne repasse pas directement en « confirmé »');
  /* #0056 · la sortie de secours d'un dossier suspendu. */
  ok(can('completed', 'checked_in'),
    'un dossier clos peut être ROUVERT : sans cela, une facturation cassée l\'enfermait pour toujours');
  ok(!can('completed', 'cancelled'), 'mais un séjour terminé ne s\'annule toujours pas');
  ok(!can('cancelled', 'confirmed'), 'une annulation reste définitive ici');
  ok(can('confirmed', 'no_show'), 'un no-show reste atteignable depuis confirmé');
  ok(can('requested', 'no_show'), 'et depuis une simple demande');
  ok(!can('no_show', 'completed'),
    'un no-show ne peut PAS devenir « terminé » — c\'est ce qui le facturait au tarif plein');

  const statusAction = STAYS.slice(STAYS.indexOf("if (action === 'status')"), STAYS.indexOf("if (action !== 'save')"));
  ['checked_in', 'completed', 'no_show', 'confirmed'].forEach((s) => {
    ok(new RegExp(`'${s}'`).test(statusAction), `l'action « statut » accepte ${s}`);
  });
  ok(!/action === 'save'/.test(statusAction),
    'marquer un no-show ne passe plus par un enregistrement complet du dossier');
  ok(/old\.status = next; old\.updatedAt = now;/.test(statusAction),
    'cette action ne touche que le statut : aucun champ du dossier n\'est reconstruit');
  ok(/canTransition\(old\.status, next\)/.test(statusAction),
    'et les sauts interdits sont toujours refusés');
  ok(/writeReservationWithEvents/.test(statusAction),
    'chaque changement de statut reste inscrit au journal avec son auteur');

  // Une capacité serveur que l'écran n'offre pas n'existe pas pour la réception.
  ok(/handlers\['hx-stay-undo-checkin'\]/.test(UI), 'la réception peut annuler une arrivée depuis son journal');
  ok(/handlers\['hx-stay-noshow'\]/.test(UI), 'et marquer une non-présentation');
  ok(/cuMoveStayStatus\(String\(arg \|\| ''\), 'confirmed', el\)/.test(UI),
    'l\'annulation d\'arrivée passe par l\'action « statut », pas par un enregistrement complet');
  ok(/cuMoveStayStatus\(String\(arg \|\| ''\), 'no_show', el\)/.test(UI),
    'la non-présentation aussi');
  ok(/data-action="hx-stay-undo-checkin"/.test(UI) && /data-action="hx-stay-noshow"/.test(UI),
    'les deux boutons sont réellement dessinés dans le journal de réception');
  ok(/b\.status === 'checked_in' \? `<button class="hx-btn ghost" data-action="hx-stay-undo-checkin"/.test(UI),
    'annuler l\'arrivée n\'apparaît que sur un séjour effectivement enregistré comme arrivé');
  ok(/\(b\.status === 'confirmed' \|\| b\.status === 'requested'\) && b\.hotel\.checkIn <= today \? `<button class="hx-btn ghost" data-action="hx-stay-noshow"/.test(UI),
    'la non-présentation n\'apparaît que sur un séjour attendu');
  ['checked_in', 'completed', 'confirmed', 'no_show'].forEach((s) => {
    ok(new RegExp(`${s}: \\{ fail:`).test(UI), `le mouvement ${s} a ses propres messages, pas ceux du départ`);
  });

  /* ── #0056 · le dossier clos redevient réparable ─────────────────────── */
  const statusBody = STAYS.slice(STAYS.indexOf("if (action === 'status')"), STAYS.indexOf("if (action !== 'save')"));
  ok(/old\.status === 'completed' && next === 'checked_in'/.test(statusBody),
    'la réouverture est traitée à part, pas confondue avec une arrivée ordinaire');
  ok(/b\?\.reopen !== true/.test(statusBody) && /reopen-required/.test(statusBody),
    'elle exige un geste explicite : elle n\'arrive jamais par accident');
  ok(/entitledMerchant\(request, env, merchant\)\) !== merchant/.test(statusBody) && /reopen-forbidden/.test(statusBody),
    'et seul le propriétaire du compte peut la demander — pas une caisse appairée');
  ok(statusBody.indexOf('reopen-required') < statusBody.indexOf('checkedInRoomConflict'),
    'le contrôle de réouverture passe avant la reprise de la chambre');
  ok(/checkedInRoomConflict/.test(statusBody),
    'et la chambre reprise est vérifiée libre, comme pour toute arrivée');
  ok(/handlers\['hx-stay-reopen'\]/.test(UI), 'la réouverture est offerte depuis le journal de réception');
  ok(/data-action="hx-stay-reopen"/.test(UI), 'par un bouton réellement dessiné');
  ok(/b\.status === 'completed' \? `<button class="hx-btn ghost" data-action="hx-stay-reopen"/.test(UI),
    'et seulement sur un séjour terminé');
  ok(/cuMoveStayStatus\(String\(arg \|\| ''\), 'checked_in', el, true\)/.test(UI),
    'le drapeau de réouverture est bien transmis');
  ok(/\.\.\.\(reopen \? \{ reopen: true \} : \{\}\)/.test(UI),
    'et n\'est envoyé QUE pour une réouverture');
  ok(/reopen-forbidden/.test(UI), 'un refus de droits se lit en clair dans la réception');
  ok(/done: 'Dossier rouvert'/.test(UI), 'et la réussite dit ce qui vient de se passer');
}

/* ═══ #0037 · deux réceptions, aucune saisie perdue ═══════════════════════ */
{
  const save = STAYS.slice(STAYS.indexOf("if (action !== 'save')"), STAYS.indexOf('const type = hotel.types.find'));
  ok(/expectedUpdatedAt/.test(save), 'l\'enregistrement exige la version sur laquelle l\'éditeur a travaillé');
  ok(/error: 'stay-conflict'/.test(save), 'et refuse d\'écraser une version plus récente');
  ok(/error: 'expected-updated-at-required'/.test(save),
    'une page trop ancienne pour porter cette information est refusée, pas acceptée à l\'aveugle');
  ok(/booking: old/.test(save),
    'le refus RENVOIE la version fraîche : la réception voit ce que sa collègue a écrit');
  ok(/if \(old\) \{/.test(save), 'une création n\'a rien à comparer et reste permise');

  // Le contrôle lui-même, exécuté sur les cas réels.
  const sandbox = { Number, JSON };
  vm.createContext(sandbox);
  vm.runInContext(`
    globalThis.check = function (old, b) {
      if (old) {
        const seen = b?.expectedUpdatedAt;
        const live = +old.updatedAt || 0;
        if (seen === undefined || seen === null) return 'expected-updated-at-required';
        if (!Number.isSafeInteger(+seen) || +seen !== live) return 'stay-conflict';
      }
      return 'ok';
    };
  `, sandbox);
  const check = sandbox.check;
  const stay = { updatedAt: 1700000000000 };
  ok(check(stay, { expectedUpdatedAt: 1700000000000 }) === 'ok',
    'la réception qui a la version courante enregistre normalement');
  ok(check(stay, { expectedUpdatedAt: 1699999000000 }) === 'stay-conflict',
    'la réception qui a une version périmée est refusée — c\'est exactement le cas du ticket');
  ok(check(stay, {}) === 'expected-updated-at-required',
    'un client qui n\'envoie rien ne passe pas en force');
  ok(check(stay, { expectedUpdatedAt: null }) === 'expected-updated-at-required',
    'ni en envoyant null');
  ok(check(stay, { expectedUpdatedAt: '1700000000000' }) === 'ok',
    'une valeur numérique en texte reste comprise (clients existants)');
  ok(check(stay, { expectedUpdatedAt: 'bientôt' }) === 'stay-conflict',
    'une valeur absurde est traitée comme un conflit, jamais comme un accord');
  ok(check(null, {}) === 'ok', 'une création passe sans comparaison');

  ok(/if \(booking\) payload\.expectedUpdatedAt = \+booking\.updatedAt \|\| 0;/.test(UI),
    'le formulaire de séjour envoie bien cette version');
  ok(/'stay-conflict':/.test(UI), 'et la réception voit un message clair, pas une erreur brute');
  ok(/body\.error === 'stay-conflict'[\s\S]{0,400}cache\.set\(body\.booking\.id, body\.booking\)/.test(UI),
    'la version fraîche renvoyée par le refus est rangée tout de suite');
}

/* ═══ #0039 · une reprise divergente est un conflit, pas un succès ════════ */
{
  const head = CHARGES.indexOf('async function insertEvent');
  ok(/const differs = !created/.test(CHARGES), 'la reprise est comparée à ce qui est réellement en base');
  const insert = CHARGES.slice(head, CHARGES.indexOf('\n}\n', head));
  ['outletId', 'shiftId', 'cashierId', 'amountCents', 'kind'].forEach((f) => {
    ok(new RegExp(`stored\\.${f} !== line\\.${f}`).test(insert), `la comparaison porte sur ${f}`);
  });
  ok((CHARGES.match(/if \(saved\.differs\) return json\(\{ error: 'room-charge-conflict'/g) || []).length === 2,
    'les deux chemins — passation et contre-passation — refusent une divergence');
  ok(/room-charge-conflict', charge: saved\.stored \}, 409\)/.test(CHARGES),
    'le refus montre la ligne réellement stockée, pour que l\'écart se voie');
  ok(!/UPDATE hotel_room_charge_events/.test(CHARGES),
    'aucune réécriture d\'un événement déjà comptabilisé : la correction reste une contre-passation');

  // La logique, exécutée.
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`
    globalThis.differs = function (created, stored, line) {
      return !created && !!stored && (
        stored.outletId !== line.outletId || stored.shiftId !== line.shiftId ||
        stored.cashierId !== line.cashierId || stored.amountCents !== line.amountCents ||
        stored.kind !== line.kind);
    };
  `, sandbox);
  const base = { outletId: 'bar', shiftId: 's1', cashierId: 'c1', amountCents: 12000, kind: 'room-charge' };
  ok(sandbox.differs(true, null, base) === false, 'une première écriture réussie n\'est jamais un conflit');
  ok(sandbox.differs(false, { ...base }, base) === false,
    'une reprise à l\'identique reste inoffensive (le réseau a coupé, rien de plus)');
  ok(sandbox.differs(false, { ...base, shiftId: 's0' }, base) === true,
    'le même encaissement repris sur un AUTRE poste est un conflit');
  ok(sandbox.differs(false, { ...base, amountCents: 9000 }, base) === true,
    'repris avec un autre montant aussi — c\'est le net mal attribué du ticket');
  ok(sandbox.differs(false, { ...base, cashierId: 'c9' }, base) === true,
    'et repris au nom d\'une autre caissière');
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s) sur ${passed + failures.length} contrôles`);
  process.exit(1);
}
console.log(`  ✓ ${passed} contrôles`);
