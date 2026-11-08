// r21 employee B1: the planning card tells a shift already taken from a past date, a request limit, a lost
// session and a bad input, instead of one generic "refused" line. Real employee-planning.js, fake DOM and api.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const planning = fs.readFileSync(new URL('../assets/employee-planning.js', import.meta.url), 'utf8');
const data = { employee:{ id:'e1' }, schedule:{}, planning:{ requests:[{ id:'req-1', type:'leave', startDate:'2026-12-01', endDate:'2026-12-02', status:'pending' }],
  openShifts:[{ id:'os-1', status:'open', day:'2999-01-01', start:'09:00', end:'17:00' }] } };
async function boot(lang, api) {
  const listeners = {}, winListeners = {}, forms = [];
  let card = null, overlay = null;
  const element = () => ({ id:'', className:'', innerHTML:'', inert:false, addEventListener:(type, fn) => { listeners[type] = fn; }, querySelector: () => null, querySelectorAll: () => [], remove() { overlay = null; } });
  const document = { documentElement:{ lang }, activeElement:null, body:{ children:[], appendChild: el => { overlay = el; } },
    getElementById: id => id === 'kep-card' ? card : id === 'kg-sched-card' ? { insertAdjacentElement: (_, el) => { card = el; } } : null,
    querySelector: sel => sel === '.kep-overlay' ? overlay : null, addEventListener() {}, head:{ appendChild() {} }, visibilityState:'visible',
    createElement: () => { const el = element(); el.addEventListener = (type, fn) => { (el.handlers ||= {})[type] = fn; }; el.querySelector = sel => {
      if (sel !== 'form') return null;
      if (el.form) return el.form;
      const message = { hidden:true, textContent:'' }, button = { disabled:false };
      const form = { dataset:{ kepOpForm:'open', kepId:'os-1' }, elements:{ offeredDay:{ value:'' } }, isConnected:true, setAttribute() {}, focus() {}, addEventListener: (type, fn) => { form.submit = fn; },
        querySelector: s => s === '[data-kep-error]' ? message : s === '[type="submit"]' ? button : null };
      form.message = message; el.form = form; forms.push(form); return form; }; return el; } };
  const window = { KiwiEmployeeLive:api, addEventListener:(type, fn) => { winListeners[type] = fn; }, KiwiEnv:{ isReal: () => true } };
  vm.runInNewContext(planning, { window, document, console, Intl, Date, Promise, CSS:{ escape: s => s }, setInterval: () => 1, setTimeout: () => 1, clearTimeout() {}, MutationObserver: undefined });
  await winListeners.load();
  return {
    get card() { return card; },
    click: async (selector, dataset = {}) => { const button = { disabled:false, dataset, attributes:[] }; await card.handlers.click({ target:{ closest: sel => sel === selector ? button : null } }); return button; },
    claim: async () => { await card.handlers.click({ target:{ closest: sel => sel === '[data-kep-open]' ? { dataset:{ kepOpen:'os-1' } } : null } }); const form = forms.at(-1); await form.submit({ preventDefault() {}, currentTarget:form }); return form.message; },
  };
}
const fail = (status, code) => Object.assign(new Error(code), { status, code });

// The card-level actions (cancel, swap): one distinct state per cause.
for (const [label, failure, expected] of [
  ['already taken', fail(409, 'swap-unavailable'), 'taken'], ['already open', fail(409, 'swap-already-open'), 'taken'],
  ['past date', fail(409, 'swap-shift-past'), 'past'], ['limit', fail(409, 'planning-opportunity-limit'), 'limit'],
  ['lost session', fail(403, 'employee-session-required'), 'session'], ['bad input', fail(400, 'planning-date-invalid'), 'invalid'],
  ['unknown refusal', fail(409, 'planning-request-closed'), 'failed'], ['lost reply', Object.assign(new Error('t'), { code:'timeout' }), 'uncertain'],
]) {
  const ui = await boot('fr', { refresh: async () => data, cancelPlanningRequest: async () => { throw failure; } });
  await ui.click('[data-kep-cancel]', { kepCancel:'req-1' });
  assert.match(ui.card.innerHTML, new RegExp('data-kep-status="' + expected + '"'), label + ' -> ' + expected);
}
// Each state reads differently, in the three languages.
for (const lang of ['fr', 'en', 'ar']) {
  const texts = new Set();
  for (const code of ['swap-unavailable', 'swap-shift-past', 'planning-opportunity-limit', 'planning-date-invalid', 'planning-request-closed']) {
    const ui = await boot(lang, { refresh: async () => data, cancelPlanningRequest: async () => { throw fail(code === 'planning-date-invalid' ? 400 : 409, code); } });
    await ui.click('[data-kep-cancel]', { kepCancel:'req-1' });
    texts.add(ui.card.innerHTML.match(/<p class="kep-status"[^>]*>([^<]*)</)[1]);
  }
  assert.equal(texts.size, 5, lang + ': five causes, five different messages');
}
// The claim sheet: "someone else already took it" is not "this changed".
const sheet = {};
for (const [code, key] of [['open-shift-unavailable', 'taken'], ['open-shift-past', 'past'], ['planning-opportunity-limit', 'limit'], ['open-shift-role-mismatch', 'role'], ['open-shift-invalid', 'changed']]) {
  const ui = await boot('fr', { refresh: async () => data, claimOpenShift: async () => { throw fail(409, code); } });
  const message = await ui.claim();
  assert.equal(message.hidden, false); sheet[key] = message.textContent;
}
assert.equal(new Set(Object.values(sheet)).size, 5, 'five causes, five sheet messages');
assert.match(sheet.taken, /déjà prise/);
console.log('PASS employee planning refusals: taken, past, limit, session, invalid and unknown are told apart (FR/EN/AR)');
