#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Un brouillon de groupe qu'on peut toujours abandonner  (ticket #0007)
 *
 * « La réservation de groupe est bloquée sur une réservation précédente ; on ne
 * peut ni la supprimer, ni la modifier, ni changer le nombre de chambres ; on
 * ferme l'onglet, on reclique sur nouvelle réservation, et on retombe sur le
 * même essai qui n'a pas su se charger. »
 *
 * Deux trous, et le second explique la boucle.
 *
 * 1 · Quand un brouillon ne portait NI chambre enregistrée NI conditions
 *     gelées, il repréremplissait quand même tout le formulaire — et aucun
 *     bouton « abandonner » n'était affiché. La seule sortie visible était la
 *     croix, qui ne jette rien.
 *
 * 2 · « Abandonner » n'effaçait que la trace du dossier COURANT. Une tentative
 *     inachevée portant un autre identifiant survivait au geste, et la fois
 *     suivante « nouvelle réservation » la réadoptait. Le même essai revenait,
 *     verrouillé, indéfiniment.
 *
 * Ces enregistrements sont des aides à la reprise LOCALES : rien de ce qui est
 * enregistré côté serveur ne dépend d'eux. C'est ce qui rend leur effacement
 * sûr — et cette suite le vérifie aussi.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HOTEL = fs.readFileSync(path.join(ROOT, 'assets/hotel.js'), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.error(`  ✗ ${msg}`); }
}

console.log('■ Hôtel · le dossier groupe garde toujours une sortie');

const MODAL_START = HOTEL.indexOf("    const stagedKey = 'kiwi:hotel-group-staged:'");
const MODAL = HOTEL.slice(MODAL_START, HOTEL.indexOf("    form.addEventListener('submit'", MODAL_START));

