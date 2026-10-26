export { voidDispatch, voidLine, editLine, ackVoid } from './_queue-quantities.js';
export { recallTicket } from './_queue-recall.js';
export { stationCooking, stationReady } from './_queue-stations.js';
// La cuisine, côté file (/api/order/queue) : la négociation d'une annulation
// (voidLine, editLine, ackVoid) et l'avancement par poste (rappel, « en
// préparation », « prêt » d'un poste). Déplacé tel quel depuis queue.js, qui
// garde la répartition. Chaque gestionnaire rend null quand le corps ne le
// concerne pas.

import { json } from '../../auth/_lib.js';
import { normTable } from './_lib.js';
import { recordOrderCourse } from './_course.js';
import { deferCourse, storedOrderLines, operationId, atomicStatements, statement, employeeName } from './_queue-shared.js';

/* Extraction privée : _queue-quantities */
/* Extraction privée : _queue-recall */
/* Extraction privée : _queue-stations */
