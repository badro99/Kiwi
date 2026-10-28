#!/usr/bin/env node
import assert from 'node:assert/strict';
import maisonSource from './pos-maison-test-source.cjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import mergedPart from './merged-source.cjs'; // loyalty-reserve.js vit dans retail-sale-hold.js depuis le 22 octobre 2026
const read = p => maisonSource(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const ticketOwner = vm.runInNewContext(readFileSync('assets/pos-boutique/ticket-owner.js', 'utf8').replace('export { ticketOwner };', 'ticketOwner;'));
let selectedOwner;
const book = 'reserve-test', key = 'kiwi:clients-redemptions:v1:' + book;
async function scenario(mode, status = 200, code = '', pendingPurchase = false) {
  const storage = new Map([['kiwiLive', '1'], ['kiwiLiveMerchant', book]]), calls = [], toasts = [];
  /* Un achat de ce client encore en file : les points qui rendent la récompense
     prête ne sont pas encore au serveur, son « reward-not-ready » n'est pas un refus. */
  if (pendingPurchase) storage.set('kiwi:clients-purchases:v1:' + book, JSON.stringify([{ ref: 'purchase:c1:1', clientId: 'c1', kind: 'purchase', amount: 100 }]));
  let timer, total = 80, closed = false;
  const values = { clients: { list: [{ id: 'c1', name: 'Test', points: 100 }], seq: 1 }, fidelity: { model: 'amount', amount: { threshold: 100 } } };
  const stores = {};
  const window = { addEventListener() {}, KiwiLive: { isOn: () => mode !== 'disabled', merchant: () => mode === 'unresolved' ? '' : book },
    KiwiCaisseToast: msg => toasts.push(msg), KiwiStore: { currentVenue: () => book, define(name, opts) {
      return stores[name] ||= { get: () => values[name] || opts.blank?.(), set: v => { values[name] = v; }, subscribe() {} };
    } } };
  const context = vm.createContext({ window, KiwiStore: window.KiwiStore, console, navigator: { onLine: mode !== 'offline' },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)) }, setInterval() {},
    setTimeout: fn => { timer = fn; return 1; }, clearTimeout() {}, fetch: async (url, opts) => {
      const body = opts?.body && JSON.parse(opts.body);
      if (!body?.redemption) return pendingPurchase ? new Promise(() => {}) : { ok: true, json: async () => ({ clients: [] }) };
      calls.push(body);
      if (mode === 'timeout') return new Promise(() => {});
      if (mode === 'network') throw Error('network');
      return { ok: status === 200, status, json: async () => ({ error: code }) };
    } });
  vm.runInContext(read('assets/clients-store.js'), context);
  vm.runInContext(mergedPart('assets/retail-sale-hold.js', 'assets/loyalty-reserve.js'), context);
  const ticket = { reward: { clientId: 'c1', label: '20 MAD' } };
  const kit = window.KiwiLoyaltyReserve.create({ ticket, ticketOwner: selectedOwner, client: { id: 'c1' }, isDemo: mode === 'demo',
    render: () => { total = ticket.reward ? 80 : 100; }, close: () => { closed = true; } });
  const pending = kit.confirm();
  await new Promise(setImmediate);
  if (mode === 'timeout') timer();
  const proceed = await pending;
  if (['offline','demo','disabled','unresolved'].includes(mode)) assert.equal(calls.length, 0, 'no preflight network call');
  if (proceed && mode !== 'demo') window.KiwiClients.redeem('c1', book, ticket.reward?.reservation);
  await new Promise(setImmediate);
  const queue = JSON.parse(storage.get(key) || '[]');
  if (pendingPurchase) {
    assert.ok(proceed, 'a reward waiting on a queued purchase is kept'); assert.ok(ticket.reward); assert.equal(total, 80);
    assert.equal(toasts.length, 0); assert.equal(queue.length, 1, 'the redemption stays queued behind the purchase');
  } else if (status === 409 || status === 400 || status === 404) {
    assert.equal(proceed, false, 'final refusal must stop payment');
    assert.equal(ticket.reward, undefined); assert.equal(total, 100); assert.ok(closed); assert.equal(toasts.length, 1); assert.equal(queue.length, 0);
  } else {
    assert.ok(proceed); assert.ok(ticket.reward); assert.equal(total, 80);
    if (mode === 'online' && status === 200) { assert.equal(calls.length, 1); assert.equal(queue.length, 0); }
    if (mode === 'timeout') {
      assert.equal(queue.length, 1); assert.equal(queue[0].ref, calls[0].redemption.ref);
      window.KiwiClients.sync(); await new Promise(setImmediate);
      assert.equal(calls.length, 2); assert.equal(calls[1].redemption.ref, calls[0].redemption.ref, 'outbox replay uses the preflight id');
    }
    if (['offline','demo'].includes(mode)) assert.equal(calls.length, 0, 'offline and demo never send redemption');
    if (mode === 'offline') assert.equal(queue.length, 1, 'offline redemption remains queued');
    if (['offline','demo','disabled','unresolved'].includes(mode)) assert.equal(ticket.reward.reservation, undefined);
  }
}
for (selectedOwner of [undefined, ticketOwner]) {
for (const mode of ['online','timeout','offline','demo','network','disabled','unresolved']) await scenario(mode);
for (const [status, code] of [[409,'reward-not-ready'],[409,'loyalty-off'],[409,'ref-conflict'],[400,'client-and-ref-required'],[404,'client-not-found']]) await scenario('online',status,code);
for (const status of [401,403,408,429,500,503]) await scenario('online',status,'reward-not-ready');
await scenario('online', 409, 'reward-not-ready', true);
}
for (const name of ['boutique','maison']) {
  const source = process.env.KIWI_RESERVE_OLD ? readFileSync(`/tmp/kiwi-c31-${name}-before.js`, 'utf8') : read(`assets/pos-${name}.js`);
  const gate = source.match(/beforePaid: (\(\) => window.KiwiLoyaltyReserve[^\n]+),/);
  const beforePaid = gate && vm.runInNewContext(gate[1], { window: { KiwiLoyaltyReserve: { create: () => ({ confirm: async () => false }) } }, IS_DEMO: false, ticketOwner, t: {}, c: {}, renderTicket() {}, state: {}, closeVeil() {} });
  const paymentProceeds = beforePaid ? await beforePaid() : true;
  assert.equal(paymentProceeds, false, `${name}: final refusal must prevent sale commitment`);
  assert.match(source, /opts.beforePaid && !await opts.beforePaid\(\)/);
  /* La réservation acquittée garde sa référence ; sans réservation c'est LA VENTE
     qui nomme la remise, pour qu'un rejeu ne retire pas les points deux fois. */
  assert.match(source, /redeem\(c\.id, null, \(t\.reward && t\.reward\.reservation\) \|\| \{ ref: window\.KiwiClients\.redemptionRef\(c\.id, sale\.syncId \|\| sale\.id\) \}\)/);
}
console.log('PASS: loyalty reservation acceptance, final refusals, transient failures, timeout, offline, demo, stable queue ref and both till gates');