/* ═══ 1 · une sortie est offerte dans CHAQUE état où l'on reprend ═════════ */
{
  const slot = MODAL.slice(MODAL.indexOf('data-hx-group-recovery-slot'), MODAL.indexOf('hx-commercial-hero'));
  const exits = (slot.match(/data-action="hx-discard-staged"/g) || []).length;
  ok(exits === 3, `chacun des trois états de reprise offre une sortie (${exits}/3)`);
  ok(/hasSavedRooms \? `/.test(slot), 'un dossier à chambres enregistrées : déjà couvert');
  ok(/!hasSavedRooms && committedTerms \?/.test(slot), 'une tentative aux conditions gelées : déjà couverte');
  ok(/!hasSavedRooms && !committedTerms && \(staged \|\| pendingIntent\)/.test(slot),
    'un formulaire simplement PRÉREMPLI en avait besoin : c\'est l\'état du ticket, et il n\'offrait rien');
  const bare = slot.slice(slot.indexOf('!hasSavedRooms && !committedTerms'));
  ok(/Aucune chambre n’a été enregistrée/.test(bare),
    'et il dit ce qui est en jeu : rien n\'est encore réservé, donc rien n\'est perdu');
  ok(/nouveau dossier vierge/.test(bare), 'le bouton nomme le résultat, pas le mécanisme');
}

/* ═══ 2 · le vrai code d'abandon, exécuté ═════════════════════════════════ */
function runDiscard(seed) {
  const map = new Map(Object.entries(seed));
  const localStorage = {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
  const start = MODAL.indexOf('        localStorage.removeItem(stagedKey);');
  const end = MODAL.indexOf('        savedRooms = {};', start);
  const sandbox = {
    localStorage, JSON, console,
    stagedKey: 'kiwi:hotel-group-staged:mixmax',
    initialMerchant: 'mixmax',
    groupDossierId: 'grp_courant',
    intentKeyFor: (id) => 'kiwi_hx_intent_' + id,
  };
  vm.createContext(sandbox);
  vm.runInContext(MODAL.slice(start, end), sandbox, { filename: 'discard.js' });
  return map;
}

const intent = (dossierId, status, merchant = 'mixmax') =>
  JSON.stringify({ merchant, dossierId, status, terms: { groupName: 'AirArabia Winter Tour' } });

{
  const left = runDiscard({
    'kiwi:hotel-group-staged:mixmax': '{"merchant":"mixmax"}',
    'kiwi_hx_intent_grp_courant': intent('grp_courant', 'pending'),
    'kiwi_hx_intent_grp_ancien': intent('grp_ancien', 'pending'),
  });
  ok(!left.has('kiwi:hotel-group-staged:mixmax'), 'le brouillon d\'affichage est effacé, comme avant');
  ok(!left.has('kiwi_hx_intent_grp_courant'), 'la tentative du dossier courant aussi, comme avant');
  ok(!left.has('kiwi_hx_intent_grp_ancien'),
    'et la tentative ORPHELINE, celle qui revenait indéfiniment : c\'est elle qui bloquait le bouton « nouvelle réservation »');
}

{
  const left = runDiscard({
    'kiwi_hx_intent_grp_fini': intent('grp_fini', 'complete'),
    'kiwi_hx_intent_grp_autre_hotel': intent('grp_x', 'pending', 'santos'),
    'kiwi:hotel-notes': 'à garder',
  });
  ok(left.has('kiwi_hx_intent_grp_fini'),
    'une tentative ABOUTIE n\'est pas touchée : elle ne bloque rien, et c\'est une trace');
  ok(left.has('kiwi_hx_intent_grp_autre_hotel'),
    'ni celle d\'un AUTRE établissement : on ne nettoie que la maison où l\'on est');
  ok(left.has('kiwi:hotel-notes'), 'et rien d\'autre dans le stockage n\'est emporté au passage');
}

{
  const left = runDiscard({ 'kiwi_hx_intent_casse': '{ pas du json' });
  ok(left.has('kiwi_hx_intent_casse'),
    'un enregistrement illisible n\'est pas supprimé à l\'aveugle, et surtout ne fait pas échouer l\'abandon');
}

/* L'abandon rend vraiment la main. */
{
  const after = MODAL.slice(MODAL.indexOf("data-action=\"hx-discard-staged\"]')) {"), MODAL.indexOf('renderTravelers();', MODAL.indexOf("data-action=\"hx-discard-staged\"]')) {")));
  ok(/committedTerms = null;/.test(after), 'les conditions gelées sont libérées');
  ok(/lockCommittedFields\(\);/.test(after),
    'et les champs redeviennent modifiables : « je ne peux même pas changer le nombre de chambres » finit ici');
  ok(/selectedRoomIds\.clear\(\);/.test(after), 'la sélection de chambres repart à zéro');
  ok(/groupDossierId = 'grp_' \+ Date\.now\(\)/.test(after), 'et le dossier reçoit une identité neuve');
  ok(/recoverySlot\) recoverySlot\.innerHTML = '';/.test(after), 'le bandeau de reprise disparaît avec ce qu\'il annonçait');
}

/* ═══ Ce qui protégeait quelque chose continue de protéger ════════════════ */
{
  const lock = HOTEL.slice(HOTEL.indexOf('const lockCommittedFields = () => {'), HOTEL.indexOf('const persistStaged = () => {'));
  ok(/Object\.keys\(savedRooms\)\.length > 0 \|\| !!committedTerms/.test(lock),
    'le verrou reste : des chambres déjà enregistrées ne se laissent pas redater sous elles');
  const usable = HOTEL.slice(HOTEL.indexOf('const stagedUsable = (s) =>'), HOTEL.indexOf('// ── Durable submission intent'));
  ok(/roomIds\.has\(id\)/.test(usable), 'un brouillon qui pointe une chambre supprimée est toujours écarté d\'office');
  ok(/s\.checkOut <= s\.checkIn/.test(usable), 'et un brouillon aux dates impossibles aussi');
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s) sur ${passed + failures.length} contrôles`);
  process.exit(1);
}
console.log(`  ✓ ${passed} contrôles`);
