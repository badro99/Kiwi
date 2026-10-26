/* Kiwi · staff credential publication left POST /api/config.
 * functions/api/_staff-publication.js now holds the one path that turns a
 * staff code list into till codes, the employee-login roster and the auth
 * revisions. This proves it was moved, not rewritten: rebuilding the original
 * config.js from today's route and module gives the frozen copy byte for byte,
 * the module exports only its contract, and the route reaches staff codes
 * through that one call. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';

const read = (f) => fs.readFileSync(f, 'utf8');
const original = gunzipSync(fs.readFileSync('tools/fixtures/staff-publication/config.original.js.gz')).toString();
const route = read('functions/api/config.js'), mod = read('functions/api/_staff-publication.js');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

/* The function body, moved two spaces left, with `result` its own local. */
const head = 'export async function publishStaffCredentials(env, merchant, body) {\n  const result = {};\n';
const tail = '\n  return result;\n}\n';
const fnAt = mod.indexOf(head);
ok(fnAt > 0 && mod.endsWith(tail), 'module has one exported publish function');
const inner = mod.slice(fnAt + head.length, mod.length - tail.length);
const helpers = mod.slice(mod.indexOf('const VALID_PIN'), mod.indexOf('\n}\n', mod.indexOf('function accountOwnerRole(')) + 3);

const call = "  if (Array.isArray(body && body.pins)) {\n    const published = await publishStaffCredentials(env, merchant, body);\n"
  + "    if (published instanceof Response) return published;\n    Object.assign(result, published);\n  }";
ok(route.split(call).length === 2, 'the route publishes staff codes through exactly one call');
let rebuilt = route.replace(call, () => '  if (Array.isArray(body && body.pins)) {\n'
  + inner.split('\n').map((l) => (l ? '  ' + l : l)).join('\n') + '\n  }');
rebuilt = rebuilt.replace("import { publishStaffCredentials, accountOwnerRole } from './_staff-publication.js';\n",
  "import { authFingerprint, authSentinel, planEmployeeAuth, writeEmployeeAuth, authMoved } from './_employee-auth.js';\n\n" + helpers);
rebuilt = rebuilt.replace('  json, activeAccountSession, slugMerchant, accountSlug, isOperator, isTillFor,',
  '  json, activeAccountSession, slugMerchant, accountSlug, teamRemovedIds, isOperator, isTillFor,');
ok(rebuilt === original, 'route + module rebuild the original config.js byte for byte');

/* Contract: the module exports the publish function and the owner-role test, nothing else. */
const exported = [...mod.matchAll(/^export (?:async )?(?:function|const) (\w+)|^export \{ ([^}]+) \}/gm)].map((m) => (m[1] || m[2]).trim()).sort();
ok(JSON.stringify(exported) === JSON.stringify(['accountOwnerRole', 'publishStaffCredentials']), 'module exports only its contract: ' + exported.join(', '));
const teamUses = [...mod.matchAll(/teamRow(?:\.\w+)?/g)].map((m) => m[0]).sort().join(',');
ok((mod.match(/feature = 'team'/g) || []).length === 1 && teamUses === 'teamRow,teamRow,teamRow.data,teamRow.data'
  && /removedIds = teamRemovedIds\(JSON\.parse\(teamRow\.data\)\)/.test(mod), 'the team document is read once, for its tombstones only: ' + teamUses);
ok(!/teamRemovedIds|_employee-auth|planEmployeeAuth|staff_pins \(id/.test(route), 'the route no longer writes staff codes or auth revisions itself');
console.log(`✓ staff publication split: ${n} checks (byte-exact rebuild of config.js, one call site, exported contract, route no longer writes codes)`);
