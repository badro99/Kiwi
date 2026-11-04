/* Execute the shipped request owners with uncooperative transports and bodies.
 * Fake clocks make the 12 s contract deterministic without real waits. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { deadlineVmSource } from './deadline-vm-source.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { declaration } = require('./split-functions.cjs');
const read = f => fs.readFileSync(f, 'utf8');
const transport = read('assets/caisse-pairing/pairing-transport.js');
const helper = s => { try { return declaration(s, 'fetchDeadline'); } catch { return ''; } };
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
const never = () => new Promise(() => {});
function harness(mode, before = 0) {
  const timers = new Map(), calls = []; let id = 0;
  const c = { console, AbortController, encodeURIComponent,
    setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(i) { timers.delete(i); },
    fetch(url, opts) {
      calls.push({ url, opts });
      if (calls.length <= before) return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, code: '123456', merchant: 'test' }) });
      return mode === 'fetch' ? never() : Promise.resolve({ ok: true, status: 200, json: never });
    },
  };
  vm.createContext(c);
  return { c, calls, async tick() { await flush(); for (const fn of [...timers.values()]) fn(); await flush(); }, run(s) { return vm.runInContext(s, c); } };
}
for (const mode of ['fetch', 'body']) {
  for (const [name, expression, before] of [
    ['redeem', "redeem('123456')", 0], ['state', "pairState({merchant:'test'})", 0],
    ['recovery', "recoverFromTerminal({merchant:'test'})", 0],
    ['repair-create', "pairFromAccount({merchant:'test'})", 0],
    ['repair-redeem', "pairFromAccount({merchant:'test'})", 1],
  ]) {
    const h = harness(mode, before); let fallback = 0;
    Object.assign(h.c, { window: {}, terminalId: () => 'terminal', pairedVenue: () => ({ merchant: 'test' }),
      readMap: () => { fallback++; return {}; }, document: { dispatchEvent() {} } });
    h.run(transport);
    let outcome;
    h.run(expression).then(v => { outcome = v; }, e => { outcome = e; });
    await h.tick();
    assert.ok(outcome, `${name}: hung ${mode} settles`);
    if (name === 'redeem') { assert.equal(outcome.ok, false); assert.equal(fallback, 1); }
    else assert.equal(outcome.code, 'timeout', `${name}: timeout rejection preserves pairing`);
    assert.equal(h.calls.length, before + 1);
    assert.ok(h.calls.at(-1).opts.signal.aborted);
  }
  {
    const h = harness(mode); let staff = 0;
    Object.assign(h.c, { wantsOperatorAccess: () => true, bootWithPin: () => { staff++; } });
    h.run(helper(transport) + '\n' + declaration(read('assets/caisse-pairing/staff-gate.js'), 'bootForOperator'));
    h.run("bootForOperator({merchant:'test'})"); await h.tick();
    assert.equal(staff, 1, `identity hung ${mode} returns to staff gate`);
  }
  {
    const h = harness(mode), nodes = { '#service-client-search': { value: '0600000000', disabled: false }, '#service-client-list': {} };
    Object.assign(h.c, { $: s => nodes[s], liveEmployeeState: { merchant: 'test' }, serviceClientRows: [], employeeTranslation: x => x });
    h.run(read('assets/request-deadline.mjs').replace('export ', '') + '\n' + declaration(read('assets/serveur/payments.js'), 'renderServiceClients').replace("import('../request-deadline.mjs')", 'Promise.resolve({ deadlineFetch })'));
    h.run('renderServiceClients()'); await h.tick();
    assert.equal(nodes['#service-client-list'].textContent, 'Carnet indisponible.');
    assert.equal(nodes['#service-client-search'].disabled, false);
    h.run('renderServiceClients()'); await flush(); const previous = h.calls.at(-1);
    nodes['#service-client-search'].value = '0700000000'; h.run('renderServiceClients()');
    assert.ok(previous.opts.signal.aborted, 'previous search cancelled');
    await h.tick(); assert.equal(nodes['#service-client-list'].textContent, 'Carnet indisponible.');
  }
  {
    const h = harness(mode); h.c.window = {}; h.run(deadlineVmSource(read('assets/admin-api.js'))); let error, writes = 0;
    h.c.window.KiwiAdminApi.onWrite(() => { writes++; });
    h.c.window.KiwiAdminApi.request('/test', { method: 'POST' }).catch(e => { error = e; });
    await h.tick(); assert.equal(error?.status, 0); assert.equal(error?.code, 'timeout'); assert.equal(writes, 0);
  }
  {
    const h = harness(mode), s = read('assets/landing-demo-funnel.js');
    Object.assign(h.c, { phase: 'form', API: '/api/demo-request', render() {}, payload: () => ({}) });
    h.run(helper(s) + '\n' + declaration(s, 'send'));
    const p = h.run('send()'); await h.tick(); assert.equal(h.c.phase, 'failed', `demo hung ${mode} offers fallback`); await p;
  }
}
for (const [code, fetch] of [['offline', () => Promise.reject(new Error('network'))], ['bad-response', async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('json'); } })]]) {
  const h = harness('fetch'); Object.assign(h.c, { window: {}, fetch }); h.run(deadlineVmSource(read('assets/admin-api.js')));
  await assert.rejects(h.c.window.KiwiAdminApi.request('/test'), e => e.status === 0 && e.code === code && e.message === code && 'body' in e);
}
console.log('✓ request-deadlines: pairing, identity, search, admin and demo settle hung fetch/body; cancellation and typed failures');
