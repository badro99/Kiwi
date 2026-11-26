// Ce que le serveur ajoute ou retire d'un bon déjà connu de la caisse (audit du 26 nov. 2026).
//
//  W2 · « + » du serveur sur un plat déjà envoyé : la quantité (ou une ligne
//       ajoutée) était facturée, mais le bon papier et le KDS de la caisse
//       restaient à l'ancienne quantité. Le plat n'était jamais cuisiné.
//  W3 · le dernier plat d'une commande annulé : la commande garde `lines: []`
//       et la caisse sortait avant de retirer ses lignes de l'addition.
// Rejoué sur le vrai code de assets/caisse-kitchen/orderpro-ingest.js.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'assets/caisse-kitchen/orderpro-ingest.js'), 'utf8');
let checks = 0;
const ok = (value, message, detail) => { assert.ok(value, message + (detail ? ' · ' + detail : '')); checks += 1; };

function harness() {
  const prints = [];
  const stubs = {
    tables: { 7: { status: 'khawya' } }, tableOrders: {}, orders: {}, servers: {}, selectedId: null, mode: 'salle', menuItems: [], menu: [],
    tableClosedAt: {}, phoneSeats: new Map([['7', { session: 'tsx-1', since: 1 }]]), phoneMovedVisits: new Map(),
    opTickets: new Map(), kdsOrders: [], kdsOrderSeq: 0, vrapEditingNum: null,
    tableKey: (v) => String(v).replace(/^T/, ''), caisseTableId: (v) => String(v),
    locallySettledVisit: () => false, locallySettledOrder: () => false, ticketNo: (o) => String(o.opNum),
    menuLineFind: () => null, newLineUid: (() => { let n = 0; return () => 'loc-' + (++n); })(),
    tableSettlement: () => ({ project: (t, patch) => Object.assign(t, patch) }),
    archivedTakeawaySet: () => new Set(), kdsStations: () => [{ id: 'cuisine' }], kdsKitchenId: () => 'cuisine', kdsStationFor: () => 'cuisine',
    serverNameFor: () => '', kdsNowHM: () => '12:00', vrapHandoverTimestamp: () => null, vrapHandoverTime: () => null,
    printKitchenTickets: (t, items) => prints.push(items.map((i) => `${i.q}x ${i.n}`).join(', ')),
    currentOrder: () => ({ replaceTable(id, arr) { stubs.tableOrders[id] = arr; return arr; }, patchLine(l, p) { Object.assign(l, p); }, append(lines, l) { lines.push(l); }, setEditing() {} }),
    console, Map, Set, Date, Math, JSON, Object, Array, String, Number, Boolean,
  };
  const scope = new Proxy(stubs, { has: () => true, get: (t, k) => (k === Symbol.unscopables ? undefined : (k in t ? t[k] : () => undefined)), set: (t, k, v) => { t[k] = v; return true; } });
  const api = new Function('scope', `with (scope) {\n${src}\nreturn { opIngest, attachOrderProTable }; }`)(scope);
  return { ...api, stubs, prints };
}
const now = Date.now();
const order = (lines, extra = {}) => ({ id: 'ord-abc123', number: 12, mode: 'table', table: '7', status: 'accepted', channel: 'kiwi', staff: true,
  session: 'tsx-1', server: 'Sara B', created_ts: now, updated_ts: now, total: lines.reduce((s, l) => s + l.qty * l.unitPrice, 0), lines, ...extra });
const tajine = (qty, uid = 'u1') => ({ uid, id: 'taj', name: 'Tajine', qty, unitPrice: 80 });
const kds = (h) => h.stubs.kdsOrders[0].items.filter((i) => i.q > 0).map((i) => `${i.q}x ${i.n}`).join(', ');

/* W2 · le « + » après acceptation ajoute une ligne (nouvel uid) */
{
  const h = harness();
  h.opIngest(order([tajine(1)]));
  ok(h.prints.length === 1 && h.prints[0] === '1x Tajine', 'the first ticket prints once', JSON.stringify(h.prints));
  h.opIngest(order([tajine(1)]));
  ok(h.prints.length === 1, 'the same poll again prints nothing', JSON.stringify(h.prints));
  h.opIngest(order([tajine(1), tajine(1, 'ln-9')]));
  ok(h.prints.length === 2 && h.prints[1] === '1x Tajine', 'the added Tajine reaches the kitchen paper', JSON.stringify(h.prints));
  ok(kds(h) === '1x Tajine, 1x Tajine', 'and the till KDS card', kds(h));
  h.opIngest(order([tajine(1), tajine(1, 'ln-9')]));
  ok(h.prints.length === 2, 'a later poll does not print it twice', JSON.stringify(h.prints));
}
/* W2 · une quantité changée sur place n'imprime que l'écart */
{
  const h = harness();
  h.opIngest(order([tajine(1)]));
  h.opIngest(order([tajine(3)]));
  ok(h.prints.length === 2 && h.prints[1] === '2x Tajine', 'going from 1 to 3 prints the two added', JSON.stringify(h.prints));
  ok(kds(h) === '3x Tajine', 'the KDS card shows 3', kds(h));
}
/* W2 · une ligne annulée quitte le KDS sans rien imprimer */
{
  const h = harness();
  h.opIngest(order([tajine(1), tajine(1, 'ln-9')]));
  h.opIngest(order([tajine(1)]));
  ok(h.prints.length === 1, 'a void prints nothing', JSON.stringify(h.prints));
  ok(kds(h) === '1x Tajine', 'and the voided dish leaves the KDS card', kds(h));
}
/* W2 · un bon encore en attente n'est pas imprimé par ce chemin */
{
  const h = harness();
  h.opIngest(order([tajine(1)], { mode: 'takeout', table: null, status: 'pending' }));
  h.opIngest(order([tajine(2)], { mode: 'takeout', table: null, status: 'pending' }));
  ok(h.prints.length === 0, 'a held takeaway prints nothing before it is accepted', JSON.stringify(h.prints));
}
/* W3 · le dernier plat annulé quitte l'addition de la table */
{
  const h = harness();
  ok(h.attachOrderProTable(order([tajine(1)])) === true, 'the order joins the table bill');
  const other = order([{ uid: 'c1', id: 'cafe', name: 'Café', qty: 1, unitPrice: 12 }], { id: 'ord-other' });
  h.attachOrderProTable(other);
  ok((h.stubs.tableOrders['7'] || []).length === 2, 'two orders on the bill');
  ok(h.attachOrderProTable(order([])) === true, 'voiding its only line changes the bill');
  const left = (h.stubs.tableOrders['7'] || []).map((l) => l.name);
  ok(left.length === 1 && left[0] === 'Café', 'only the other order stays billed', JSON.stringify(left));
  ok(h.attachOrderProTable(order([])) === false, 'an empty order already gone changes nothing');
}
console.log(`✓ till-ingest-delta-test : ${checks} contrôles (« + » du serveur imprimé une fois, annulation retirée du KDS et de l'addition)`);
