#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync, spawnSync } from 'node:child_process';

const shell = fs.readFileSync(new URL('../app/src/native-shell.js', import.meta.url), 'utf8');
const swift = fs.readFileSync(new URL('../app/ios/App/App/KiwiNativeShell.swift', import.meta.url), 'utf8');
let controls = 0;
function check(label, value) { assert.ok(value, label); controls++; console.log('  ✓ ' + label); }
const start = shell.indexOf('window.KiwiNativeHostAction = function (payload)');
const handler = shell.slice(start, shell.indexOf('\n  };', start) + 5);
const emitted = [...shell.matchAll(/hostAction\('([^']+)'/g)].map((match) => match[1]);
const handled = [...handler.matchAll(/id === '([^']+)'/g)].map((match) => match[1]);
check('every emitted native button has a bridge action', emitted.every((id) => handled.includes(id)));
let clicks = 0;
const ctx = { window: {}, state: { account: 'connected' }, acctNext: { click() { clicks++; } }, scheduleNativeSetupState() {} };
vm.createContext(ctx); vm.runInContext(handler, ctx);
ctx.window.KiwiNativeHostAction({ action: 'account-next' });
check('native Continue executes the existing account-next action', clicks === 1);
ctx.state.account = 'signedout'; ctx.window.KiwiNativeHostAction({ action: 'account-next' });
check('native Continue cannot advance a signed-out account', clicks === 1);

const helperStart = swift.indexOf('func kiwiNativeActionScript(');
const helper = swift.slice(helperStart, swift.indexOf('\n}', helperStart) + 2);
check('production send uses the UTF-8 preserving serializer', swift.includes('guard let script = kiwiNativeActionScript(payload)'));
check('native selection animation observes Reduce Motion', swift.includes('@Environment(\\.accessibilityReduceMotion)') && swift.includes('.animation(reduceMotion ? nil :'));
const env = { ...process.env, ...(process.platform === 'darwin' ? { DEVELOPER_DIR: process.env.DEVELOPER_DIR || '/Applications/Xcode.app/Contents/Developer' } : {}) };
if (spawnSync('swift', ['--version'], { env, timeout: 30000 }).status === 0) {
  const expected = { action: 'login', email: 'synthetic@example.invalid', password: 'éمرحبا😀\\"\n</script>\u2028', id: "');globalThis.injected=true;//" };
  const data = Buffer.from(JSON.stringify(expected)).toString('base64');
  const program = `import Foundation\n${helper}\nlet payload = try! JSONSerialization.jsonObject(with: Data(base64Encoded: "${data}")!) as! [String: String]\nprint(kiwiNativeActionScript(payload)!)`;
  const script = execFileSync('swift', ['-e', program], { env, encoding: 'utf8', timeout: 60000 });
  let actual;
  const receiver = { window: { KiwiNativeHostAction(value) { actual = JSON.parse(JSON.stringify(value)); } } };
  vm.createContext(receiver); vm.runInContext(script, receiver);
  assert.deepEqual(actual, expected);
  check('actual Foundation-to-JavaScript payload round-trip preserves Unicode and escaping', true);
  check('serialized user input cannot execute script', !receiver.injected);
} else {
  console.log('  ○ Swift unavailable: Foundation execution not tested; run this suite on the release Mac.');
}
console.log(`native-host-bridge-test: ${controls} controls passed`);
