import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
function shipped(name) {
  const match = source.match(new RegExp('    function ' + name + '\\([\\s\\S]*?\\n    \\}'));
  assert.ok(match, name + ' exists'); return match[0];
}
let checks = 0;
for (const status of ['held', 'new', 'cooking', 'ready']) {
  const ticket = { opId: 'ord-rejected', num: 7, status, items: [{ n: 'Fixture', q: 1 }] };
  const other = { opId: 'ord-other', num: 8, status: 'new' };
  const context = vm.createContext({
    kdsOrders: [ticket, other], opTickets: new Map([[ticket.opId, ticket], [other.opId, other]]),
    vrapEditingNum: 7, clearCart() {}, setVrapView() {}, persistShift() {},
    opRepairFormulaParents() {}, attachOrderProTable() {},
    journal: [{ id: 'paid-sale', amount: 40 }],
  });
  vm.runInContext(shipped('retireRejectedKitchenTicket') + '\n' + shipped('opIngest'), context);
  context.opIngest({ id: ticket.opId, status: 'rejected', channel: 'kiwi' });
  assert.equal(context.kdsOrders.length, 1, status + ' rejected ticket leaves active KDS');
  assert.equal(context.kdsOrders[0], other, 'unrelated ticket remains');
  assert.equal(context.opTickets.has(ticket.opId), false);
  assert.equal(context.vrapEditingNum, null, 'rejected ticket cannot remain in payment editor');
  assert.equal(context.journal[0].amount, 40, 'projection cleanup does not rewrite financial evidence');
  checks++;
}
let prints = 0;
const context = vm.createContext({
  window: { KiwiPrinter: { isConnected: () => true, printKitchen: async () => { prints++; return { ok: true }; } } },
  pad2HO: n => String(n).padStart(2, '0'), kdsStationFor: () => 'kitchen',
  kitchenPaperItems: items => items, kdsStations: () => [{ id: 'kitchen', name: 'Cuisine' }],
  toast() {}, Date, Map, Promise,
});
vm.runInContext(shipped('printKitchenTickets'), context);
const order = { num: 1, sentAt: new Date(), table: '5' }, items = [{ n: 'Fixture', q: 1 }];
for (const remote of [true, 'connected']) {
  const result = await context.printKitchenTickets(order, items, { remote });
  assert.equal(result.skipped, 'print-hub-unavailable');
  assert.equal(prints, 0, 'remote fallback never sends duplicate direct tickets'); checks++;
}
await context.printKitchenTickets(order, items, { remote: false });
assert.equal(prints, 1, 'local cashier fallback still prints once'); checks++;
console.log(`audit-remediation-caisse-integration: ${checks} scenarios green`);
