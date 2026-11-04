import assert from 'node:assert/strict';
import harness from './orderpro-reliability-harness.cjs';
for (const lang of ['fr', 'en', 'ar']) {
  let writes = 0;
  const { api, messages, I18N } = harness.guest({ lang, storage: { getItem() { throw Error('denied'); }, setItem() { writes++; throw Error('quota'); } } });
  assert.equal(api.store.get('session'), null);
  assert.doesNotThrow(() => { api.store.set('session', 'one'); api.store.set('session', 'two'); });
  assert.equal(writes, 2);
  assert.equal(messages.length, 1, 'one warning per page, without breaking ordering');
  assert.equal(messages[0], I18N[lang].gx_storage_unsaved);
  assert.ok(messages[0] && messages[0] !== 'gx_storage_unsaved');
}
console.log('✓ OrderPro: denied storage stays nonthrowing and warns once in FR/EN/AR');
