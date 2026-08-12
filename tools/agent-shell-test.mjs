#!/usr/bin/env node
/* Kiwi AI · visual-shell contract.  Prevents the assistant from regressing to
 * a translucent modal or opening under the operator banner. */
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../assets/agent-skin.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../assets/agent-skin.js', import.meta.url), 'utf8');
let failures = 0;
function check(name, ok) {
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failures++;
}

check('assistant fullpage backdrop is opaque', /\.fa-drawer\.kiwi-fullpage\s*\{[\s\S]*?background:\s*var\(--ai-page\)\s*!important/.test(css));
check('assistant disables backdrop blur', /\.fa-drawer\.kiwi-fullpage\s*\{[\s\S]*?backdrop-filter:\s*none\s*!important/.test(css));
check('workspace uses an opaque theme surface', /--ai-page:\s*var\(--paper\)/.test(css));
check('operator banner height is measured', /getElementById\('kiwi-op-banner'\)/.test(js) && /getBoundingClientRect\(\)/.test(js));
check('measured offset reaches the shell', /setProperty\('--ai-top-offset'/.test(js));

console.log(`\n${5 - failures}/5 controls passed`);
process.exitCode = failures ? 1 : 0;
