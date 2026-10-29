import coreTestSource from './core-test-source.cjs';
import retailSource from './pos-retail-test-source.cjs';
import caisseTestSource from './caisse-test-source.cjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => retailSource(coreTestSource.readFileSync(path.join(root, file), 'utf8'));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const cancel = read('functions/api/sale/cancel.js');
const reprint = read('assets/pos-reprint.js');
const dateRange = read('assets/dateRange.js');
const interactive = read('assets/interactive.js');
const caisse = caisseTestSource(read('kiwi-caisse.html'));
const alternate = read('assets/pos-autre.js');
const boutique = read('assets/pos-boutique.js');

assert(cancel.includes("source === 'dashboard'"), 'dashboard cancellation source is missing');
assert(cancel.includes('entitledMerchant'), 'dashboard entitlement check is missing');
assert(cancel.includes('isTillFor'), 'cashier till binding is missing');
assert(cancel.includes('manager-required'), 'manager role gate is missing');
assert(cancel.includes('void_ts IS NULL'), 'cancellation must be race-safe');
/* A void is a money write plus an audit write. They go through one D1 batch
 * (one transaction): the update is guarded by void_ts IS NULL and the audit
 * row only lands when that update changed exactly one row. Without a batch
 * the route refuses. Behaviour is proven in cashier-cancel-test.mjs. */
assert(cancel.includes("error: 'atomic-cancel-unavailable'"), 'cancellation must refuse an adapter without transactions');
assert((cancel.match(/WHERE changes\(\) = 1/g) || []).length >= 2, 'each audit insert must depend on the guarded void');
assert(/env\.DB\.batch\(\[update, auditWithCents\]\)/.test(cancel), 'the void and its audit row must commit together');
assert(cancel.includes("source === 'cashier' && !body.reopen && Date.now()"), 'cashier-only age boundary is missing');

assert(reprint.includes("source: 'cashier'"), 'cashier cancellation source is missing');
assert(reprint.includes('Code manager'), 'cashier manager PIN copy is missing');
assert(reprint.includes("manager-required"), 'manager-required error copy is missing');

assert(dateRange.includes("saleId: String(s.id || '')"), 'dashboard feed must carry the real sale id');
assert(interactive.includes('/api/sale/cancel'), 'dashboard cancellation request is missing');
assert(interactive.includes("source: 'dashboard'"), 'dashboard cancellation source is missing');
assert(interactive.includes('data-ord-cancel'), 'dashboard cancellation action is missing');

assert(caisse.includes('Articles et prix se gèrent dans le tableau de bord'), 'caisse catalogue guard copy is missing');
assert(caisse.includes('Article inconnu · créez-le dans le tableau de bord avant la réception.'), 'unknown receipt guard is missing');
assert(!/<button[^>]*data-sk-additem/.test(caisse), 'caisse still exposes an add-product button');
assert(!/<button[^>]*data-sk-edit/.test(caisse), 'caisse still exposes a price-edit button');

assert(alternate.includes('ot-dashboard-only'), 'alternate caisse must show dashboard-owned catalogue copy');
assert(alternate.includes('function addModal() { catalogDashboardOnly(); return; }'), 'alternate caisse add-product path must be locked');
assert(boutique.includes('bqi-dashboard-only'), 'boutique caisse must show dashboard-owned catalogue copy');
assert(boutique.includes('function catalogDashboardOnly()'), 'boutique caisse catalogue guard is missing');
// Locked unless the operator switch « Gestion complète de l'inventaire sur la caisse » is on (Santos, 29 Oct).
assert(/function openNewProduct\(\)\s*\{\s*if \(!tillInventoryAllowed\(\)\) \{\s*catalogDashboardOnly\(\);\s*return;/.test(boutique), 'boutique caisse new-product path must be locked');
assert(/function openEditProduct\(pid\)\s*\{\s*if \(!tillInventoryAllowed\(\)\) \{\s*catalogDashboardOnly\(\);\s*return;/.test(boutique), 'boutique caisse edit-product path must be locked');
assert(boutique.split('data-vcolor="${v.id}"').length === 2 && boutique.includes("${tillInventoryAllowed() ? `<button class=\"bqi-cbtn\" data-vcolor=\"${v.id}\""), 'boutique caisse exposes the variant colour edit only behind the inventory switch');
assert(!boutique.includes('data-vdel="${v.id}"'), 'boutique caisse still exposes a variant deletion action');

/* Run: mutation normalizedRole returns the unnormalized input; the existing
 * text guards stay green while accented/case manager authorization breaks. */
const vm = await import('node:vm');
const { createRequire } = await import('node:module');
const { declaration } = createRequire(import.meta.url)('./js-declarations.cjs');
const managerContext = vm.createContext({});
vm.runInContext(['MANAGER_ROLES', 'normalizedRole', 'isManagerRole']
  .map(name => declaration(cancel.slice(cancel.indexOf(name === 'MANAGER_ROLES' ? 'const ' + name : 'function ' + name)), name)).join('\n'), managerContext);
for (const role of ['manager', 'OWNER', 'Gérant', 'Responsable', 'store-manager']) {
  assert(managerContext.isManagerRole(role), 'run: manager role recognized: ' + role);
}
for (const role of ['cashier', 'serveur', 'manager-assistant', '', null]) {
  assert(!managerContext.isManagerRole(role), 'run: non-manager role refused');
}

console.log('order controls tests passed');
