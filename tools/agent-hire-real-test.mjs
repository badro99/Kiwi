#!/usr/bin/env node
// "Can I afford hiring a new employee?" on a REAL account (27 Nov 2026). Every
// real merchant used to get « I'd rather simulate nothing »: the hire model
// only knew the demo's cost structure. KiwiAgentData.hire answers from what
// Kiwi actually holds: the team's salaries (Équipe), the charges and margin
// from Marges (KiwiCharges), the last 30 days of sales. Checked here with a
// fake KiwiCharges so every verdict is pinned to exact arithmetic.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'tools/agent-bench-test.mjs'), 'utf8');
const cut = src.slice(src.indexOf('const noon'), src.indexOf('/* What each answer must carry'));
const { load, flatten } = require(path.join(root, 'tools/agent-harness.cjs'));
process.chdir(root);
const world = new Function('load', cut + '; return world;')(load);
const w = world('fr');
const hire = w.KiwiAgentData.hire;
const B = { revenue: 90000, salesWindowDays: 30 };
const sp = (s) => String(s).replace(/[\s\u202f\u00a0]+/g, ' ');
const flat = (r) => sp(flatten(r));
const K = (be, staff, socialRate = 20) => ({ monthly: () => ({ staff, socialRate }), breakEven: () => be });
let n = 0;
const check = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };

// fixed costs need 60 000 of sales a month at a 40 % contribution, pace 100 000
const be = { salesNeeded: 60000, contribution: 0.4, perDay: 2000, projection: 100000 };
check('good: pace covers the new break-even', () => {
  const r = hire({ q: 'puis-je embaucher un serveur à 4000', L: 'fr', K: K(be, null), B, uplift: 1.21, salary: 4000, n: 1 });
  // 4 000 + 20 % = 4 800 ; 4 800 / 0,4 = 12 000 more ; 72 000 needed ; 28 000 spare
  assert.match(flat(r), /4 800 MAD par mois/);
  assert.match(flat(r), /12 000 MAD de ventes en plus/);
  assert.match(flat(r), /72 000 MAD/);
  assert.equal(r.verdict.tone, 'good');
  assert.match(sp(r.verdict.text), /28 000 MAD/);
});
check('warn: covers today, not the extra salary', () => {
  const r = hire({ q: 'x', L: 'fr', K: K({ ...be, projection: 65000 }, null), B, uplift: 1.21, salary: 4000, n: 1 });
  assert.equal(r.verdict.tone, 'warn');
  assert.match(sp(r.verdict.text), /7 000 MAD/); // 72 000 - 65 000
});
check('bad: not even at today’s break-even', () => {
  const r = hire({ q: 'x', L: 'en', K: K({ ...be, projection: 50000 }, null), B, uplift: 1.21, salary: 4000, n: 1 });
  assert.equal(r.verdict.tone, 'bad');
  assert.match(sp(r.verdict.text), /60 000 MAD/);
});
check('two hires double the cost', () => {
  const r = hire({ q: 'x', L: 'fr', K: K(be, null), B, uplift: 1.21, salary: 4000, n: 2 });
  assert.match(flat(r), /9 600 MAD par mois/);
});
check('no salary given: the team’s real average, said so', () => {
  const staff = { base: 15000, total: 18000, salaried: 3, members: 4 };
  const r = hire({ q: 'can i afford a new employee', L: 'en', K: K(be, staff), B, uplift: 1.21, salary: null, n: 1 });
  assert.match(flat(r), /5 000 MAD net/);
  assert.match(sp(r.note), /average of your 3 salaried staff/);
});
check('no salary and no team: asks, invents nothing', () => {
  const r = hire({ q: 'x', L: 'ar', K: null, B, uplift: 1.21, salary: null, n: 1 });
  assert.match(sp(r.text), /كم الأجر الصافي/);
  assert.ok(!r.verdict);
});
check('no charges: share of sales, no yes or no', () => {
  const r = hire({ q: 'x', L: 'fr', K: null, B, uplift: 1.21, salary: 3000, n: 1 });
  assert.match(flat(r), /3 630 MAD/);
  assert.match(flat(r), /4 % de vos ventes/);
  assert.equal(r.verdict.tone, 'warn');
  assert.match(sp(r.verdict.text), /Charges fixes/);
});
console.log(`✓ agent-hire-real · ${n} cas : salaire réel, charges de Marges, rien d’inventé`);
