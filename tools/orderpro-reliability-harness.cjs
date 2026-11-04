const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = process.argv[2] || process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function guest({ lang = 'fr', fetch = async () => ({ ok: true, json: async () => ({ ok: true }) }), storage, timers = {} } = {}) {
  const messages = [], I18N = { fr: {}, en: {}, ar: {} };
  const scope = { I18N, currentLang: lang, NET: { slug: 'test' }, SESSION: { id: 'visit' },
    t: key => I18N[lang][key] || key, showToast: message => messages.push(message),
    localStorage: storage || { getItem: () => null, setItem() {} },
    escapeHtml: String, fetch, AbortController, console, setTimeout, clearTimeout, ...timers,
    document: { getElementById: () => null },
  };
  scope.window = scope;
  scope.KiwiOrderMenu = { orderProParts: { run: (_, factory) => factory(scope) } };
  const context = vm.createContext(scope);
  vm.runInContext(fs.readFileSync('assets/request-deadline.mjs', 'utf8').replace('export async', 'async') + '\nglobalThis.__deadlineFetch = deadlineFetch;', context);
  vm.runInContext(read('assets/orderpro-guest.js').replaceAll("import('./request-deadline.mjs')", 'Promise.resolve({ deadlineFetch: __deadlineFetch })').replace('_test: {', '_test: { getJSON, postJSON, store, finishQuiz, silenceGames() { gamesShell = () => {}; openGames = () => {}; },'), context);
  return { api: scope.KiwiGuest._test, messages, I18N };
}
function payment() {
  const nodes = new Map(), messages = [], extensions = {};
  const scope = { sessionTotal: 0, tipPercent: 0, splitState: { mode: 'egal', egalCount: 2 },
    escapeHtml: String, nameOf: id => id || 'dish', tableNumber: '7', sentLines: [], toCents: n => Math.round(n * 100),
    money: n => n.toFixed(2) + ' MAD', fmtAmount: n => n.toFixed(2), cur: () => 'MAD',
    t: key => key, showToast: msg => messages.push(msg),
    $: key => { if (!nodes.has(key)) nodes.set(key, { textContent: '', classList: { remove() {} }, setAttribute() {} }); return nodes.get(key); },
  };
  let api;
  const context = vm.createContext({ document: { addEventListener() {} }, window: { addEventListener() {} }, KiwiOrderMenu: { orderProParts: {
    run: (name, factory) => extensions[name] = factory(),
    extension: (name, key) => name === 'draft' ? () => ({}) : extensions[name][key],
    define: (_, __, factory) => api = factory(scope),
  } } });
  if (fs.existsSync(path.join(root, 'assets/orderpro/money.js'))) vm.runInContext(read('assets/orderpro/money.js'), context);
  vm.runInContext(read('assets/orderpro/payment.js'), context);
  return { api, scope, nodes, messages, compute: extensions.money?.compute };
}
module.exports = { guest, payment };
