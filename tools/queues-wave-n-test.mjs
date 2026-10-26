import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { declaration } from './js-declarations.cjs';
const read = file => fs.readFileSync(file, 'utf8');
const only = process.argv[2];
if (!only || only === 'corruption') {
  for (const raw of ['{broken', '{}', 'null', '']) {
    const disk = new Map([['kiwiSaleQueue', raw]]);
    const window = { dispatchEvent() {} };
    const ctx = vm.createContext({ window, localStorage: { getItem: k => disk.get(k) ?? null, setItem: (k,v) => disk.set(k,v) }, CustomEvent: class {}, navigator: { onLine: false } });
    vm.runInContext(read('assets/live-link/queue-store.js'), ctx);
    const queue = window.KiwiSaleQueueStore.create({ merchant: () => 'fixture' });
    assert.equal(queue.status().lastError, 'queue-recovery-required');
    assert.equal(queue.status().storageError, true);
    await queue.enqueueCommand({ id: 'new', merchant: 'fixture' }, 'fixture');
    assert.equal(disk.get('kiwiSaleQueue'), raw, 'enqueue preserves exact corrupt bytes');
    assert.equal(await queue.migrateLegacy(), false);
  }
}
if (!only || only === 'fairness') {
  const src = read('assets/clients-store.js');
  for (const kind of ['purchase', 'redemption']) {
    let rows = Array.from({length: 60}, (_, i) => ({ ref: 'event-' + i, clientId: 'fixture', lastFailure: 'http-422', amount: i }));
    const sent = [];
    const context = { [kind + 'Read']: () => rows, [kind + 'Write']: (_book, value) => { rows = value; }, [kind + 'Push']: (_book, event) => sent.push(event.ref) };
    const name = kind === 'purchase' ? 'flushPurchases' : 'flushRedemptions';
    const code = declaration(src.slice(src.indexOf('  function ' + name)).trimStart(), name);
    vm.runInNewContext(code + `; ${name}('fixture'); ${name}('fixture'); ${name}('fixture');`, context);
    assert.equal(new Set(sent).size, 60, kind + ': refused head cannot starve later events');
    assert.equal(rows.length, 60, 'audit events retained');
    assert.equal(rows.find(e => e.ref === 'event-0').lastFailure, 'http-422');
  }
}
if (!only || only === 'history') {
  for (const surface of ['directory', 'book']) {
    const src = read('assets/clients-' + surface + '.js');
    assert.doesNotMatch(src, /history\.slice\(0, 50\)/, 'source must retain full history');
    const start = src.indexOf('    var purchaseHistory =');
    const end = src.indexOf(surface === 'directory' ? '    /* Contact straight' : '    sheet(', start);
    let block = src.slice(start, end);
    const context = { c: {history: Array.from({length: 121}, (_,i) => ({ref:'ticket-'+i,ts:i+1,amount:i}))}, lang: () => 'en', locale:'en', T:{}, esc:String, fmt:String, payment:String, localReturns:()=>[], tr:String, window:{KiwiClientNumbers:{quantity:String}} };
    vm.createContext(context);
    vm.runInContext(block + '; globalThis.render = renderHistory;', context);
    const pages = [context.render(0), context.render(1), context.render(2)];
    assert.ok(pages.every(html => html.includes('data-history-page')), 'each page exposes navigation');
    for (let i=0;i<121;i++) assert.equal(pages.filter(html => html.includes('ticket-'+i+(surface === 'directory' ? '</span>' : ' · '))).length, 1, 'each ticket appears on one page');
    assert.match(src, /renderHistory\(Number\(.*dataset\.historyPage\)\)/, 'navigation renders the requested page');
  }
}
console.log('✓ wave N queues: ' + (only || 'all'));
