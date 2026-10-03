#!/usr/bin/env node
// Real inherited-stderr regression, without Chrome timing, merchant data or UI.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { releaseExitedBrowserStreams } from './browser-test-lifecycle.mjs';

// This launch naturally exits while its own descendant keeps fd 2 open, just
// as Chrome's reparented crashpad did in the ledger timeout reproduction.
const fixture = `
  const { spawn } = require('node:child_process');
  const descendant = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    stdio:['ignore','ignore',2]
  });
  process.stdout.write(String(descendant.pid));
  descendant.unref();
`;
const child = spawn(process.execPath,['-e',fixture],{stdio:['ignore','pipe','pipe']});
let descendantPid = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data',chunk=>{descendantPid+=chunk;});
const stdoutEnded = once(child.stdout,'end');
let checks = 0;
function check(value,label) { assert.ok(value,label); checks++; console.log('  ✓ '+label); }
try {
  assert.throws(()=>releaseExitedBrowserStreams(child),/has not exited/);
  check(!child.stderr.destroyed,'live browser streams are not closed prematurely');
  const [code,signal] = await once(child,'exit');
  await stdoutEnded;
  check(code===0 && signal===null,'owned browser surrogate exits naturally');
  check(/^\d+$/.test(descendantPid),'fixture identifies only its owned descendant');
  check(!child.stderr.destroyed,'exited browser still has inherited stderr open');
  const stderrClosed = once(child.stderr,'close');
  releaseExitedBrowserStreams(child);
  check(child.stdio.every(stream=>!stream || stream.destroyed),'owned inherited streams are closed after browser exit');
  await stderrClosed;
  releaseExitedBrowserStreams(child);
  check(child.stderr.destroyed,'release is idempotent');
} finally {
  // Exact fixture cleanup only. Never terminate the user’s browser/crashpad.
  if (/^\d+$/.test(descendantPid)) {
    try { process.kill(Number(descendantPid),'SIGTERM'); }
    catch (error) { if (error.code!=='ESRCH') throw error; }
  }
  if (child.exitCode===null && child.signalCode===null) child.kill('SIGTERM');
  else releaseExitedBrowserStreams(child);
}
console.log(`native demo ledger lifecycle: ${checks} checks passed`);
