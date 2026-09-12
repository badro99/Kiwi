#!/usr/bin/env node
// Real MCP protocol -> fresh Chromium -> visible sidebar click -> hotel modal
// -> rendered assertion -> proof artifact. No production account or API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { validateUiProof } = require('./tickets-mcp/ui-proof.js');
let count = 0;
function ok(value, label) { assert.ok(value, label); count++; console.log('  ✓ ' + label); }
function browserAvailable() {
  const bins = [process.env.KIWI_CHROMIUM_BIN, process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  return bins.some(x => x && fs.existsSync(x));
}
if (!browserAvailable()) {
  if (process.env.CI) throw new Error('Chromium required for UI QA gate in CI.');
  console.log('  ○ skip: Chromium unavailable; no browser proof executed');
  process.exit(0);
}

const child = spawn(process.execPath, [path.join(ROOT, 'tools/kiwi-ui-qa-mcp/server.js')], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
let input = '', stderr = '', nextId = 1;
const waiting = new Map();
child.stdout.setEncoding('utf8');
child.stdout.on('data', chunk => {
  input += chunk;
  let pos;
  while ((pos = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, pos).trim(); input = input.slice(pos + 1);
    if (!line) continue;
    const result = JSON.parse(line);
    const pending = waiting.get(result.id);
    if (pending) { waiting.delete(result.id); pending.resolve(result); }
  }
});
child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-3000); });
child.once('exit', code => {
  for (const pending of waiting.values()) pending.reject(new Error(`MCP exited ${code}: ${stderr}`));
  waiting.clear();
});
function rpc(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${method} timeout: ${stderr}`)); }, 90000);
    waiting.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: e => { clearTimeout(timer); reject(e); } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
async function call(name, args = {}) {
  const r = await rpc('tools/call', { name, arguments: args });
  return r.result;
}
function body(r) { return r.content?.find(x => x.type === 'text')?.text || ''; }
function refFor(screen, label) {
  const line = screen.split('\n').find(x => /^q\d+ (?:a|button)/.test(x) && x.endsWith(' ' + label));
  assert.ok(line, `visible control ${label} not in screen:\n${screen}`);
  return line.match(/^q\d+/)[0];
}
function inputRef(screen, label, index = 0) {
  const lines = screen.split('\n').filter(x => /^q\d+ input/.test(x) && x.includes(' ' + label));
  assert.ok(lines[index], `visible input ${label} #${index + 1} missing`);
  return lines[index].match(/^q\d+/)[0];
}

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05' });
  ok(init.result?.serverInfo?.name === 'kiwi-ui-qa', 'MCP initializes');
  const list = await rpc('tools/list');
  const names = list.result.tools.map(x => x.name);
  ok(names.includes('start_hotel_fixture') && names.includes('finish_ui_proof'), 'interactive and evidence tools registered');
  ok(!names.includes('evaluate') && !names.includes('open_url') && !names.includes('call_api'), 'no arbitrary browser bypass or production URL tool');
  const empty = await call('finish_ui_proof', { ticketId: 999001, expectedOutcome: 'Ordinary reservation opens from the sidebar' });
  ok(empty.isError, 'cannot claim proof before a real browser exists');
  const started = await call('start_hotel_fixture');
  if (started.isError) console.log('START ERROR:', body(started));
  ok(!started.isError && body(started).includes('Synthetic hotel dashboard ready'), 'real Chromium and synthetic dashboard started');
  ok(body(started).includes('Réception'), 'hotel sidebar renders as user sees it');
  const first = await call('finish_ui_proof', { ticketId: 999001, expectedOutcome: 'Ordinary reservation opens from the sidebar' });
  ok(first.isError, 'proof refuses code-only/no-click claim');
  const mobile = await call('ui_viewport', { width: 390, height: 844 });
  ok(!mobile.isError, 'mobile responsive viewport renders');
  const desktop = await call('ui_viewport', { width: 1365, height: 900 });
  ok(!desktop.isError, 'desktop viewport restores the workstation UI');
  const reception = await call('ui_click', { ref: refFor(body(desktop), 'Réception') });
  if (reception.isError || !body(reception).includes('hx-stay-new')) console.log('RECEPTION:', body(reception));
  ok(!reception.isError && body(reception).includes('Réception'), 'real sidebar click reaches reception');
  const booking = await call('ui_click', { ref: refFor(body(reception), '+ Réservation') });
  ok(!booking.isError && body(booking).includes('Ajouter une réservation'), 'real reservation control opens visible editor');
  const bad = await call('ui_assert', { selector: '[data-hx-stay-form] button[type=submit]', condition: 'text_contains', expected: 'Impossible', description: 'Impossible word should fail' });
  ok(bad.isError, 'negative rendered assertion fails');
  const assertion = await call('ui_assert', { selector: '[data-hx-stay-form] button[type=submit]', condition: 'text_contains', expected: 'Confirmer la réservation', description: 'Normal hotel booking visibly offers confirmation' });
  ok(!assertion.isError && body(assertion).startsWith('PASS:'), 'specific rendered-state assertion passes');
  const named = await call('ui_fill', { ref: inputRef(body(booking), 'Nom et prénom', 0), value: 'QA Normal Guest' });
  ok(!named.isError, 'booker name typed through rendered input');
  let lower = await call('ui_scroll', { direction: 'down', pixels: 500, selector: '[data-hx-stay-form]' });
  ok(!lower.isError, 'modal scrolled with real wheel gesture');
  for (let i = 0; i < 3 && !body(lower).includes('input Nom et prénom'); i++) lower = await call('ui_scroll', { direction: 'down', pixels: 500, selector: '[data-hx-stay-form]' });
  if (!body(lower).includes('input Nom et prénom')) console.log('LOWER:', body(lower));
  const traveler = await call('ui_fill', { ref: inputRef(body(lower), 'Nom et prénom', 0), value: 'QA Normal Guest' });
  ok(!traveler.isError, 'traveler name typed through rendered input');
  let submitScreen = traveler;
  for (let i = 0; i < 4 && !body(submitScreen).includes('Confirmer la réservation'); i++) submitScreen = await call('ui_scroll', { direction: 'down', pixels: 500, selector: '[data-hx-stay-form]' });
  const submitted = await call('ui_click', { ref: refFor(body(submitScreen), 'Confirmer la réservation') });
  ok(!submitted.isError, 'booking submitted with real click');
  const settled = await call('ui_assert', { selector: '[data-hx-stay-form]', condition: 'absent', description: 'Booking editor closes after a successful ordinary guest save', timeoutMs: 15000 });
  if (settled.isError) {
    console.log('SETTLED:', body(settled));
    console.log('ERROR:', body(await call('ui_assert', { selector: '[data-hx-stay-error]', condition: 'text_contains', expected: 'IMPOSSIBLE_SENTINEL', description: 'Inspect actual booking error after submit' })));
  }
  ok(!settled.isError, 'ordinary guest booking completes in the rendered UI');
  const current = await call('ui_snapshot');
  ok(body(current).includes('QA Normal Guest'), 'saved guest appears on the reception screen');
  const reloaded = await call('ui_reload');
  ok(!reloaded.isError, 'real page reload succeeds');
  const back = await call('ui_click', { ref: refFor(body(reloaded), 'Réception') });
  ok(!back.isError, 'reception still reachable after reload');
  const persisted = await call('ui_assert', { selector: 'body', condition: 'text_contains', expected: 'QA Normal Guest', description: 'Saved guest remains in reception after reloading the browser', timeoutMs: 15000 });
  if (persisted.isError) console.log('PERSISTENCE:', body(persisted), '\nSCREEN:', body(await call('ui_snapshot')));
  ok(!persisted.isError, 'booking persists and renders after reload');
  const proof = await call('finish_ui_proof', { ticketId: 999001, expectedOutcome: 'A normal guest can reach the reservation confirmation from reception' });
  const match = body(proof).match(/UI proof saved: (\/[^\n]+proof\.json)/);
  ok(!proof.isError && match && fs.existsSync(match[1]), 'screenshot and manifest saved without changing a ticket');
  const manifest = JSON.parse(fs.readFileSync(match[1], 'utf8'));
  ok(manifest.ticketId === 999001 && manifest.actions.some(x => x.kind === 'click') && manifest.assertions.length >= 3, 'manifest has successful UI assertions and actual actions');
  ok(fs.existsSync(manifest.screenshot) && fs.statSync(manifest.screenshot).size > 1000, 'real PNG proof exists');

  // Unit-check the tickets MCP handoff gate independently from its live API.
  const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-ui-proof-unit-'));
  const screenshot = path.join(copyDir, 'screen.png');
  fs.copyFileSync(manifest.screenshot, screenshot);
  const proofFile = path.join(copyDir, 'proof.json');
  const clean = { ...manifest, screenshot, gitDirty: false };
  fs.writeFileSync(proofFile, JSON.stringify(clean));
  ok(validateUiProof(proofFile, 999001).ticketId === 999001, 'ticket MCP accepts fresh matching clean-commit proof');
  assert.throws(() => validateUiProof(proofFile, 999002), /match/);
  count++; console.log('  ✓ ticket mismatch rejected');
  fs.writeFileSync(proofFile, JSON.stringify({ ...clean, gitDirty: true }));
  assert.throws(() => validateUiProof(proofFile, 999001), /clean worktree/);
  count++; console.log('  ✓ dirty development capture rejected for submission');
  const stale = { ...clean, finishedAt: new Date(Date.now() - 25 * 3600000).toISOString() };
  fs.writeFileSync(proofFile, JSON.stringify(stale));
  assert.throws(() => validateUiProof(proofFile, 999001), /24 hours/);
  count++; console.log('  ✓ stale UI proof rejected');
  const closed = await call('close_session');
  ok(!closed.isError, 'fixture and Chromium close cleanly');
  console.log(`kiwi-ui-qa-mcp-test: ${count} controls passed`);
} finally {
  child.stdin.end();
  setTimeout(() => child.kill('SIGTERM'), 2000).unref();
}
