import assert from 'node:assert/strict';
import nativeFs from 'node:fs';
import queueCoreSource from './core-test-source.cjs';
const fs = { ...nativeFs, readFileSync: queueCoreSource.readFileSync };
const source = fs.readFileSync(new URL('../_headers', import.meta.url), 'utf8');
const rules = []; let rule;
for (const line of source.split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) {
    assert.ok(line.startsWith('/'), 'relative Pages path');
    assert.ok(!line.includes('?'), 'Pages rules cannot discriminate query stamps');
    assert.ok((line.match(/\*/g) || []).length <= 1, 'single splat per rule');
    rules.push(rule = { path: line, headers: [] });
  } else {
    assert.ok(rule && /^\s+(?:! [\w-]+|[\w-]+: .+)$/.test(line), 'indented header or detach');
    rule.headers.push(line.trim());
  }
}
assert.ok(rules.length <= 100, 'Pages rule budget');
function headers(path) {
  const result = {};
  for (const r of rules) {
    const pattern = '^' + r.path.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
    if (!new RegExp(pattern).test(new URL(path, 'https://test.invalid').pathname)) continue;
    for (const h of r.headers) {
      if (h.startsWith('! ')) { delete result[h.slice(2).toLowerCase()]; continue; }
      const colon = h.indexOf(':'); const name = h.slice(0, colon).toLowerCase(), value = h.slice(colon + 1).trim();
      result[name] = result[name] ? result[name] + ', ' + value : value;
    }
  }
  return result['cache-control'];
}
assert.equal(headers('/_next/static/chunk.js'), 'public, max-age=31536000, immutable');
for (const p of ['/assets/fonts/inter.woff2', '/assets/icons/material/add.svg']) assert.equal(headers(p), 'public, max-age=31536000');
for (const p of ['/assets/live-link.js', '/assets/live-link.js?v=42']) assert.equal(headers(p), 'public, max-age=3600, stale-while-revalidate=604800');
for (const p of ['/api/feed', '/api/store', '/auth/me', '/dashboard.html', '/kiwi-caisse', '/staff/']) assert.equal(headers(p), undefined, 'no public long-cache rule for ' + p);
for (const p of ['/tickets', '/tickets.html', '/agent-connect', '/agent-connect.html']) assert.equal(headers(p), 'private, no-store');
assert.equal(headers('/kiwi-sw.js'), 'public, max-age=0, must-revalidate');
console.log('✓ Pages syntax, single Cache-Control, fonts/icons, mutable assets and merchant-data exclusions');
