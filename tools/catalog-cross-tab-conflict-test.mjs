/* Catalogue boutique · une modification venue d'un autre onglet, pendant que cet
 * appareil n'arrive pas à écrire en local, ne se signale plus par une boîte système.
 *
 * r20 : window.alert bloquait le comptoir et ne proposait aucune action. Le vrai
 * catalogue tourne ici avec un stockage qui refuse l'écriture (quota plein) ; on
 * déclenche l'événement « storage » d'un autre onglet et on exige : aucune boîte
 * système, les modifications locales intactes, un événement annulable pour la
 * surface qui a son écran (les vrais écouteurs du tableau de bord et des deux caisses
 * sont extraits de leur source), et sans surface la synchronisation part d'elle-même. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const handlerSource = (file) => {
  const src = fs.readFileSync(new URL(`../assets/${file}`, import.meta.url), 'utf8');
  const i = src.indexOf("window.addEventListener('kiwi:catalog-conflict'");
  assert.ok(i > 0, file + ' listens to the conflict event');
  const block = src.indexOf('\n});\n', i), line = src.indexOf('\n', i);
  return src.slice(i, file === 'pages-pro-boutique.js' ? block + 5 : line);
};

function setup({ surface, cancel } = {}) {
  const log = { alerts: 0, events: [], toasts: [], timers: [], till: [] };
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) || null, setItem() { throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); }, removeItem: (k) => data.delete(k) };
  const el = () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, setAttribute() {} });
  const listeners = {};
  const w = { localStorage: storage, console, alert: () => { log.alerts++; },
    document: { documentElement: { lang: 'fr' }, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: el, head: el(), body: el() },
    KiwiEnv: { isReal: () => true }, navigator: {}, addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    dispatchEvent: (e) => { log.events.push(e); let canceled = false; e.preventDefault = () => { canceled = true; }; for (const fn of listeners[e.type] || []) fn(e); return !canceled; },
    CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o.detail; this.cancelable = !!o.cancelable; } },
    setTimeout: (fn, ms) => { log.timers.push(ms); return log.timers.length; }, clearTimeout() {}, fetch: () => Promise.reject(Error('offline')) };
  w.window = w; w.self = w;
  vm.createContext(w);
  for (const f of ['color-palette', 'boutique-catalog-parts', 'boutique-catalog']) vm.runInContext(fs.readFileSync(new URL(`../assets/${f}.js`, import.meta.url), 'utf8'), w);
  const K = w.KiwiBoutiqueCatalog; K.use('conflict-a');
  const p = K.addProduct({ name: 'Article local', priceMAD: 100 });
  assert.equal(K.durable(), false, 'precondition: the local write was refused');
  if (surface === 'dashboard') { w.toast = (msg, o) => log.toasts.push({ msg, o }); vm.runInContext(handlerSource('pages-pro-boutique.js'), w); }
  if (surface === 'till') { w.toast = (...a) => log.till.push(a); vm.runInContext(handlerSource('pos-boutique.js'), w); }
  if (surface === 'maison') { w.toast = (...a) => log.till.push(a); vm.runInContext(handlerSource('pos-maison.js'), w); }
  if (cancel) w.addEventListener('kiwi:catalog-conflict', (e) => e.preventDefault());
  log.timers.length = 0; log.events.length = 0;
  return { K, p, log, fire: () => listeners.storage[0]({ key: K._key, newValue: JSON.stringify({ products: [], variants: [], categories: [] }) }) };
}

/* 1 · tableau de bord : toast de marque avec action, modifications intactes, rien de bloquant */
{
  const { K, p, log, fire } = setup({ surface: 'dashboard' });
  fire();
  assert.equal(log.alerts, 0, 'no system dialog');
  assert.equal(K.listProducts().some((x) => x.id === p.id), true, 'local edits are preserved');
  const conflict = log.events.find((e) => e.type === 'kiwi:catalog-conflict');
  assert.ok(conflict && conflict.cancelable && typeof conflict.detail.sync === 'function', 'a cancelable conflict event carries a sync action');
  assert.equal(log.toasts.length, 1, 'one branded toast');
  assert.equal(log.toasts[0].o.type, 'warn');
  assert.equal(log.toasts[0].o.action.label, 'Synchroniser');
  assert.match(log.toasts[0].msg, /sans recharger/);
  assert.equal(log.timers.length, 0, 'nothing is pushed until the merchant chooses');
  log.toasts[0].o.action.onClick();
  assert.deepEqual(log.timers, [0], 'the action pushes the local edits at once (schedulePush(0))');
}
/* 2 · caisses : pas de bouton possible dans le toast, il informe et la synchronisation part d'elle-même */
for (const surface of ['till', 'maison']) {
  const { log, fire } = setup({ surface });
  fire();
  assert.equal(log.alerts, 0);
  assert.equal(log.till.length, 1, surface + ': till toast');
  assert.equal(log.till[0][2], 'warn');
  assert.deepEqual(log.timers, [0], surface + ': the till syncs on its own');
}
/* 3 · aucune surface : pas de boîte, la synchronisation part d'elle-même */
{
  const { K, p, log, fire } = setup({});
  fire();
  assert.equal(log.alerts, 0); assert.deepEqual(log.timers, [0]); assert.equal(K.listProducts().some((x) => x.id === p.id), true);
}
/* 4 · une surface qui prend l'événement sans rien faire de plus ne déclenche pas de double synchronisation */
{
  const { log, fire } = setup({ cancel: true });
  fire();
  assert.equal(log.alerts, 0); assert.deepEqual(log.timers, [], 'a surface that owns the event decides');
}
console.log('✓ catalog cross-tab conflict: no system dialog, edits kept, branded toast with a sync action');
