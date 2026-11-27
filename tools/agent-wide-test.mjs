#!/usr/bin/env node
// The assistant's wide bench: everything else people type into the dashboard
// assistant, beyond their own figures (agent-bench-test.mjs holds those). How
// to use Kiwi, plans and prices, "open the customers page", commands to change
// data, valuation, runway, break-even, goals, trends, accounting, competitors,
// compose jobs, identity, small talk and off-topic, in French, English,
// Arabic, Darija and arabizi. Each line names the route a correct answer takes;
// a question that drifts to a wrong route (today's sales for "how much is my
// café worth", the model for "open the customers page") fails here.
//
// Born 27 Nov 2026 from a 1 092-question set: 603 routed right before the
// fixes, 973 after the first round and 1 065 after the second. Only the lines that route right are kept, so this guards
// the gain; tools/agent-wide.json is the list.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'tools/agent-bench-test.mjs'), 'utf8');
const cut = src.slice(src.indexOf('const noon'), src.indexOf('/* What each answer must carry'));
const { load, flatten } = require(path.join(root, 'tools/agent-harness.cjs'));
process.chdir(root);
const world = new Function('load', cut + '; return world;')(load);

/* Routes that answer a label correctly. A command to change data must say it
 * does not change data from the chat (or be a real till operation). */
const OK = {
  howto: ['feature'], plans: ['feature'], action_open: ['action'], compose: ['llm'], outside: ['outside', 'llm'],
  staffdata: ['lookup'], clientdata: ['lookup', 'clients'], productdata: ['lookup', 'stock'], hours: ['lookup'], cash: ['lookup', 'day'],
  revenue: ['revenue', 'day'], day: ['day', 'revenue'], secret: ['secret', 'inject'], inject: ['inject', 'secret'], command_change: ['lookup', 'operation'],
};
const CMD = /ne modifie pas|don’t change|ما كنبدّلش|n’envoie pas|don’t send|ما كنصيفطش/;
const items = JSON.parse(fs.readFileSync(path.join(root, 'tools/agent-wide.json'), 'utf8'));
const lang = (q) => /[؀-ۿ]/.test(q) ? 'ar' : /\b(the|my|how|what|is|do|i|can|you|show|open)\b/i.test(q) ? 'en' : 'fr';
const ws = {}; const bad = [];
for (const [q, expect] of items) {
  const L = lang(q); const w = ws[L] || (ws[L] = world(L));
  let got = '', r = '?';
  try { got = flatten(w.KiwiAgentAsk(q, L)); r = w.KiwiAgentRoute(q); } catch (e) { r = 'ERR ' + e.message; }
  const ok = (OK[expect] || [expect]).includes(r) && (expect !== 'command_change' || CMD.test(got) || r === 'operation');
  if (!ok) bad.push(`  ✗ [${expect}] ${q}  →  {${r}} ${got.replace(/\s+/g, ' ').slice(0, 100)}`);
}
if (bad.length) { console.log(bad.join('\n')); console.log(`✗ agent wide bench: ${items.length - bad.length}/${items.length} routed right`); process.exit(1); }
console.log(`✓ agent wide bench: ${items.length}/${items.length} routed right`);
