#!/usr/bin/env node
// #94b: click the rendered Boutique and Maison controls, never call a handler.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, [new URL('./kiwi-ui-qa-mcp/server.js', import.meta.url).pathname],
  { stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '', nextId = 0;
const pending = new Map();
child.stdout.on('data', chunk => {
  buffer += chunk.toString();
  let end;
  while ((end = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    if (!line.trim()) continue;
    const result = JSON.parse(line);
    pending.get(result.id)?.(result.result);
    pending.delete(result.id);
  }
});
function call(name, args = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`UI QA timeout: ${name}`)); }, 90000);
    pending.set(id, result => { clearTimeout(timer); resolve(result); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call',
      params: { name, arguments: args } }) + '\n');
  });
}
function text(result) {
  assert.ok(!result.isError, result.content?.[0]?.text || 'UI QA error');
  return result.content?.[0]?.text || '';
}
function ref(screen, pattern) {
  const line = screen.split('\n').find(row => /^q\d+ (?:button(?:\/button)?|input(?:\/number|\/search)?) /.test(row)
    && pattern.test(row));
  assert.ok(line, `Missing visible control ${pattern}:\n${screen}`);
  return line.match(/^q\d+/)[0];
}
async function click(screen, pattern) { return text(await call('ui_click', { ref: ref(screen, pattern) })); }

let checks = 0;
try {
  for (const [scenario, customer, due, baseline] of [
    ['boutique', /Lalla Khadija/, '5600', '5 550'],
    ['maison', /Lalla Kenza/, '1235', '5 550'],
  ]) {
    let screen = text(await call('start_retail_fixture', { scenario }));
    assert.ok(screen.includes(baseline + ' MAD aujourd\'hui'), 'fixture baseline'); checks++;
    screen = await click(screen, /Attacher une cliente/);
    screen = await click(screen, customer);
    screen = await click(screen, /Encaisser ·/);
    screen = await click(screen, /Montant…/);
    screen = text(await call('ui_fill', { ref: ref(screen, /Montant de cette part/), value: '300' }));
    screen = await click(screen, /Espèces/);
    screen = await click(screen, /Confirmer/);
    assert.ok(screen.includes('Acompte reçu · garder'), 'cash part exposes durable open-bill choice'); checks++;
    screen = await click(screen, /Acompte reçu · garder/);
    assert.ok(screen.includes('6 ventes · 5 850 MAD'), 'only 300 received is added to day takings: ' + screen.slice(0,700)); checks++;
    screen = await click(screen, /button Acomptes$/);
    assert.ok(screen.includes(`Reste ${due}.00 MAD`), 'visible outstanding amount'); checks++;
    screen = await click(screen, new RegExp(`Reste ${due}\\.00 MAD`));
    screen = await click(screen, /Virement \/ Versement/);
    screen = await click(screen, /Versement reçu · confirmer/);
    const closed = text(await call('ui_assert', { selector: '[data-retail-balance-list]',
      condition: 'text_contains', expected: 'Aucune note ouverte',
      description: `${scenario} second receipt settles the balance`, timeoutMs: 15000 }));
    assert.ok(closed.startsWith('PASS:'), `${scenario} balance closed: ${closed}`); checks++;
    await call('close_session');
  }
  console.log(`✓ retail acompte browser: ${checks} rendered assertions across Boutique and Maison`);
} finally {
  try { await call('close_session'); } catch (_) {}
  child.stdin.end();
}
