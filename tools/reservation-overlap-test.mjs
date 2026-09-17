#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Une chambre, une réservation · un tiroir, un seul chiffre
 *                                                   (tickets #0048, #0046)
 *
 * #0048  /api/booking et /api/hotel/stays refusent tous deux d'attribuer une
 *        ressource déjà prise. Le push générique de document, lui, ne vérifiait
 *        que validateCommercialSync : un tableau de bord qui remontait son
 *        document pendant qu'une cliente réservait en ligne franchissait la
 *        garde de révision, la fusion réunissait les deux lignes actives, et la
 *        même chambre partait deux fois sur les mêmes dates.
 *
 * #0046  Le fond du poste entrant valait le tiroir COMPTÉ (écart compris) alors
 *        que la clôture attendait le fond d'ouverture d'origine plus la recette
 *        de toute la journée : la somme des tickets de passation et le Z
 *        différaient d'exactement l'écart. Deux documents signés qui se
 *        contredisent. Corrigé le 2026-09-13 (29166298) en reportant chaque
 *        écart signé dans l'attendu final ; cette suite VERROUILLE l'identité,
 *        parce qu'une réconciliation qui tient par accident finit par céder.
 * ─────────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { reservationOverlapConflict } from '../functions/api/hotel/_reservation-overlap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STORE = fs.readFileSync(path.join(ROOT, 'functions/api/store.js'), 'utf8');
const CAISSE = fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

let passed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++;
  else { failures.push(msg); console.error(`  ✗ ${msg}`); }
}

console.log('■ Réservations concurrentes et réconciliation du tiroir');

/* ═══ #0048 · le chevauchement est refusé à l'écriture ════════════════════ */
const DAY = 86400000;
const T0 = 1800000000000;
const stay = (id, room, from, to, status = 'confirmed') => ({
  id, resourceId: room, status, startAt: T0 + from * DAY, endAt: T0 + to * DAY,
});

{
  const before = { bookings: [stay('a', 'room:101', 0, 2)] };

  // La course du ticket : le document du patron réunit sa ligne et celle de la cliente.
  const raced = { bookings: [stay('a', 'room:101', 0, 2), stay('b', 'room:101', 1, 3)] };
  const clash = reservationOverlapConflict(before, raced);
  ok(!!clash, 'deux séjours actifs qui se chevauchent sur la MÊME chambre sont refusés');
  ok(clash && clash.resourceId === 'room:101', 'le refus nomme la chambre');
  ok(clash && clash.bookings.length === 2 && clash.bookings.includes('b'),
    'et les deux réservations en cause');
  ok(clash && clash.startAt === T0 + 1 * DAY && clash.endAt === T0 + 2 * DAY,
    'ainsi que la fenêtre réellement disputée');

  // Ce qui doit continuer à passer.
  ok(!reservationOverlapConflict(before, { bookings: [stay('a', 'room:101', 0, 2), stay('b', 'room:102', 1, 3)] }),
    'deux chambres différentes aux mêmes dates : rien à signaler');
  ok(!reservationOverlapConflict(before, { bookings: [stay('a', 'room:101', 0, 2), stay('b', 'room:101', 2, 4)] }),
    'un départ et une arrivée à la même borne ne se chevauchent pas — c\'est la rotation normale');
  ok(!reservationOverlapConflict(before, { bookings: [stay('a', 'room:101', 0, 2), stay('b', 'room:101', 1, 3, 'cancelled')] }),
    'une réservation annulée ne bloque plus la chambre');
  ok(!reservationOverlapConflict(before, { bookings: [stay('a', 'room:101', 0, 2), stay('b', 'room:101', 1, 3, 'completed')] }),
    'ni une réservation terminée');
  ok(!reservationOverlapConflict(before, { bookings: [stay('a', 'room:101', 0, 2), stay('b', 'room:101', 1, 3, 'no_show')] }),
    'ni un client non présenté');
  ['requested', 'confirmed', 'checked_in'].forEach((s) => {
    ok(!!reservationOverlapConflict(before, { bookings: [stay('a', 'room:101', 0, 2), stay('b', 'room:101', 1, 3, s)] }),
      `un séjour « ${s} » occupe bien la chambre`);
  });
  ok(!reservationOverlapConflict(before, { bookings: [stay('a', 'room:101', 0, 2), { id: 'b', resourceId: '', status: 'confirmed', startAt: T0, endAt: T0 + DAY }] }),
    'une réservation sans ressource attribuée ne peut pas entrer en conflit');
  ok(!reservationOverlapConflict(before, { bookings: [stay('a', 'room:101', 0, 2), { id: 'b', resourceId: 'room:101', status: 'confirmed', startAt: T0, endAt: T0 }] }),
    'une réservation de durée nulle est ignorée, pas traitée comme un conflit');

  // On ne verrouille pas un établissement pour une faute ancienne.
  const legacy = { bookings: [stay('a', 'room:101', 0, 2), stay('b', 'room:101', 1, 3)] };
  ok(!reservationOverlapConflict(legacy, legacy),
    'un double-booking DÉJÀ présent est toléré : sinon le document devient impossible à enregistrer');
  ok(!reservationOverlapConflict(legacy, { bookings: [...legacy.bookings, stay('c', 'room:102', 0, 2)] }),
    'et on peut continuer à travailler sur le reste du document');
  ok(!!reservationOverlapConflict(legacy, { bookings: [...legacy.bookings, stay('c', 'room:101', 0, 1)] }),
    'mais on ne peut PAS en ajouter un nouveau');
  ok(!reservationOverlapConflict(legacy, { bookings: [stay('a', 'room:101', 0, 2)] }),
    'et retirer l\'un des deux répare le document sans être refusé');

  ok(!reservationOverlapConflict(null, { bookings: [stay('a', 'room:101', 0, 2)] }),
    'un premier document se crée normalement');
  ok(!reservationOverlapConflict({}, {}), 'un document vide ne déclenche rien');
}

