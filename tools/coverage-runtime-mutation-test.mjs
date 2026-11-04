// In-memory mutations prove the new executed contracts fail when wiring breaks.
// No production files are changed, and every child runs only against local code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const ROOT = path.resolve(import.meta.dirname, '..');
const cases = [
  ['split persistence', 'field-table-transfer-test.mjs', 'assets/caisse/offline.js',
    'tableSplits: Array.from(tableSplits.entries()),', 'tableSplits: [],'],
  ['printer target switch', 'print-paper-test.mjs', 'assets/printer/pairing-ui.js',
    "setConfig(Object.assign(f, { osPrinter: '' }));", 'setConfig(f);'],
  ['team publication', 'team-truth-test.mjs', 'assets/team.js',
    '      applyLiveTeam();', '      void 0;'],
  ['floor geometry', 'floorplan-sync-test.js', 'assets/floorplan-core.js',
    'const w = Math.max(8, +o.w || def.w || 80);', 'const w = Math.max(8, def.w || 80);'],
  ['kitchen visible transition', 'kds-data-states-test.mjs', 'kiwi-cuisine.html',
    "if (o.status === 'ready' || stationIsReady(o)) return 'pass';", "if (false) return 'pass';"],
  ['credit centimes', 'store-credits-test.mjs', 'assets/receipt.js',
    'var doc = build({ ts: v.at || Date.now(),\n      total: Math.abs(num(v.balance != null ? v.balance : v.amount)),\n      subtotal: Math.abs(num(v.amount != null ? v.amount : v.balance)) }, opts);',
    'var doc = build({ ts: v.at || Date.now() }, opts);'],
  ['landing billing click', 'landing-claims-test.mjs', '_next/static/chunks/2c2tj5hx4r2-w-e55e3888.js',
    'onClick:()=>a(e.value)', 'onClick:()=>{}'],
  ['pairing tenant key', 'pairing-parity-test.mjs', 'assets/caisse/offline.js',
    "('kiwi-caisse-shift:' + s)", "'kiwi-caisse-shift'"],
  ['reward refusal recovery', 'loyalty-truth-test.mjs', 'assets/retail-sale-hold.js',
    'if (ctx.close) ctx.close();', 'void ctx.close;'],
  ['promotion edit input', 'promotions-dashboard-run-test.mjs', 'assets/boutique-promos-dashboard.js',
    'd.name = name.value;', 'void name.value;'],
];
const parent = path.join(ROOT, '.kiwi/results'); fs.mkdirSync(parent, { recursive: true });
const scratch = fs.mkdtempSync(path.join(parent, 'coverage-mutations-'));
try {
  const preload = path.join(scratch, 'preload.cjs');
  fs.writeFileSync(preload, `const fs = require('node:fs');
const path = require('node:path');
const spec = JSON.parse(process.env.KIWI_COVERAGE_MUTATION);
const read = fs.readFileSync;
let changed = false;
fs.readFileSync = function(file, ...args) {
  const value = read.call(this, file, ...args);
  const pathname = file instanceof URL ? require('node:url').fileURLToPath(file) : String(file);
  if (path.resolve(pathname) !== path.resolve(spec.file)) return value;
  const text = String(value);
  if (!text.includes(spec.before)) return value;
  changed = true;
  const result = text.replace(spec.before, spec.after);
  return typeof value === 'string' ? result : Buffer.from(result);
};
process.on('exit', () => { if (!changed) { process.stderr.write('MUTATION NOT REACHED'); process.exitCode = 97; } });
`);
  for (const [name, suite, file, before, after] of cases) {
    const result = spawnSync(process.execPath, ['--require', preload, path.join(ROOT, 'tools', suite)], {
      cwd: ROOT, encoding: 'utf8', timeout: 30000,
      env: { ...process.env, KIWI_COVERAGE_MUTATION: JSON.stringify({ file, before, after }) },
    });
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 1, name + ': mutation must fail the actual suite\n' + output.slice(-1800));
    assert.ok(output.includes('AssertionError') || output.includes('✗'), name + ': fails an executed contract');
    assert.ok(!output.includes('MUTATION NOT REACHED'), name + ': real code mutation was applied');
    console.log('✓ mutation rejected: ' + name);
  }
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
