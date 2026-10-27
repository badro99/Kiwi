#!/usr/bin/env node
/* coverage-probe · a coverage cell counts when its annotation is reached, not
 * when it is written (tools/coverage-probe.mjs, tools/coverage-hooks.mjs).
 *   node tools/coverage-probe-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mark } from './coverage-hooks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('  ✓ ' + label); };

check('each annotation gets a call on its own line; nothing else moves', () => {
  const src = 'a();\n  // coverage: surface=x-y locale=fr viewport=phone\n  await page.goto(u);\n// coverage: not an annotation\nb();\n';
  const out = mark(src);
  assert.equal(out.split('\n').length, src.split('\n').length);
  assert.equal(out.split('\n')[1], '  globalThis.__kiwiCoverageCell?.("x-y|fr|phone"); // coverage: surface=x-y locale=fr viewport=phone');
  assert.equal(out.split('\n')[3], '// coverage: not an annotation');
  assert.equal(mark('const s = 1;\n'), 'const s = 1;\n');
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-probe-'));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
fs.mkdirSync(path.join(dir, 'tools'));
const suite = path.join(dir, 'tools', 'fixture-browser-test.mjs');
fs.writeFileSync(suite, [
  'const page = { goto: async () => {} };',
  'const locales = process.env.ONLY_FR ? ["fr"] : ["fr", "ar"];',
  'for (const l of locales) {',
  '  if (l === "fr") {',
  '    // coverage: surface=demo locale=fr viewport=phone',
  '    await page.goto("/fr");',
  '  } else {',
  '    // coverage: surface=demo locale=ar viewport=phone',
  '    await page.goto("/ar");',
  '  }',
  '}',
  'if (false) {',
  '  // coverage: surface=demo locale=fr viewport=desktop',
  '  await page.goto("/never");',
  '}',
  'try { throw new Error("where"); } catch (e) { console.log(e.stack.split("\\n")[1]); }',
  '',
].join('\n'));
const run = (env) => {
  const ledger = path.join(dir, 'ledger-' + Math.random().toString(36).slice(2) + '.txt');
  const r = spawnSync(process.execPath, [suite], { encoding: 'utf8', env: { ...process.env, ...env, KIWI_COVERAGE_LEDGER: ledger,
    NODE_OPTIONS: '--import=' + pathToFileURL(path.join(HERE, 'coverage-probe.mjs')).href } });
  assert.equal(r.status, 0, r.stderr);
  const cells = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean) : [];
  return { cells, out: r.stdout };
};

check('only the annotations the run reached are recorded', () => {
  assert.deepEqual(run({}).cells, ['demo|fr|phone', 'demo|ar|phone']);
  assert.deepEqual(run({ ONLY_FR: '1' }).cells, ['demo|fr|phone'], 'a locale the run skipped is not reached');
});
check('a declared cell inside a branch that never runs stays unreached', () => {
  assert.ok(!run({}).cells.includes('demo|fr|desktop'));
});
check('stack traces keep their line numbers', () => {
  assert.match(run({}).out, /fixture-browser-test\.mjs:16:/);
});
check('without a ledger the probe changes nothing', () => {
  const r = spawnSync(process.execPath, [suite], { encoding: 'utf8', env: { ...process.env, KIWI_COVERAGE_LEDGER: '',
    NODE_OPTIONS: '--import=' + pathToFileURL(path.join(HERE, 'coverage-probe.mjs')).href } });
  assert.equal(r.status, 0, r.stderr);
});
check('a landing claim anchor is marked in front of its expression, even in a brace-less else, and a CommonJS run records only the anchor it reached', () => {
  const anchors = [{ assertion: 'ok(value === 2, "the claim holds for real")', key: 'claim:x#0' }];
  const out = mark('setup();\n  ok(value === 2, "the claim holds for real");\n', anchors);
  assert.equal(out.split('\n')[1], '  void globalThis.__kiwiCoverageCell?.("claim:x#0") || ok(value === 2, "the claim holds for real");');
  const branch = mark('if (a) skip();\nelse ok(value === 2, "the claim holds for real");\n', anchors);
  assert.equal(branch.split('\n')[1], 'else void globalThis.__kiwiCoverageCell?.("claim:x#0") || ok(value === 2, "the claim holds for real");', 'still one expression: the else keeps its body');
  assert.doesNotThrow(() => new Function('a', 'skip', 'ok', 'value', branch), 'the marked branch parses');
  /* An anchor that is the assertion's message lives inside a string: the mark
     goes in front of the string, or it would be text and never run. */
  const msg = mark("  ok(n === 2, 'le code existant scanne');\n", [{ assertion: 'le code existant scanne', key: 'claim:m#0' }]);
  assert.equal(msg.split('\n')[0], "  ok(n === 2, void globalThis.__kiwiCoverageCell?.(\"claim:m#0\") || 'le code existant scanne');");
  let hit = '';
  new Function('ok', 'n', 'globalThis', msg)((c, m) => { assert.ok(c, m); }, 2, { __kiwiCoverageCell: (k) => { hit = k; } });
  assert.equal(hit, 'claim:m#0', 'a message anchor is recorded when its assertion runs');
  const cjs = path.join(dir, 'tools', 'fixture-claim-test.js');
  fs.writeFileSync(cjs, 'const n = [1, 2].length;\nif (n > 5) {\n  console.log("never reached");\n}\nconsole.log("ran");\n');
  const r = spawnSync(process.execPath, ['-e', `
    import(${JSON.stringify(pathToFileURL(path.join(HERE, 'coverage-hooks.mjs')).href)}).then((m) => {
      const src = require('fs').readFileSync(${JSON.stringify(cjs)}, 'utf8');
      const marked = m.mark(src, [{ assertion: 'console.log("ran")', key: 'claim:y#0' }, { assertion: 'console.log("never reached")', key: 'claim:y#1' }]);
      require('fs').writeFileSync(${JSON.stringify(cjs)}, marked.replace(/globalThis/g, 'globalThis'));
    });`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const ledger = path.join(dir, 'cjs-ledger.txt');
  const run2 = spawnSync(process.execPath, [cjs], { encoding: 'utf8', env: { ...process.env, KIWI_COVERAGE_LEDGER: ledger,
    NODE_OPTIONS: '--import=' + pathToFileURL(path.join(HERE, 'coverage-probe.mjs')).href } });
  assert.equal(run2.status, 0, run2.stderr);
  assert.deepEqual(fs.readFileSync(ledger, 'utf8').split('\n').filter(Boolean), ['claim:y#0'], 'a CommonJS test records the anchor it reached, not the one it skipped');
});
check('the pool and the guard preload the probe, keep the cells with each pass, and the full gate requires the French cells', () => {
  const pool = fs.readFileSync(path.join(HERE, 'check-pool.js'), 'utf8');
  const guard = fs.readFileSync(path.join(HERE, 'check-guard.js'), 'utf8');
  const gate = fs.readFileSync(path.join(HERE, 'check.js'), 'utf8');
  assert.match(pool, /withProbe\(task, trace\.env\)/);
  assert.match(pool, /cells: hit\.cells/, 'a cached pass carries the cells it reached');
  assert.match(pool, /contentHash\('tools\/coverage-probe\.mjs'\)/, 'passes cached before the probe are not reused');
  assert.match(guard, /noteCells\(args, hit\.cells\)/);
  assert.match(gate, /guard\.reachedCells\(\)/);
  assert.match(gate, /coverage-required\.json/);
});
fs.rmSync(dir, { recursive: true, force: true });
console.log(`✓ coverage-probe-test · ${passed} held`);
