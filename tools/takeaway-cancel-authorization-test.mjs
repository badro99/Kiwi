#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../kiwi-caisse.html', import.meta.url), 'utf8');
const start = source.indexOf('function cancelOrderProTakeaway(o, authorizedWho = null)');
const end = source.indexOf('function settleVrapPayment()', start);
assert.ok(start >= 0 && end > start, 'the guarded cancellation function is present');
const fn = source.slice(start, end);

assert.ok(!source.includes('vrapCancellingAuthorized'),
  'no ambient authorization flag remains in the caisse');
assert.match(source, /cancelOrderProTakeaway\(editingOrder,\s*who\)/,
  'the already-authorized cart path passes the operator identity directly');
assert.match(fn, /if \(authorizedWho\) \{ proceed\(authorizedWho\); return true; \}/,
  'an explicit authorization executes without opening a second PIN prompt');
assert.match(fn, /requireTillOperator\(`Annuler la commande \$\{label\}`, proceed\)/,
  'an unauthenticated board click still opens the operator gate');
assert.ok(fn.indexOf('const proceed =') < fn.indexOf('dismissExpired(')
  && fn.indexOf('dismissExpired(') < fn.indexOf("opPush(o, 'rejected'"),
  'all destructive work remains inside the approved callback');

console.log('✓ takeaway cancellation authorization — 6 controls green');
