import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const cancel = read('functions/api/sale/cancel.js');
const reprint = read('assets/pos-reprint.js');
const dateRange = read('assets/dateRange.js');
const interactive = read('assets/interactive.js');
const caisse = read('kiwi-caisse.html');
const alternate = read('assets/pos-autre.js');
const boutique = read('assets/pos-boutique.js');

assert(cancel.includes("source === 'dashboard'"), 'dashboard cancellation source is missing');
assert(cancel.includes('entitledMerchant'), 'dashboard entitlement check is missing');
assert(cancel.includes('isTillFor'), 'cashier till binding is missing');
assert(cancel.includes('manager-required'), 'manager role gate is missing');
assert(cancel.includes('void_ts IS NULL'), 'cancellation must be race-safe');
assert(!cancel.includes('env.DB.batch'), 'cancellation should not use an unsafe batch update');
assert(cancel.includes("source === 'cashier' && Date.now()"), 'cashier-only age boundary is missing');

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
assert(/function openNewProduct\(\)\s*\{\s*catalogDashboardOnly\(\);\s*return;/.test(boutique), 'boutique caisse new-product path must be locked');
assert(/function openEditProduct\(pid\)\s*\{\s*catalogDashboardOnly\(\);\s*return;/.test(boutique), 'boutique caisse edit-product path must be locked');
assert(!boutique.includes('data-vcolor="${v.id}"'), 'boutique caisse still exposes a variant price/color edit action');
assert(!boutique.includes('data-vdel="${v.id}"'), 'boutique caisse still exposes a variant deletion action');

console.log('order controls tests passed');
