import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = process.env.KIWI_TEST_ROOT || '.', read = f => fs.readFileSync(root + '/' + f, 'utf8');
const paths = new Set(fs.readdirSync(root + '/assets/icons/material').filter(f => f.endsWith('.svg')).flatMap(f => [...read('assets/icons/material/' + f).matchAll(/<path[^>]*\bd="([^"]+)"/g)].map(m => m[1])));
const source = read('kiwi-cuisine.html');
const set = source.slice(source.indexOf("    clock: '<svg"), source.indexOf('\n  };', source.indexOf("    clock: '<svg")));
let count = 0;
for (const [entry, key, svg] of set.matchAll(/\b(\w+): '(<svg.*?<\/svg>)'/g)) {
  assert.match(svg, /fill="currentColor"/, key);
  assert.match(svg, /viewBox="0 -960 960 960"/, key);
  assert.ok(!/stroke=|<circle/.test(svg), key);
  for (const [, d] of svg.matchAll(/<path[^>]*\bd="([^"]+)"/g)) { assert.ok(paths.has(d), key + ': exact vendored Material path'); count++; }
}
for (const [, d] of source.matchAll(/<path[^>]*\bd="([^"]+)"/g)) assert.ok(paths.has(d), 'static KDS path is Material');
assert.ok(count >= 9, 'whole KDS icon set checked');
console.log('✓ KDS: ' + count + ' paths match vendored Material Symbols');
