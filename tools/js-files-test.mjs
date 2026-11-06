// Le périmètre du contrôle de syntaxe suit l'arbre, pas une liste de dossiers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { jsFiles } = createRequire(import.meta.url)('./js-files.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-files-'));
try {
  for (const f of ['a.js', 'brand-new/deep/b.js', 'brand-new/c.js', 'vendor/min.js', 'x/vendor/min2.js', 'a 2.js', 'notes.md', 'm.mjs']) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), '');
  }
  const got = jsFiles(root).map((f) => path.relative(root, f)).sort();
  assert.deepEqual(got, ['a.js', 'brand-new/c.js', 'brand-new/deep/b.js'], 'a folder nobody listed is covered; vendor, conflict copies and non-js are not');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
// The real tree: every first-party script, including the folders the old list forgot.
const real = jsFiles(path.resolve(import.meta.dirname, '..', 'assets')).map((f) => f.split(path.sep).join('/'));
for (const dir of ['orderpro', 'clients-store', 'caisse-pairing']) assert.ok(real.some((f) => f.includes(`/assets/${dir}/`)), dir + ' is in the syntax loop');
assert.ok(!real.some((f) => f.includes('/vendor/')));
console.log('✓ js-files: the syntax loop walks the whole assets tree');