{
  ok(/import \{ reservationOverlapConflict \} from '\.\/hotel\/_reservation-overlap\.js'/.test(STORE),
    'store.js utilise ce contrôle');
  const block = STORE.slice(STORE.indexOf("if (feature === 'reservations')"), STORE.indexOf('if (feature === HOTEL_UNITS_FEATURE)'));
  ok(/reservationOverlapConflict\(mine, clean\.value\)/.test(block),
    'il compare le document remonté à celui déjà stocké');
  ok(/error: 'resource-double-booked'/.test(block) && /\}, 409\)/.test(block),
    'et refuse la remontée avec un 409 nommé');
  ok(block.indexOf('validateCommercialSync') < block.indexOf('reservationOverlapConflict'),
    'le contrôle vient s\'ajouter au contrôle commercial, il ne le remplace pas');
}

/* ═══ #0046 · les tickets de passation et le Z disent le même chiffre ═════ */
{
  // Les vraies fonctions d'arrondi et de réconciliation, extraites du caissier.
  const sandbox = { Math, Number };
  vm.createContext(sandbox);
  const slice = (marker, end) => CAISSE.slice(CAISSE.indexOf(marker), CAISSE.indexOf(end, CAISSE.indexOf(marker)));
  vm.runInContext(`
    ${CAISSE.slice(CAISSE.indexOf('const minor = n =>'), CAISSE.indexOf('\n', CAISSE.indexOf('const major = n =>')))}
    globalThis.minor = minor; globalThis.major = major;
    ${slice('function handoverGapCents()', '\n    function drawerExpected')}
    ${slice('function drawerExpected()', '\n\n    const CM_REASONS')}
    globalThis.gap = handoverGapCents;
    globalThis.expected = drawerExpected;
    globalThis.setState = (of, h, t) => { globalThis.openingFloat = of; globalThis.handovers = h; globalThis.journalTotals = () => t; };
  `, sandbox, { filename: 'caisse-slice.js' });

  /* Une journée à trois caissiers. Chaque passation compte le tiroir RÉEL, donc
     le poste suivant hérite d'un fond qui inclut l'écart du précédent. */
  function simulate(openingFloat, postes) {
    let float = openingFloat;
    const slips = [];
    let cashTotal = 0;
    postes.forEach((p) => {
      const expectedSlip = float + p.cash;
      const counted = expectedSlip + p.ecart;
      slips.push({ expected: expectedSlip, counted, ecart: counted - expectedSlip });
      cashTotal += p.cash;
      float = counted;          // le poste entrant reprend le tiroir compté
    });
    return { slips, cashTotal, finalDrawer: float };
  }

  function check(label, openingFloat, postes) {
    const sim = simulate(openingFloat, postes);
    sandbox.setState(openingFloat, sim.slips.slice(0, -1), {
      cashC: sim.cashTotal * 100, cashTipsC: 0, movesInC: 0, movesOutC: 0,
    });
    // Le Z attend le tiroir physique laissé par le dernier poste, avant son propre écart.
    const lastSlip = sim.slips[sim.slips.length - 1];
    const zExpected = sandbox.expected();
    ok(Math.abs(zExpected - lastSlip.expected) < 0.005,
      `${label} : le Z attend exactement ce que le dernier ticket de passation attend (Z ${zExpected} · ticket ${lastSlip.expected})`);
    return { zExpected, lastSlip };
  }

  check('sans écart', 500, [{ cash: 1200, ecart: 0 }, { cash: 900, ecart: 0 }, { cash: 400, ecart: 0 }]);
  check('un manque de 10', 500, [{ cash: 1200, ecart: -10 }, { cash: 900, ecart: 0 }, { cash: 400, ecart: 0 }]);
  check('le cas du ticket', 500, [{ cash: 300, ecart: -10 }, { cash: 0, ecart: 0 }]);
  check('écarts dans les deux sens', 500, [{ cash: 1200, ecart: -10 }, { cash: 900, ecart: 25 }, { cash: 400, ecart: -3.5 }]);
  check('centimes', 500, [{ cash: 1234.55, ecart: -0.05 }, { cash: 99.95, ecart: 0.15 }]);
  check('aucune passation', 500, [{ cash: 2500, ecart: 0 }]);

  // La somme des écarts reste visible : elle est reportée, pas effacée.
  sandbox.setState(500, [{ ecart: -10 }, { ecart: 25 }], { cashC: 0, cashTipsC: 0, movesInC: 0, movesOutC: 0 });
  ok(sandbox.gap() === 1500, 'les écarts signés sont additionnés en centimes, pas arrondis en cours de route');
  ok(Math.abs(sandbox.expected() - 515) < 0.005,
    'et reportés dans l\'attendu final : 500 de fond + 15 d\'écart net');
  ok(/handoverGapCents\(\)/.test(CAISSE.slice(CAISSE.indexOf('function drawerExpected()'), CAISSE.indexOf('const CM_REASONS'))),
    'le report est bien dans drawerExpected, là où le Z le lit');
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} échec(s) sur ${passed + failures.length} contrôles`);
  process.exit(1);
}
console.log(`  ✓ ${passed} contrôles`);
