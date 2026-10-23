import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('assets/clients-book.js', 'utf8');
const handler = source.match(/if \(rewardReady\) sh\.querySelector\('#kcb-redeem'\)\.onclick = (function \(\) \{[\s\S]*?\n    \});/)[1];
const languageSource = fs.readFileSync('assets/caisse-lang.js', 'utf8');
const element = () => ({ style: {}, dataset: {}, classList: { add() {}, toggle() {}, contains() { return false; } },
  attributes: [], childNodes: [], children: [], setAttribute() {}, getAttribute() { return null; },
  hasAttribute() { return false; }, appendChild() {}, insertBefore() {}, addEventListener() {},
  querySelector() { return null; }, querySelectorAll() { return []; } });
const document = { readyState: 'loading', documentElement: element(), body: element(), head: element(),
  createElement: element, getElementById() { return null; }, querySelector() { return null; },
  querySelectorAll() { return []; }, addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }) };
const langWindow = { localStorage: { getItem() { return null; }, setItem() {} } };
vm.runInNewContext(languageSource, { window: langWindow, document, localStorage: langWindow.localStorage,
  setTimeout() {}, clearTimeout() {}, requestAnimationFrame() {}, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 } });
const language = langWindow.KiwiCaisseLang;
for (const locale of ['fr', 'en', 'ar']) {
  language.set(locale);
  for (const text of ['Confirmation en cours…', 'Récompense refusée',
    'Récompense offerte', 'Carte réinitialisée.', 'La carte est conservée.', 'Carte réinitialisée. Confirmation au retour du réseau.']) {
    if (locale !== 'fr') assert.notEqual(language.tr(text), text, locale + ': translated redemption state');
  }
}
language.set('en');
assert.equal(language.tr('Déplacement impossible : visite à actualiser · synchronisez puis réessayez'),
  'Cannot move: Visit needs refreshing · Sync, then retry');
assert.equal(language.tr('Fusion impossible : erreur réseau').startsWith('Cannot merge:'), true);
for (const outcome of ['accepted', 'refused', 'retry', 'network']) {
  let answer, calls = 0, burns = 0, queued = 0;
  const response = new Promise((resolve, reject) => { answer = outcome === 'network' ? reject : resolve; });
  const button = { disabled: false, textContent: '' }, messages = [];
  const context = vm.createContext({
    c: { id: 'synthetic-client' }, sh: { querySelector: () => button },
    redemptionRequests: {}, esc: x => x,
    KC: { bookId: () => 'synthetic-shop', redemptionRef: () => 'synthetic-ref',
      reserveRedemption: (id, book, request) => {
        assert.equal(id, 'synthetic-client'); assert.equal(book, 'synthetic-shop');
        assert.equal(request.ref, 'synthetic-ref'); calls++; return response;
      }, redeem: (id, book, reservation) => {
        // Accepted: nothing to queue. Unreachable: queued under the probe's ref.
        assert.equal(book, 'synthetic-shop'); assert.equal(reservation.ref, 'synthetic-ref');
        if (!reservation.accepted) queued++;
        burns++;
      } },
    window: { KiwiCaisseLang: { tr: x => x } },
    renderList() {}, openDetail() {}, toast: (...args) => messages.push(args),
  });
  const click = vm.runInContext('(' + handler + ')', context);
  const pending = click.call(button);
  assert.equal(burns, 0, 'card must not reset before confirmation');
  assert.equal(messages.length, 0, 'success must not be toasted before confirmation');
  assert.equal(button.disabled, true, 'pending button is disabled');
  await click.call(button);
  assert.equal(calls, 1, 'duplicate click cannot reserve twice');
  answer(outcome === 'network' ? new Error('synthetic-network') : { ref: 'synthetic-ref', accepted: outcome === 'accepted', refused: outcome === 'refused' });
  await pending;
  // Refused keeps the card. Accepted resets it. Unreachable (offline, demo
  // book, network) still serves the customer: reset now, confirmed later.
  assert.equal(burns, outcome === 'refused' ? 0 : 1);
  assert.equal(queued, outcome === 'retry' || outcome === 'network' ? 1 : 0, 'unreachable reward is queued once');
  assert.equal(messages.at(-1)[0], outcome === 'refused' ? 'Récompense refusée' : 'Récompense offerte');
  assert.equal(context.redemptionRequests['synthetic-shop:synthetic-client'], undefined, 'settled request is released');
}
console.log('✓ Loyalty waits for acceptance, refuses on refusal, queues when unreachable and blocks duplicate clicks');
