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

/* One deliberate change to the route since the move (9 Nov, session tiers): a
 * staff code list is refused below the manager tier, before anything is written.
 * The import and that guard are the only route text the rebuild sets aside;
 * session-tier-test runs the refusal. */
const tierImport = "import { sessionTierAtLeast } from '../auth/_session-tier.js';\n";
const tierGuard = "  /* Les codes de l'équipe ne changent pas depuis un tableau de bord qu'une\n"
  + "   * réceptionniste a déverrouillé (functions/auth/_session-tier.js) : sans ce\n"
  + "   * refus, elle se donnerait un code de patron. Refusé AVANT toute écriture. */\n"
  + "  if (Array.isArray(body && body.pins) && !(await sessionTierAtLeast(request, env, 'manager'))) {\n"
  + "    return json({ error: 'tier', need: 'manager' }, 403);\n  }\n";
ok(route.split(tierImport).length === 2 && route.split(tierGuard).length === 2, 'the tier refusal sits once in the route, with its import');
/* A second one (21 Nov, team permissions): below the owner tier, a code titled
 * like the owner is dropped from the list, so a manager cannot publish one for
 * herself. staff-permissions-test runs it against the real route. */
const ownerGuard = "  /* Un code à intitulé de propriétaire (« Propriétaire », « Direction »…) ouvre\n"
  + "   * le tableau de bord au palier du patron (faceAccessTier). Sous ce palier, une\n"
  + "   * session ne peut ni en créer, ni en renommer, ni en recoder un : ces lignes\n"
  + "   * de la liste sont ignorées, et celles déjà en base restent telles quelles\n"
  + "   * (_staff-publication.js garde les codes propriétaire d'une liste qui n'en a\n"
  + "   * pas). Sinon un gérant se donnerait le palier du patron. */\n"
  + "  if (Array.isArray(body && body.pins) && !(await sessionTierAtLeast(request, env, 'owner'))) {\n"
  + "    body.pins = body.pins.filter((p) => !(p && accountOwnerRole(String(p.role || '').trim().slice(0, 24))));\n  }\n";
/* Since 21 Nov the filtered rows are kept aside for codeHolds (an unchanged
 * owner row is ignored, a new or recoded one refused): one declaration before
 * the guard, one line inside it. */
const ownerKeep = "  let ownerTitled = [];   // les lignes écartées, que codeHolds juge : inchangées, ignorées ; neuves ou recodées, refusées (403)\n";
const ownerKeepLine = "    ownerTitled = body.pins.filter((p) => p && accountOwnerRole(String(p.role || '').trim().slice(0, 24)));\n";
const routeNow = route.replace(ownerKeep, '').replace(ownerKeepLine, '');
ok(route.split(ownerKeep).length === 2 && route.split(ownerKeepLine).length === 2 && routeNow.split(ownerGuard).length === 2, 'the owner-title filter sits once in the route, its rows kept for codeHolds');
/* A third (21 Nov, team permissions): a code that brings a new identity to
 * life outside the owner's session starts with no rights until the owner
 * reviews it (or is refused: a homonym of an owner-titled member, a hold that
 * cannot be written). One import, one line before the publish call, one after it;
 * staff-permissions-test runs it against the real route. */
const holdImport = "import { codeHolds } from './_permissions.js';\n";
const holdBefore = "    const holdCodes = await codeHolds(request, env, merchant, body, ownerTitled); if (holdCodes instanceof Response) return holdCodes; // hors du patron : homonyme d'un propriétaire refusé, identité nouvelle retenue AVANT publication, fermé en cas de doute (_permissions.js)\n";
const holdAfter = "    if (holdCodes) await holdCodes();\n";
ok(route.split(holdImport).length === 2 && route.split(holdBefore).length === 2 && route.split(holdAfter).length === 2, 'the code hold sits once in the route, with its import');
const routeBase = routeNow.replace(tierImport, '').replace(tierGuard, '').replace(ownerGuard, '').replace(holdImport, '').replace(holdBefore, '').replace(holdAfter, '');

/* The function body, moved two spaces left, with `result` its own local. */
const head = 'export async function publishStaffCredentials(env, merchant, body) {\n  const result = {};\n';
const tail = '\n  return result;\n}\n';
const fnAt = mod.indexOf(head);
ok(fnAt > 0 && mod.endsWith(tail), 'module has one exported publish function');
/* One deliberate change since the move (wave 11): a code shared by two people
 * is refused before anything is written, instead of the second one being
 * skipped silently. Those two lines are the only text the rebuild sets aside;
 * team-roster-cap-test runs the refusal. */
const sharedGuard = "  const sharedCode = sharedCodeHolders(body.pins);\n"
  + "  if (sharedCode.length) return json({ error: 'duplicate-staff-code', members: sharedCode }, 409);\n";
const moved = mod.slice(fnAt + head.length, mod.length - tail.length);
ok(moved.split(sharedGuard).length === 2, 'the shared-code refusal sits once in the publish function');
const inner = moved.replace(sharedGuard, '');
/* A deliberate change since the move (21 Nov): accountOwnerRole reads the one
 * shared table of owner titles (assets/permissions-catalog.js), so publish,
 * route filter and permission evaluator agree. The rebuild puts the old body
 * back; staff-permissions-test holds the agreement on a table of variants. */
const ownerRoleNow = "function accountOwnerRole(value) {\n  return Catalog.ownerTitle(value);   // une seule table des intitulés propriétaire : publication, filtre et droits (assets/permissions-catalog.js)\n}\n";
const ownerRoleThen = "function accountOwnerRole(value) {\n  let role = String(value || '').trim().toLowerCase();\n"
  + "  try { role = role.normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''); } catch (_) {}\n"
  + "  return new Set(['owner', 'proprietaire', 'direction', 'patron']).has(role);\n}\n";
ok(mod.split(ownerRoleNow).length === 2 && mod.startsWith("import Catalog from '../../assets/permissions-catalog.js';\n"), 'the owner-title test reads the shared catalog, once');
const helpers = mod.replace(ownerRoleNow, ownerRoleThen).slice(mod.replace(ownerRoleNow, ownerRoleThen).indexOf('const VALID_PIN'),
  mod.replace(ownerRoleNow, ownerRoleThen).indexOf('\n}\n', mod.replace(ownerRoleNow, ownerRoleThen).indexOf('function accountOwnerRole(')) + 3);

const call = "  if (Array.isArray(body && body.pins)) {\n    const published = await publishStaffCredentials(env, merchant, body);\n"
  + "    if (published instanceof Response) return published;\n    Object.assign(result, published);\n  }";
ok(routeBase.split(call).length === 2, 'the route publishes staff codes through exactly one call');
let rebuilt = routeBase.replace(call, () => '  if (Array.isArray(body && body.pins)) {\n'
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
