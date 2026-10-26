#!/usr/bin/env node
/* tools/source-assertion-ratchet-test.mjs · a gate suite that only reads source
 * text has to say why that is enough.
 *
 * check.js names about 950 suites. Most run the code (a VM, the real route
 * handlers on SQLite, a browser). Some only read files and match text. Text
 * can stay green after the behaviour it describes has broken, so each of
 * those suites is declared in tools/source-assertion-manifest.json:
 *   structure  the repository's own shape (stamps, sizes, migrations, bans)
 *   style      layout, contrast or copy in CSS and markup
 *   twin       a named, running suite proves the same behaviour
 *   unbacked   behaviour asserted by text alone: the debt, pinned, only down
 * A new text-only suite fails here until it is declared, a twin must exist,
 * be named in check.js and run code, and a suite that starts running code
 * must leave the manifest (the pin then comes down).
 *   KIWI_UPDATE_SOURCE_BASELINE=1 node tools/source-assertion-ratchet-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'tools/source-assertion-manifest.json');
import classifier from './source-assertion-classifier.cjs';
export const sourceOnly = classifier.sourceOnly;

/* The classifier itself. */
assert.equal(sourceOnly("const s = fs.readFileSync('assets/a.js','utf8'); assert.match(s, /x/);"), true);
assert.equal(sourceOnly("import vm from 'node:vm'; fs.readFileSync('a')"), true);
assert.equal(sourceOnly("import { onRequestPost } from '../functions/api/sale.js'; fs.readFileSync('schema.sql')"), true);
assert.equal(sourceOnly("import { onRequestPost } from '../functions/api/sale.js'; fs.readFileSync('schema.sql'); await onRequestPost(context)"), false);
assert.equal(sourceOnly("vm.runInNewContext(source); fs.readFileSync('x')"), false);
assert.equal(sourceOnly("console.log('no reads')"), false);

const check = fs.readFileSync(path.join(ROOT, 'tools/check.js'), 'utf8');
const named = [...new Set([...check.matchAll(/['"`](?:tools\/)?([\w.-]+-test\.(?:mjs|js|cjs))['"`]/g)].map((m) => m[1]))]
  .filter((f) => fs.existsSync(path.join(ROOT, 'tools', f)));
const text = Object.fromEntries(named.map((f) => [f, fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8')]));
const textOnly = new Set(named.filter((f) => sourceOnly(text[f])));

const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const declared = new Map();
for (const kind of ['structure', 'style', 'twin']) for (const f of Object.keys(m[kind] || {})) declared.set(f, kind);
for (const f of m.unbacked || []) declared.set(f, 'unbacked');

const problems = [];
for (const f of textOnly) if (!declared.has(f)) problems.push(`${f} reads source text and runs nothing: make it run the code, or declare it in source-assertion-manifest.json`);
for (const [f, kind] of declared) {
  if (!named.includes(f)) problems.push(`${f} (${kind}) is no longer a gate suite: remove it from the manifest`);
  else if (!textOnly.has(f)) problems.push(`${f} (${kind}) now runs code: remove it from the manifest${kind === 'unbacked' ? ' and lower the pin' : ''}`);
}
for (const [f, twin] of Object.entries(m.twin || {})) {
  if (!named.includes(twin)) problems.push(`${f}: its twin ${twin} is not named in check.js`);
  else if (textOnly.has(twin)) problems.push(`${f}: its twin ${twin} only reads text too`);
}
// A whole-file twin cannot silently stand for unrelated money/security assertions.
for (const [f, twin] of Object.entries(m.twin || {})) {
  const proof = m.provenance && m.provenance[f];
  const assertions = classifier.assertions(text[f]);
  if (!proof || proof.suite !== twin || !Array.isArray(proof.assertions)
      || JSON.stringify(proof.assertions.map(a => a.assertion)) !== JSON.stringify(assertions)
      || proof.assertions.some(a => !['structure','behavioral'].includes(a.kind)
        || (a.kind === 'structure' ? !a.reason : !a.observation || !text[twin]?.includes(a.witness)))
      || !text[twin]?.includes(proof.target.slice('functions/'.length))
      || !proof.from || !proof.to || !named.includes('assertion-provenance-test.mjs'))
    problems.push(`${f}: missing assertion-level scope or exact-target mutation provenance`);
}
const unbacked = (m.unbacked || []).length;
if (unbacked > m.pin) problems.push(`${unbacked} unbacked text-only suites, pinned at ${m.pin}: a new one must run the code instead`);

if (process.env.KIWI_UPDATE_SOURCE_BASELINE === '1') {
  m.unbacked = (m.unbacked || []).filter((f) => textOnly.has(f));
  for (const kind of ['structure', 'style', 'twin']) for (const f of Object.keys(m[kind] || {})) if (!textOnly.has(f)) delete m[kind][f];
  m.pin = Math.min(m.pin, m.unbacked.length);
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
  console.log(`source-assertion manifest updated: ${m.unbacked.length} unbacked, pin ${m.pin}`);
  process.exit(0);
}
if (problems.length) {
  for (const p of problems) console.log('  ✗ ' + p);
  process.exit(1);
}
console.log(`✓ source assertions · ${named.length} gate suites, ${textOnly.size} read text only: ${Object.keys(m.structure).length} structure, ${Object.keys(m.style).length} style, ${Object.keys(m.twin).length} with a running twin, ${unbacked} unbacked (pinned ${m.pin})`);
