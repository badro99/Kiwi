import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
function extract(name) {
  const start = source.indexOf('    function ' + name + '(');
  const end = source.indexOf('\n    }', start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end + 6);
}
let count = 0;
for (const search of ['?pair=1&op=1&direct=1&merchant=shop', '?op=1&merchant=shop', '?direct=1', '']) {
  const nodes = new Map();
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: true, style: {}, classList: { add() {}, remove() {} }, setAttribute() {} });
    return nodes.get(id);
  };
  let opens = 0, resumes = 0, syncs = 0, reads = 0, saved = null;
  const ctx = vm.createContext({
    URLSearchParams, location: { search }, document: { getElementById: element },
    pinScreen: element('pin-screen'), $$: () => [], setTimeout() {},
    currentMerchantSlug: () => 'shop', shiftOpenedAt: null, shiftMerchant: '',
    doOpenService: () => opens++, hoursAllowOpening: () => ({ ok: true }),
    loadPersistedShift: () => { reads++; return saved; },
    restoreShift: () => resumes++, enterShellDirectly() {}, startEmployeeSaleJournalSync: () => syncs++,
  });
  vm.runInContext(['operatorCaisseRequested', 'unlockApp', 'openService'].map(extract).join('\n'), ctx);
  ctx.unlockApp();
  assert.equal(opens, 0, 'unlock, including old direct URLs, must not open a service');
  assert.equal(reads, 0, 'unlock must not load/replay a saved merchant service');
  assert.equal(resumes, 0);
  const operator = search.includes('op=1');
  assert.equal(element('operator-service-notice').hidden, !operator);
  if (operator) assert.equal(element('operator-dashboard-link').href, '/dashboard?op=1&merchant=shop');
  saved = { merchant: 'shop', openedAt: new Date().toISOString() };
  ctx.openService();
  assert.equal(resumes, operator ? 1 : 0, 'only an explicit support opening resumes the existing service');
  assert.equal(opens, operator ? 0 : 1);
  assert.equal(syncs, operator ? 1 : 0);
  count++;
}
const resumeStart = source.indexOf('/* On load · if a recent shift was saved');
const resumeEnd = source.indexOf('const saved = loadPersistedShift();', resumeStart);
assert.match(source.slice(resumeStart, resumeEnd), /if \(operatorCaisseRequested\(\)\) return;/,
  'support loads are excluded from automatic persisted-service replay');
const floorContext = vm.createContext({ operatorCaisseRequested: () => true, shiftOpenedAt: null });
vm.runInContext(extract('publishServiceFloor'), floorContext);
floorContext.publishServiceFloor(); // Missing transport would throw if this crossed the guard.
console.log(`caisse-support-entry-test: ${count + 2} checks passed`);
