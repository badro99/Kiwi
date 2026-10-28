// Carnet de crédit · le serveur voit un client en avance sans compter sur ce que
// la caisse a déclaré. L'alerte « soldé deux fois » ne partait que si chaque
// caisse avait payé tout le solde ET s'était déclarée hors ligne : deux
// règlements partiels, ou une connexion bancale qui se dit en ligne, laissaient
// une avance sans personne pour la voir. Le solde de la fiche est la preuve.
import assert from 'node:assert/strict';
import { creditSettlementAlerts, creditBook } from '../functions/api/_credit-book-refund.js';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ✓ ' + m); };
const doc = (hist) => ({ verticals: { epicerie: { data: { carnet: [{ id: 'k1', name: 'Client', hist }] } } } });
const alertsOf = (hist) => creditBook(creditSettlementAlerts(doc(hist)))[0].creditAlerts || [];
const debt = (id, amt, extra = {}) => ({ id, type: 'debt', amt, at: '2026-10-20T10:00:00Z', label: 'Ardoise', ...extra });
const pay = (id, amt, extra = {}) => ({ id, type: 'pay', amt, at: '2026-10-21T10:00:00Z', label: 'Règlement', ...extra });

ok(alertsOf([debt('d1', 100), pay('p1', 60), pay('p2', 40)]).length === 0, 'a debt paid in two instalments raises nothing');
ok(alertsOf([debt('d1', 100), pay('p1', 100)]).length === 0, 'a debt paid once raises nothing');

let a = alertsOf([debt('d1', 100), pay('p1', 70, { offline: true }), pay('p2', 70, { offline: true })]);
ok(a.length === 1 && a[0].advanceCents === 4000, 'two partial offline payments that overshoot leave a visible advance of 40 MAD');

a = alertsOf([debt('d1', 100), pay('p1', 100), pay('p2', 100)]);
ok(a.length === 1 && a[0].advanceCents === 10000, 'two full payments from tills that both reported online leave a visible advance');

a = alertsOf([debt('d1', 100), pay('p1', 100, { offline: true, settlementOf: 'd1' }), pay('p2', 100, { offline: true, settlementOf: 'd1' })]);
ok(a.length === 1 && a[0].advanceCents === 10000, 'the case the till already declared still gives exactly one alert, not two');

a = alertsOf([debt('d1', 100), pay('p1', 100), pay('p2', 100), debt('r1', 100, { kind: 'advance-refund', refundId: 'x' })]);
ok(a.length === 0, 'once the owner refunds the advance the alert goes away');

a = alertsOf([debt('d1', 100), pay('p1', 100), pay('p2', 100), debt('r1', 60, { kind: 'advance-refund', refundId: 'x' })]);
ok(a.length === 1 && a[0].advanceCents === 4000, 'a partial refund leaves the remaining advance on the alert');

ok(alertsOf([pay('p0', 30)]).length === 0, 'an advance on a customer who never owed anything (imported deposit) is not a double settlement');

const again = creditSettlementAlerts(doc([debt('d1', 100), pay('p1', 100), pay('p2', 100)]));
ok(creditBook(creditSettlementAlerts(again))[0].creditAlerts.length === 1, 'running the check again does not stack alerts');
console.log(`credit-book-overpay-alert: ${checks} checks passed`);
