#!/usr/bin/env node
/* tools/assertion-mix-test.mjs · text-versus-behaviour ratchet, per assertion.
 *
 * source-assertion-ratchet-test.mjs asks per SUITE whether the file runs any
 * code. A suite that runs one handler and then greps 35 lines of HTML passes
 * that question and counts as behavioural. This one counts per ASSERTION
 * (tools/assertion-mix.cjs): an assertion is text when it only checks the
 * contents of a file read from disk through string operations.
 *
 * tools/assertion-mix-baseline.json pins every mixed suite (one that also
 * runs code) with 10+ text assertions, or 5+ that are over half of its
 * assertions. A pin only goes down; a suite not in the list may not reach that
 * size; a suite that fell under it leaves the list (update flag). Suites that
 * read text and run nothing stay governed by source-assertion-manifest.json.
 * The count is a floor: a call into unknown code counts as behaviour.
 *   KIWI_UPDATE_MIX_BASELINE=1 node tools/assertion-mix-test.mjs   (lowers only)
 *   KIWI_SEED_MIX_BASELINE=1   node tools/assertion-mix-test.mjs   (first write)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mixModule from './assertion-mix.cjs';
import classifier from './source-assertion-classifier.cjs';

const { mix } = mixModule;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'tools/assertion-mix-baseline.json');

/* The counter itself: one handler run, then lines grepped. */
const probe = `
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/sale.js';
const html = fs.readFileSync('x.html', 'utf8');
const css = fs.readFileSync('x.css', 'utf8');
const res = await onRequestPost(ctx);
assert.equal(res.status, 200);
assert.ok(html.includes('a'));
assert.match(css, /b/);
assert.ok(/c/.test(html) && css.includes('d'));
assert.equal(res.headers.get('x'), 'y');
`;
assert.deepEqual(mix(probe), { total: 5, text: 3, behavioural: 2 });
const helperProbe = `
const read = (p) => fs.readFileSync(p, 'utf8');
const src = read('a.js');
function check(name, cond) { if (!cond) throw new Error(name); }
check('has it', src.includes('q'));
check('runs it', vm.runInNewContext(src).ok === true);
check('numbers', 1 + 1 === 2);
`;
assert.deepEqual(mix(helperProbe), { total: 3, text: 1, behavioural: 2 });
assert.deepEqual(mix('const x = 1;'), { total: 0, text: 0, behavioural: 0 });

const check = fs.readFileSync(path.join(ROOT, 'tools/check.js'), 'utf8');
const named = [...new Set([...check.matchAll(/['"`](?:tools\/)?([\w.-]+-test\.(?:mjs|js|cjs))['"`]/g)].map((m) => m[1]))]
  .filter((f) => fs.existsSync(path.join(ROOT, 'tools', f))).sort();

const counts = {};
let totalAll = 0, textAll = 0, textOnlySuites = 0;
for (const f of named) {
  const src = fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8');
  if (classifier.sourceOnly(src)) { textOnlySuites++; continue; }   // declared in source-assertion-manifest.json
  const c = mix(src);
  totalAll += c.total; textAll += c.text;
  const heavy = c.text >= 10 || (c.text >= 5 && c.text * 2 > c.total);
  if (heavy) counts[f] = { text: c.text, total: c.total };
}

const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { suites: {} };
const pins = base.suites || {};

if (process.env.KIWI_UPDATE_MIX_BASELINE === '1' || process.env.KIWI_SEED_MIX_BASELINE === '1') {
  const seed = process.env.KIWI_SEED_MIX_BASELINE === '1';
  const next = {};
  for (const [f, c] of Object.entries(counts)) {
    if (pins[f]) next[f] = { text: Math.min(pins[f].text, c.text), total: c.total };
    else if (seed) next[f] = c;
  }
  const out = {
    note: 'Mixed suites (they run code AND grep files) with 10+ text assertions, or 5+ that are over half. Counted per assertion by tools/assertion-mix.cjs; the count is a floor. Pins only go down: replace a grep line by a call into the code, then KIWI_UPDATE_MIX_BASELINE=1. Checked by tools/assertion-mix-test.mjs.',
    suites: Object.fromEntries(Object.entries(next).sort()),
  };
  fs.writeFileSync(BASELINE, JSON.stringify(out, null, 2) + '\n');
  console.log(`assertion-mix baseline written: ${Object.keys(out.suites).length} suites, ${Object.values(out.suites).reduce((s, c) => s + c.text, 0)} text assertions`);
  process.exit(0);
}

const problems = [];
for (const [f, c] of Object.entries(counts)) {
  if (!pins[f]) problems.push(`${f}: ${c.text} of ${c.total} assertions only grep files while the suite also runs code. Make them call the code, not read it (no pin for a new suite)`);
  else if (c.text > pins[f].text) problems.push(`${f}: text assertions rose from ${pins[f].text} to ${c.text} (of ${c.total}). A pin only goes down`);
}
for (const f of Object.keys(pins)) {
  if (!named.includes(f)) problems.push(`${f} is no longer a gate suite: lower the baseline (KIWI_UPDATE_MIX_BASELINE=1)`);
  else if (!counts[f] && pins[f]) { /* fell under the line: fine, update lowers the file */ }
}
if (problems.length) { for (const p of problems) console.log('  ✗ ' + p); process.exit(1); }
const pinned = Object.values(pins).reduce((s, c) => s + c.text, 0);
console.log(`✓ assertion mix · ${named.length} gate suites, ${totalAll} assertions in code-running suites, ${textAll} grep a file (${Math.round(100 * textAll / Math.max(1, totalAll))}%); ${Object.keys(pins).length} grep-heavy suites pinned at ${pinned} text assertions, ${textOnlySuites} text-only suites governed elsewhere`);
