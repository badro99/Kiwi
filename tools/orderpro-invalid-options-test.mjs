#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const orderProSource = fs.readFileSync(path.join(ROOT, 'OrderPro.html'), 'utf8');
const orderLibSource = fs.readFileSync(path.join(ROOT, 'functions/api/order/_lib.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(ROOT, 'functions/api/order/index.js'), 'utf8');
const queueSource = fs.readFileSync(path.join(ROOT, 'functions/api/order/queue.js'), 'utf8');

// 1. i18n dictionaries: FR, EN, and AR must all provide the new keys
for (const key of ['order_options_changed', 'order_menu_updated', 'order_item_fallback']) {
  const frMatch = new RegExp(`['"]?${key}['"]?\\s*:\\s*["'\`]([^"'\`]+)["'\`]`).test(orderProSource);
  assert.ok(frMatch, `FR dictionary contains ${key}`);
}
assert.match(orderProSource, /order_options_changed:\s*"Options à rechoisir pour \{n\}"/, 'FR order_options_changed is correct');
assert.match(orderProSource, /order_options_changed:\s*"Please reselect options for \{n\}"/, 'EN order_options_changed is correct');
assert.match(orderProSource, /order_options_changed:\s*"يرجى إعادة اختيار خيارات \{n\}"/, 'AR order_options_changed is correct');

// 2. postJSON forwards response attributes on HTTP 409
assert.match(orderProSource,
  /if\s*\(!r\.ok\)\s*return\s*Object\.assign\(\{\s*ok:\s*false,\s*status:\s*r\.status,\s*error:\s*\(j\s*&&\s*j\.error\)\s*\|\|\s*'http-'\s*\+\s*r\.status\s*\},\s*j\s*\|\|\s*\{\}\);/,
  'postJSON forwards j attributes (invalidOptions, unavailable, unknown) on non-ok responses');

// 3. Option serialization handles unselected optional single groups
assert.match(orderProSource,
  /const ids = opt\.type === 'multi' \? \(Array\.isArray\(sel\) \? sel : \[\]\) : \(!sel \? \[\] : \[sel\]\);/,
  'describeOptionChoices treats empty string sel as empty array instead of [\" \"]');
assert.match(orderProSource,
  /choiceId:\s*id,\s*label:\s*choiceLabel\(opt\.key,\s*id\)/,
  'describeOptionChoices passes stable choiceId');

// 4. showToast prevents naked {n} and trailing colons
assert.match(orderProSource, /if\s*\(clean\.includes\('\{n\}'\)\)\s*clean\s*=\s*clean\.replace\(\/\\\{n\\\}\/g,\s*''\)\.trim\(\);/,
  'showToast strips unreplaced {n} placeholders');
assert.match(orderProSource, /clean\s*=\s*clean\.replace\(\/\[:：\]\\s\*\$\/,\s*''\)\.trim\(\);/,
  'showToast strips trailing colons when nothing follows');

// 5. menu-changed handler extracts invalidOptions and triggers recovery
assert.match(orderProSource, /const\s+invalidOpts\s*=\s*Array\.isArray\(res\.invalidOptions\)\s*\?\s*res\.invalidOptions\.filter\(Boolean\)\s*:\s*\[\];/,
  'menu-changed handler extracts invalidOptions');
assert.match(orderProSource, /showToast\(t\('order_options_changed'\)\.replace\('\{n\}',\s*targetNames\s*\|\|\s*t\('order_item_fallback'\)\)\);/,
  'menu-changed handler shows order_options_changed with fallback');
assert.match(orderProSource, /openCustomizer\(m,\s*line\.qty,\s*key\);/,
  'menu-changed handler reopens customizer for the affected cart line');
assert.match(orderProSource, /showToast\(t\('order_menu_updated'\)\);/,
  'menu-changed handler has fallback if server returned menu-changed without specific item');

// 6. Functions server: _lib.js choice indexing and lookup by stable choiceId
assert.match(orderLibSource, /choicesById\.set\(cObj\.id,\s*cObj\);/,
  '_lib.js indexes choices by choiceId');
assert.match(orderLibSource, /group\.choicesById\.get\(choiceId\)/,
  '_lib.js resolves choices by stable choiceId before labelKey fallback');
assert.match(orderLibSource, /if\s*\(!choiceId\s*&&\s*!labelKey\)\s*continue;/,
  '_lib.js safely ignores empty choice entries without failing dish');

// 7. Functions server: index.js and queue.js cannot return menu-changed with empty arrays
const expectedServerBlock = /const unknown = \(priced\.unknown \|\| \[\]\)\.filter\(Boolean\);[\s\S]*?const unavailable = \(priced\.unavailable \|\| \[\]\)\.filter\(Boolean\);[\s\S]*?const invalidOptions = \(priced\.invalidOptions \|\| \[\]\)\.filter\(Boolean\);[\s\S]*?if \(unknown\.length \|\| unavailable\.length \|\| invalidOptions\.length\)/;
assert.match(indexSource, expectedServerBlock, 'index.js guarantees menu-changed has non-empty items');
assert.match(queueSource, expectedServerBlock, 'queue.js guarantees menu-changed has non-empty items');

// 8. Runtime behavioral simulation: priceOrder in _lib.js
const { priceOrder } = await import('../functions/api/order/_lib.js');

const mockMenu = {
  items: [
    {
      id: 'pasta_1',
      name: 'Prépare ton Plat',
      price: 55,
      avail: true,
      opts: ['opt_extras'],
      formula: null,
    }
  ],
  opts: [
    {
      id: 'opt_extras',
      name: 'Extras',
      kind: 'one',
      required: false,
      choices: [
        { id: 'c_burrata', name: 'Burrata New Label', price: 25 },
        { id: 'c_none', name: 'No Extras', price: 0 }
      ]
    }
  ]
};

const mockEnv = {
  DB: {
    prepare: () => ({
      bind: () => ({
        first: async () => ({
          data: JSON.stringify(mockMenu),
          updated_ts: Date.now()
        })
      })
    })
  }
};

// Test A: Empty option choice sent from client (the original bug) must be ignored and not fail the dish
const linesWithEmptyChoice = [
  {
    id: 'pasta_1',
    qty: 1,
    options: '',
    optionChoices: [{ group: 'opt_extras', label: '' }],
  }
];
const resA = await priceOrder(mockEnv, 'test-merchant', linesWithEmptyChoice);
assert.equal(resA.invalidOptions.length, 0, 'empty option choice is ignored and does not trigger invalidOptions');
assert.equal(resA.total, 55, 'dish price is calculated accurately');

// Test B: Option matched by choiceId even if label was renamed
const linesWithRenamedLabel = [
  {
    id: 'pasta_1',
    qty: 1,
    options: '',
    optionChoices: [{ group: 'opt_extras', choiceId: 'c_burrata', label: 'Burrata Old Stale Name' }],
  }
];
const resB = await priceOrder(mockEnv, 'test-merchant', linesWithRenamedLabel);
assert.equal(resB.invalidOptions.length, 0, 'choiceId matches even when label differs');
assert.equal(resB.total, 80, 'price includes choice price (55 + 25 = 80)');

// Test C: Genuinely invalid option choice triggers invalidOptions with non-empty item name
const linesWithInvalidOption = [
  {
    id: 'pasta_1',
    qty: 1,
    options: '',
    optionChoices: [{ group: 'opt_extras', choiceId: 'nonexistent_choice', label: 'Nonexistent' }],
  }
];
const resC = await priceOrder(mockEnv, 'test-merchant', linesWithInvalidOption);
assert.equal(resC.invalidOptions.length, 1, 'invalid choice triggers invalidOptions');
assert.equal(resC.invalidOptions[0], 'Prépare ton Plat', 'invalidOptions contains the item name');

console.log('✓ OrderPro invalid options regression tests passed.');
