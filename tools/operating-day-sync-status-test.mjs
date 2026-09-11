import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/caisse-pwa.js', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('  var refreshingStatus = false;'), source.indexOf("  window.addEventListener('online', status);"));
let sales = { pending: 0, blocked: 0, storageError: false };
let journal = { pendingCount: 0, pendingPairing: false, storageError: false };
const dot = { style: {} }, label = {}, detail = {}, messages = [];
const button = { style: {}, dataset: {}, querySelector: s => ({ '.kn-dot': dot, '.kn-txt': label, '.kn-detail': detail }[s]) };
const context = vm.createContext({
  window: { KiwiLive: { queueStatus: () => sales, flush: async () => { sales = { pending: 0 }; } }, KiwiCashSessions: { status: () => journal } },
  document: { getElementById: () => button }, navigator: { onLine: true }, Promise,
  toast: (...args) => messages.push(args)
});
vm.runInContext(block, context);
context.status();
assert.equal(label.textContent, 'Synchronisé');
journal = { pendingCount: 3, pendingPairing: true };
context.status();
assert.match(label.textContent, /appairage requis/);
assert.match(detail.textContent, /3 événement/);
button.onclick();
assert.match(messages.at(-1)[0], /Appairez/);
sales = { pending: 2 };
context.status();
assert.match(detail.textContent, /2 vente/);
button.onclick();
await new Promise(resolve => setImmediate(resolve));
assert.match(messages.at(-1)[0], /journal caisse en attente/);
assert.doesNotMatch(messages.at(-1)[0], /Synchronisation réussie/);
journal = { pendingCount: 2, pendingPairing: false };
context.status();
assert.match(label.textContent, /synchronisation en attente/);
assert.equal(dot.style.background, '#A56A16');
journal = { pendingCount: 0, storageError: true };
context.status();
assert.match(label.textContent, /Protection locale/);
button.onclick();
assert.match(messages.at(-1)[0], /non enregistré/);
delete context.window.KiwiCashSessions;
context.status();
assert.equal(label.textContent, 'Synchronisé');
console.log('operating-day-sync-status: 12 checks passed');
