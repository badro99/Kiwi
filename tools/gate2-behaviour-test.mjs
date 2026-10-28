import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Break runtime behaviour in memory only. The former source patterns survive.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-gate2-'));
try {
  for (const [suite, asset, before, after] of [
    ['till-truth-test.mjs', 'assets/caisse-hardware.js', 'function realTill() {', 'function realTill() { return false;'],
    ['employee-language-test.js', 'assets/serveur-lang.js', "'Full phone number'", "'\\u062f\\u0627\\u0628\\u0627'"],
  ]) {
    const normal = spawnSync(process.execPath, ['tools/' + suite], { encoding: 'utf8' });
    assert.equal(normal.status, 0, suite + ' must pass before mutation: ' + normal.stderr);
    const hook = path.join(dir, 'mutate.cjs');
    fs.writeFileSync(hook, `const fs = require('node:fs');
const read = fs.readFileSync;
fs.readFileSync = function(file, ...args) {
  const result = read.call(this, file, ...args);
  if (String(file).endsWith(${JSON.stringify(asset)}) && typeof result === 'string') {
    if (!result.includes(${JSON.stringify(before)})) throw Error('Mutation target missing');
    return result.replace(${JSON.stringify(before)}, ${JSON.stringify(after)});
  }
  return result;
};\n`);
    const run = spawnSync(process.execPath, ['--require', hook, 'tools/' + suite], { encoding: 'utf8' });
    assert.equal(run.error, undefined);
    assert.equal(run.signal, null);
    assert.equal(run.status, 1, suite + ' must reject broken runtime behaviour');
    console.log('✓ ' + suite + ' rejects runtime mutation');
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
