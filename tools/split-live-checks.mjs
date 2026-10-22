import assert from 'node:assert/strict';
import fs from 'node:fs';
// Check URL stamps, not content hashes: editing a file must not archive live checks.
export function precached(url) {
  const file = url.pathname.replace(/^\//, '');
  const stamps = JSON.parse(fs.readFileSync('tools/asset-stamps.json', 'utf8'));
  assert.ok(stamps[file], file + ': stamped asset');
  assert.equal(url.search, '?v=' + stamps[file].v, file + ': current URL stamp');
  assert.ok(fs.readFileSync('kiwi-sw.js', 'utf8').includes("'/" + file + url.search + "'"), file + ': exact URL precached');
}
