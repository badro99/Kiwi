import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const read = file => fs.readFileSync(file, 'utf8');
const [bundle] = JSON.parse(read('tools/fixtures/live-link/split.json')).bundles;
// A module bump must update the editable parts as well as the delivered bundle.
// Use the real CLI in an isolated fixture; no git metadata or browser is needed.
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = fs;
const { tmpdir } = await import('node:os');
const { join, dirname } = await import('node:path');
const { spawnSync } = await import('node:child_process');
const dir = mkdtempSync(join(tmpdir(), 'kiwi-live-stamp-'));
try {
  const put = (file, text) => { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); };
  for (const file of ['tools/stamps.js', 'tools/bump-stamp.js', 'tools/app-bundle-manifest.json', 'tools/fixtures/live-link/split.json', bundle.file, ...bundle.parts.map(p => p.file)]) put(file, read(file));
  put('assets/live-link/queue-store.js', '// queue module\n');
  put('assets/pos-dispatch.js', 'const REGISTRY = {};\n');
  put('dashboard.html', '<script type="module" src="assets/live-link.js?v=1"></script>');
  put('kiwi-caisse.html', '');
  put('kiwi-sw.js', "var SHELL = ['/assets/live-link.js?v=1'];\n");
  const run = spawnSync(process.execPath, [join(dir, 'tools/bump-stamp.js'), 'assets/live-link/queue-store.js'], { env: { ...process.env, KIWI_STAMPS_ROOT: dir }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const actual = fs.readFileSync(join(dir, bundle.file), 'utf8');
  assert.equal(actual, bundle.parts.map(p => fs.readFileSync(join(dir, p.file), 'utf8')).join(''), 'bumping an imported module preserves editable-part concatenation');
  const manifest = JSON.parse(fs.readFileSync(join(dir, 'tools/asset-stamps.json'), 'utf8'));
  assert.equal(manifest[bundle.file].sha, createHash('sha256').update(actual).digest('hex').slice(0, 16), 'cascaded bundle content is resealed');
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('✓ Live Link module stamps propagate through the real CLI to bundle, editable parts and seal');
