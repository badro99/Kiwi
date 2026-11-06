/* Shopify · un avertissement de santé propose sa reprise à côté du texte.
 *
 * r20 : « Stock Shopify abandonné », « Survente Shopify » et la référence de commande
 * étaient du texte nu ; le marchand devait chercher plus bas le bouton « Réessayer » ou
 * les correspondances. Le vrai paintIssues() tourne avec un petit DOM ; la reprise vient de
 * channel-link.js (bouton, libellés, actions) : on vérifie ici ce qui est peint et ce que
 * le clic déclenche. */
import assert from 'node:assert/strict';
import { paintIssues } from '../assets/channel-health.js';

const el = (tag) => ({ tag, className: '', textContent: '', children: [], appendChild(c) { this.children.push(c); return c; } });
globalThis.document = { createElement: el };
globalThis.window = { KiwiI18n: { getLang: () => 'fr' } };
globalThis.localStorage = { getItem: () => 'fr' };
const calls = [];
const button = (label, fn, ghost) => { const b = el('button'); b.className = 'shp-btn' + (ghost ? ' is-ghost' : ''); b.textContent = label; b.click = () => fn(); return b; };
const recovery = {
  button,
  actions: {
    'stock-dead': { label: 'Réessayer', run: (i) => calls.push(['retry', i.orderRef]) },
    'stock-pending': { label: 'Réessayer', run: (i) => calls.push(['retry', i.orderRef]) },
    'stock-short': { label: 'Actualiser les correspondances', run: (i) => calls.push(['map', i.orderRef]) },
  },
};
const paint = (issues, connection, withRecovery = true) => { const root = el('div'); paintIssues(root, issues, connection, withRecovery ? recovery : undefined); return root; };

let root = paint([{ code: 'stock-dead', orderRef: '#1001' }, { code: 'stock-short', orderRef: '#1002' }, { code: 'unsupported-currency', orderRef: '#1003' }, { code: 'stock-short', orderRef: '#1002' }]);
assert.equal(root.children.length, 3, 'one row per distinct incident');
const [dead, short, currency] = root.children;
assert.match(dead.textContent, /Stock Shopify à traiter à la main/); assert.match(dead.textContent, /#1001/);
assert.equal(dead.children.length, 1, 'the dead-stock row carries its recovery button');
assert.equal(dead.children[0].textContent, 'Réessayer');
dead.children[0].click(); short.children[0].click();
assert.deepEqual(calls, [['retry', '#1001'], ['map', '#1002']], 'each button runs its own recovery for its own order');
assert.equal(short.children[0].textContent, 'Actualiser les correspondances');
assert.equal(currency.children.length, 0, 'an unsupported currency has nothing to retry: no button');

/* La reprise vient aussi de la connexion (dernière erreur) et sans reprise le texte reste inchangé. */
root = paint([], { lastError: 'stock-dead', lastErrorContext: { orderRef: '#7' } });
assert.equal(root.children[0].children.length, 1, 'the connection-level warning gets the button too');
root = paint([{ code: 'stock-dead', orderRef: '#1' }], null, false);
assert.equal(root.children[0].children.length, 0, 'without a recovery map nothing changes');
console.log('✓ channel health: warnings carry their recovery action');
