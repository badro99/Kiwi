import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { declaration } from './js-declarations.cjs';
const read = file => fs.readFileSync(file, 'utf8');
const only = process.argv[2];
if (!only || only === 'corruption') {
  const storage = (disk, { full = false } = {}) => ({
    getItem: k => disk.get(k) ?? null,
    setItem: (k, v) => { if (full && k !== 'kiwiSaleQueue') throw new Error('QuotaExceededError'); disk.set(k, String(v)); },
    removeItem: k => disk.delete(k),
    key: i => [...disk.keys()][i] ?? null,
    get length() { return disk.size; },
  });
  const boot = (disk, opts) => {
    const window = { dispatchEvent() {} };
    const ctx = vm.createContext({ window, localStorage: storage(disk, opts), CustomEvent: class {}, navigator: { onLine: false } });
    vm.runInContext(read('assets/live-link/queue-store.js'), ctx);
    const noop = () => {};
    return window.KiwiSaleQueueStore.create({ merchant: () => 'fixture', pingLocal: noop, flushQueue: noop, moneySignal: noop, scheduleRecovery: noop, on: noop, stableId: (x) => x && x.id });
  };
  for (const raw of ['{broken', '{}', 'null', '']) {
    // 1 · room to spare: the corrupt bytes move aside intact, the till keeps selling.
    const disk = new Map([['kiwiSaleQueue', raw]]);
    let queue = boot(disk);
    assert.equal(queue.status().lastError, 'queue-recovery-required');
    assert.equal(queue.status().storageError, true);
    const kept = [...disk].filter(([k]) => k.startsWith('kiwiSaleQueue:quarantine:'));
    assert.equal(kept.length, 1, 'corrupt bytes are quarantined once');
    assert.equal(kept[0][1], raw, 'quarantine keeps the exact corrupt bytes');
    await queue.enqueueCommand({ id: 'new', merchant: 'fixture' }, 'fixture');
    assert.ok(JSON.parse(disk.get('kiwiSaleQueue')).some(r => r && r.id === 'new'), 'a new sale is still queued after corruption');
    queue = boot(disk);
    assert.equal(queue.status().lastError, 'queue-recovery-required', 'recovery stays visible after a reload');
    // 2 · no room to move them: the bytes stay where they are, never overwritten.
    const full = new Map([['kiwiSaleQueue', raw]]);
    const blocked = boot(full, { full: true });
    assert.equal(blocked.status().lastError, 'queue-recovery-required');
    try { await blocked.enqueueCommand({ id: 'new', merchant: 'fixture' }, 'fixture'); } catch (_) {}
    assert.equal(full.get('kiwiSaleQueue'), raw, 'without room, the corrupt bytes are never overwritten');
  }
}
if (!only || only.startsWith('fairness')) {
  const src = read('assets/clients-store.js');
  for (const kind of ['purchase', 'redemption']) {
    if (only && only !== 'fairness' && only !== 'fairness-' + kind) continue;
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
if (!only || only.startsWith('history')) {
  for (const surface of ['directory', 'book']) {
    if (only && only !== 'history' && only !== 'history-' + surface) continue;
    const src = read('assets/clients-' + surface + '.js');
    assert.doesNotMatch(src, /history\.slice\(0, 50\)/, 'source must retain full history');
    const start = src.indexOf('    var purchaseHistory =');
    const end = src.indexOf(surface === 'directory' ? '    /* Contact straight' : '    sheet(', start);
    let block = src.slice(start, end);
    const context = { c: {history: Array.from({length: 121}, (_,i) => ({ref:'ticket-'+i,ts:i+1,amount:i}))}, lang: () => 'en', locale:'en', T:{}, esc:String, fmt:String, payment:String, localReturns:()=>[], tr:String, window:{KiwiClientNumbers:{quantity:String}} };
    vm.createContext(context);
    vm.runInContext(block + '; globalThis.render = renderHistory;', context);
    const pages = [context.render(0), context.render(1), context.render(2)];
    assert.match(pages[0], /data-history-page="-1" disabled/, 'first page cannot go back');
    assert.match(pages[2], /data-history-page="3" disabled/, 'last page cannot go forward');
    assert.ok(pages.every(html => html.includes('data-history-page')), 'each page exposes navigation');
    for (let i=0;i<121;i++) assert.equal(pages.filter(html => html.includes('ticket-'+i+(surface === 'directory' ? '</span>' : ' · '))).length, 1, 'each ticket appears on one page');
    assert.match(src, /renderHistory\(Number\(.*dataset\.historyPage\)\)/, 'navigation renders the requested page');
  }
}
console.log('✓ wave N queues: ' + (only || 'all'));
