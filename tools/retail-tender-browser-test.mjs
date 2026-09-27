#!/usr/bin/env node
// Real rendered Boutique and Maison payment sheets on loopback-only fixtures.
// Click the product's checkout and confirmation; never invoke a handler/API.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, [new URL('./kiwi-ui-qa-mcp/server.js', import.meta.url).pathname],
  { stdio: ['pipe', 'pipe', 'pipe'] });
let input = '', nextId = 1;
const pending = new Map();
child.stdout.on('data', chunk => {
  input += chunk.toString();
  let i;
  while ((i = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, i); input = input.slice(i + 1);
    if (!line.trim()) continue;
    const result = JSON.parse(line);
    pending.get(result.id)?.(result.result);
    pending.delete(result.id);
  }
});
function call(name, args = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`UI QA timed out: ${name}`)); }, 90000);
    pending.set(id, result => { clearTimeout(timer); resolve(result); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) + '\n');
  });
}
function body(result) {
  assert.ok(!result.isError, result.content?.[0]?.text || 'UI QA error');
  return result.content?.[0]?.text || '';
}
function ref(screen, needle) {
  const line = screen.split('\n').find(row => /^q\d+ button/.test(row) && row.includes(needle));
  assert.ok(line, `Visible control ${needle} missing:\n${screen}`);
  return line.match(/^q\d+/)[0];
}

let checks = 0;
try {
  for (const scenario of ['maison', 'boutique']) {
    for (const [choice, confirm] of [['Virement / Versement', 'Versement reçu · confirmer'], ['Chèque', 'Chèque reçu · confirmer']]) {
      let screen = body(await call('start_retail_fixture', { scenario }));
      assert.ok(screen.includes('5 ventes'), `${scenario} synthetic baseline has five sales`); checks++;
      screen = body(await call('ui_click', { ref: ref(screen, 'Encaisser ·') }));
      screen = body(await call('ui_click', { ref: ref(screen, `button ${choice}`) }));
      assert.ok(screen.includes(confirm), `${scenario} ${choice} requires explicit received confirmation`); checks++;
      screen = body(await call('ui_click', { ref: ref(screen, confirm) }));
      const settled = body(await call('ui_assert', { selector: 'body', condition: 'text_contains',
        expected: '6 ventes', description: `${scenario} ${choice} completes one synthetic sale`, timeoutMs: 15000 }));
      assert.ok(settled.startsWith('PASS:'), `${scenario} ${choice} sale appears after click`); checks++;
      await call('close_session');
    }
  }
  console.log(`✓ retail tender browser: ${checks} rendered controls, four synthetic fixture sales`);
} finally {
  try { await call('close_session'); } catch (_) {}
  child.stdin.end();
}
