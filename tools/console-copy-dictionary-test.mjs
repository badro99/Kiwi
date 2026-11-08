/* r21 console#A0 · the console's FR/EN/AR copy lives in its own keyed dictionary
   (assets/admin-workspace-copy.js); the workspace module holds state and
   rendering and translates through it. Runs both real files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const dict = readFileSync('assets/admin-workspace-copy.js', 'utf8');
const workspace = readFileSync('assets/admin-workspace.js', 'utf8');
const win = {}; vm.runInNewContext(dict, { window: win });
const copy = win.KiwiAdminWorkspaceCopy;
assert.ok(copy && Object.keys(copy).length > 300, 'the dictionary module publishes its entries');
for (const [key, row] of Object.entries(copy)) for (const l of ['fr', 'en', 'ar']) assert.ok(row[l] && row[l].length, key + ' · ' + l);
assert.ok(Object.keys(copy).length === new Set(Object.keys(copy)).size);
const cut = workspace.slice(0, workspace.indexOf("  document.addEventListener('click'")) + ';window.test={L,copy};})();';
function run(lang, withDictionary) {
  const w = { KiwiAdminPolicy: {}, KiwiOperator: {}, KiwiAdminI18n: { lang } };
  const ctx = vm.createContext({ window: w, document: { getElementById: () => ({}), documentElement: { lang, dir: 'ltr' } }, Intl, URLSearchParams, location: { search: '' }, localStorage: { getItem: () => null } });
  if (withDictionary) vm.runInContext(dict, ctx);
  vm.runInContext(cut, ctx); return w.test;
}
const withDict = run('en', true), without = run('en', false);
assert.equal(withDict.L('Suspendu'), 'Suspended', 'the workspace translates through the dictionary');
assert.equal(without.L('Suspendu'), 'Suspendu', 'without the dictionary the workspace degrades to French, it does not crash');
assert.equal(Object.keys(withDict.copy).length, Object.keys(copy).length);
assert.equal(run('ar', true).L('Suspendu'), copy['Suspendu'].ar);
assert.doesNotMatch(workspace, /"Accès ouvert"\s*:/, 'the copy map is no longer inline in the operational module');
console.log('✓ console-copy-dictionary: ' + Object.keys(copy).length + ' keyed entries, FR/EN/AR, workspace translates through it');
