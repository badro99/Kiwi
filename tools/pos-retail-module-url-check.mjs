/* Same-origin URL identity is module identity, including the query string. */
import { precached } from './split-live-checks.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export function retailCoreUrl(vertical) {
  const source = fs.readFileSync('assets/pos-dispatch.js', 'utf8');
  const entry = source.match(new RegExp("id: '" + vertical + "',\\s*file: '(pos-" + vertical + ")',\\s*rev: '([0-9]+)',\\s*module: true"));
  assert.ok(entry, vertical + ': dispatcher uses the shared module loader');
  const core = new URL('assets/' + entry[1] + '.js?v=' + encodeURIComponent(entry[2]), 'https://kiwi.test/kiwi-caisse.html');
  precached(core);
  const map = JSON.parse(fs.readFileSync('tools/fixtures/pos-' + vertical + '/split.json', 'utf8'));
  let backImports = 0;
  for (const chunk of map.chunks) {
    const owner = new URL(chunk.file, core.origin + '/');
    for (const [, specifier] of fs.readFileSync(chunk.file, 'utf8').matchAll(/from '([^']+)'/g)) {
      const resolved = new URL(specifier, owner);
      precached(resolved);
      if (resolved.pathname === core.pathname) {
        assert.equal(resolved.href, core.href, vertical + ': chunk and dispatcher core URLs must be identical');
        backImports++;
      }
    }
  }
  assert.equal(backImports, 3, vertical + ': all feature modules import the same core');
  const local = pathToFileURL(path.resolve('assets/' + entry[1] + '.js'));
  local.search = core.search;
  return local;
}
