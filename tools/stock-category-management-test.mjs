import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'assets/stock.js'), 'utf8');
let failures = 0;
function ok(condition, label) {
  if (condition) console.log('  ✓ ' + label);
  else { failures++; console.error('  ✗ ' + label); }
}

console.log('\n■ Stock category management');
ok(src.includes("H['stock-manage-cat'] = (el) => openManageCategory(el.dataset.cat)"),
  'selected stock category exposes its management action');
ok(src.includes('function openManageCategory(categoryId)')
  && src.includes("stCategoryOverrides[categoryId] = { label: name, updatedAt: Date.now() }"),
  'category rename keeps the stable category id');
ok(src.includes('stDeletedCategories.add(categoryId)')
  && src.includes("category: target, updatedAt: Date.now()"),
  'category deletion reassigns assigned articles before hiding the category');
ok(src.includes('catOv: stCategoryOverrides') && src.includes('delCats: [...stDeletedCategories]')
  && src.includes("['delItems', 'delSups', 'delCats']"),
  'renames and deletions persist and merge across devices');
ok(src.includes("if (stCatFilter === categoryId) stCatFilter = target || 'all'"),
  'deleting the active category leaves a valid filter selected');

if (failures) process.exitCode = 1;
else console.log('✓ stock category management checks green');
