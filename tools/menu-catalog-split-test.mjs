/* Strict move proof from live production, plus the live multi-store harness. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import menuCatalogSource from './menu-catalog-test-source.cjs';
import dependencies from './dashboard-dependencies.cjs';
const read = file => fs.readFileSync(file, 'utf8');
const map = JSON.parse(read('tools/fixtures/menu-catalog/split.json'));
const original = gunzipSync(fs.readFileSync('tools/fixtures/menu-catalog/original.js.gz')).toString();
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
assert.equal(read('tools/fixtures/menu-catalog/sha256').trim(), map.sha256);
assert.equal(menuCatalogSource(), original, 'rebuild original byte for byte from live files');
const html = dependencies.eager(read('dashboard.html'));
for (const part of map.parts) {
  const source = read(part.file);
  let expected = part.prefix;
  for (const f of part.fragments) {
    let body = original.slice(f.start, f.end);
    if (f.adapter) body = body.replace('    toggleAvailable:', '  const toggleAvailable =').replace(/,$/, ';');
    assert.equal(source.slice(f.offset, f.offset + f.length), body, part.file + ': moved body byte identical');
    expected += body + (f.adapter ? '' : '\n\n');
  }
  assert.equal(source, expected + part.suffix, part.file + ': only declared adapters surround moved bodies');
  const at = html.indexOf(part.file + '?');
  assert.ok(at >= 0 && at < html.indexOf('assets/menu-catalog.js?'), part.file + ' precedes entry point');
  assert.match(read('kiwi-sw.js'), new RegExp("'/" + part.file.replaceAll('.', '\\.') + '\\?v=\\d+\''));
}
for (const originalMode of ['1', '0']) {
  const output = execFileSync(process.execPath, ['tools/menu-carte-store-test.js'], {
    encoding: 'utf8', env: { ...process.env, KIWI_MENU_CATALOG_ORIGINAL: originalMode },
  });
  assert.match(output, /41 contrôles/);
}
console.log('✓ menu split: byte-exact reconstruction and bodies, parser dependency order, precache, original and live 41-case multi-store/hydration/conflict harness');
