#!/usr/bin/env node
/* Kiwi · admin-pin-change-test · la console voit et change le code d'un salarié.
 *
 * Owner, 24 November 2026 (console, CHICTRATEC SL › Configuration › PINs du
 * personnel): « we should be able to see and change pins for employees ».
 * Choice made the same day: change on every employee row; show a code only
 * where the Team page holds it (the encrypted team document, which named
 * operators may already read). A code typed in the console lives only as a
 * one-way hash in staff_pins and cannot be shown; it can be replaced.
 *
 * Holds, against the real routes and an in-memory D1 built from schema.sql:
 *   reveal · GET /api/admin/pins?reveal=1 gives a named operator the code of a
 *            Team member's row, never an owner's, never a console-only row's;
 *            without reveal=1 no code leaves; a plain operator cookie gets 403;
 *            the journal says how many were shown, never which digits;
 *   change · PATCH /api/admin/pins {merchant,id,pin}
 *            - a Team member: the till opens on the new code and not the old,
 *              the team document carries it (so the next Team save keeps it),
 *              the employee app logs in with it;
 *            - a console-only row: the till opens on the new code;
 *            - a code another person holds: 409, nothing moves;
 *            - an owner row: 403 (owner codes keep their own door);
 *            - a bad code: 400; no named operator: 403;
 *            - the journal names the person, never the code.
 *   node tools/admin-pin-change-test.mjs
 */
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { codeDocument, matchingStaffCodes } from '../functions/auth/_staff-codes.js';
import { publishStaffCredentials } from '../functions/api/_staff-publication.js';
import { onRequestGet as list, onRequestPatch as change } from '../functions/api/admin/pins.js';
import { operatorToken, operatorIdToken, findEmployeeCredential } from '../functions/auth/_lib.js';

const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const merchant = 'pin-change-fixture';
const A = String(1000 + 357), B = String(2000 + 468), N = String(3000 + 579), O = String(4000 + 680), X = String(5000 + 791);
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail !== undefined ? ' · ' + JSON.stringify(detail) : '')); } };

async function fixture() {
  const db = new DatabaseSync(':memory:'); db.exec(schema);
  const DB = { prepare(sql) {
    const st = db.prepare(sql), bind = (args) => ({ first: async () => st.get(...args) || null, all: async () => ({ results: st.all(...args) }), run: async () => ({ meta: { changes: st.run(...args).changes } }) });
    return { ...bind([]), bind: (...args) => bind(args) };
  }, async batch(stmts) { db.exec('BEGIN'); try { const out = []; for (const st of stmts) out.push(await st.run()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
  const env = { DB, AUTH_SECRET: 'pin-change-auth-fixture', PIN_PEPPER: 'pin-change-pepper-fixture' };
  db.exec("INSERT INTO accounts (id,email,business,salt,hash,created_ts) VALUES ('a','owner@fixture.test','Fixture','s','h',1)");
  db.exec("INSERT INTO operators (id,label,salt,hash,created_ts) VALUES ('op','Fixture','s','h',1)");
  db.prepare("INSERT INTO merchant_config (merchant,account_id,plan,features,updated_ts) VALUES (?,'a','pro','{}',1)").run(merchant);
  const named = 'kiwi_op=' + await operatorToken(env.AUTH_SECRET) + '; kiwi_op_id=' + await operatorIdToken(env.AUTH_SECRET, 'op');
  const plain = 'kiwi_op=' + await operatorToken(env.AUTH_SECRET);
  /* The Team page's document: Amal (code A) and Badr (code B), both with an
     e-mail for the employee app, then published the way the Team page does. */
  const members = [
    { id: 'm-amal', firstName: 'Amal', lastName: '', email: 'amal@fixture.test', function: 'Vendeur', pinCode: A, password: A },
    { id: 'm-badr', firstName: 'Badr', lastName: '', email: 'badr@fixture.test', function: 'Vendeur', pinCode: B, password: B },
  ];
  const team = await codeDocument(env, merchant, 'team', { members }, true);
  db.prepare("INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,1,?)").run(merchant, 'team', JSON.stringify(team), Date.now() - 60000);
  const pub = await publishStaffCredentials(env, merchant, { pins: members.map((m) => ({ memberId: m.id, code: m.pinCode, name: m.firstName, firstName: m.firstName, lastName: '', email: m.email, role: m.function })) });
  if (pub instanceof Response) throw new Error('fixture publish failed ' + await pub.text());
  /* An owner row and a row typed in the console (no Team member). */
  const { hashStaffCode } = await import('../functions/auth/_staff-codes.js');
  db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,?)').run('pin-owner', merchant, await hashStaffCode(env, merchant, O), 'Patron', 'Propriétaire', 5);
  db.prepare('INSERT INTO staff_pins VALUES (?,?,?,?,?,?)').run('pin-console', merchant, await hashStaffCode(env, merchant, X), 'Console', 'Vendeur', 6);
  const req = (method, cookie, qs, body) => new Request('https://fixture.test/api/admin/pins' + (qs || ''), {
    method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.7' }, body: body ? JSON.stringify(body) : undefined });
  const rows = () => db.prepare('SELECT id, name, role FROM staff_pins WHERE merchant = ? ORDER BY created_ts').all(merchant);
  const audits = () => db.prepare('SELECT action, prev, next, detail FROM account_audit WHERE merchant = ?').all(merchant);
  return { db, env, named, plain, req, rows, audits };
}

const f = await fixture();
const idOf = (name) => (f.rows().find((r) => r.name === name) || {}).id;
const holders = async (code) => (await matchingStaffCodes(f.env, merchant, code)).map((r) => r.name).sort();

console.log('■ voir');
let res = await list({ env: f.env, request: f.req('GET', f.named, '?merchant=' + merchant) });
let body = await res.json();
ok(res.status === 200 && body.pins.length === 4 && body.pins.every((p) => !('code' in p)), 'sans reveal=1, aucun code ne sort', body.pins);
res = await list({ env: f.env, request: f.req('GET', f.plain, '?merchant=' + merchant + '&reveal=1') });
ok(res.status === 403, 'reveal=1 sans opérateur nommé : 403', res.status);
res = await list({ env: f.env, request: f.req('GET', f.named, '?merchant=' + merchant + '&reveal=1') });
body = await res.json();
const by = (name) => body.pins.find((p) => p.name === name) || {};
ok(by('Amal').code === A && by('Badr').code === B, 'reveal=1 : le code des membres de l’équipe');
ok(!by('Patron').code && !by('Console').code, 'jamais le code du propriétaire ni d’une ligne saisie en console', [by('Patron'), by('Console')]);
ok(by('Console').hidden === 'console' && by('Patron').hidden === 'owner', 'la raison est dite (console / propriétaire)', [by('Console').hidden, by('Patron').hidden]);
const revealAudit = f.audits().filter((a) => a.action === 'staff-pin-reveal');
ok(revealAudit.length === 1 && !JSON.stringify(revealAudit).includes(A) && JSON.parse(revealAudit[0].detail).shown === 2, 'le journal compte les codes montrés, sans les chiffres', revealAudit);

console.log('■ changer · membre de l’équipe');
res = await change({ env: f.env, request: f.req('PATCH', f.named, '', { merchant, id: idOf('Amal'), pin: N }) });
body = await res.json();
ok(res.status === 200 && body.ok && body.team === true, 'le changement passe par l’équipe', body);
ok((await holders(N)).join() === 'Amal', 'la caisse ouvre Amal sur le nouveau code', await holders(N));
ok((await holders(A)).length === 0, 'l’ancien code n’ouvre plus rien');
ok((await holders(B)).join() === 'Badr', 'Badr garde son code');
const teamRow = f.db.prepare("SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = 'team'").get(merchant);
const teamNow = await codeDocument(f.env, merchant, 'team', JSON.parse(teamRow.data));
const amal = teamNow.members.find((m) => m.id === 'm-amal');
ok(amal.pinCode === N && teamRow.rev === 2, 'le document de l’équipe porte le nouveau code (rev 2)', { rev: teamRow.rev });
ok(!teamRow.data.includes(N), 'le document reste chiffré au repos');
ok(!!(await findEmployeeCredential(f.env, 'amal@fixture.test', N)), 'l’app employé accepte le nouveau code');
ok(!(await findEmployeeCredential(f.env, 'amal@fixture.test', A)), 'et refuse l’ancien');
const changeAudit = f.audits().filter((a) => a.action === 'staff-pin-change');
ok(f.rows().some((r) => r.id === 'pin-console') && f.rows().some((r) => r.id === 'pin-owner'), 'la republication garde la ligne console et le propriétaire', f.rows().map((r) => r.id));
ok(changeAudit.length === 1 && changeAudit[0].next === 'Amal' && !JSON.stringify(changeAudit).includes(N) && !JSON.stringify(changeAudit).includes(A), 'le journal nomme la personne, sans code', changeAudit);

console.log('■ changer · ligne saisie en console');
res = await change({ env: f.env, request: f.req('PATCH', f.named, '', { merchant, id: 'pin-console', pin: '6802' }) });
body = await res.json();
ok(res.status === 200 && body.team === false, 'la ligne console change seule', body);
ok((await holders('6802')).join() === 'Console' && (await holders(X)).length === 0, 'la caisse ouvre la ligne console sur le nouveau code, plus sur l’ancien');

console.log('■ refus');
const before = JSON.stringify(f.db.prepare('SELECT id, pin FROM staff_pins ORDER BY id').all());
res = await change({ env: f.env, request: f.req('PATCH', f.named, '', { merchant, id: idOf('Badr'), pin: N }) });
ok(res.status === 409 && (await res.json()).error === 'pin-exists', 'un code déjà pris : 409');
res = await change({ env: f.env, request: f.req('PATCH', f.named, '', { merchant, id: 'pin-owner', pin: '7913' }) });
ok(res.status === 403, 'une ligne propriétaire : 403', res.status);
res = await change({ env: f.env, request: f.req('PATCH', f.named, '', { merchant, id: idOf('Badr'), pin: '12a4' }) });
ok(res.status === 400, 'un code qui n’a pas quatre chiffres : 400', res.status);
res = await change({ env: f.env, request: f.req('PATCH', f.plain, '', { merchant, id: idOf('Badr'), pin: '7913' }) });
ok(res.status === 403, 'sans opérateur nommé : 403', res.status);
res = await change({ env: f.env, request: f.req('PATCH', f.named, '', { merchant, id: 'pin-nobody', pin: '7913' }) });
ok(res.status === 404, 'une ligne inconnue : 404', res.status);
ok(JSON.stringify(f.db.prepare('SELECT id, pin FROM staff_pins ORDER BY id').all()) === before, 'aucun refus ne touche aux codes');

console.log('■ keepRowIds ne vient jamais du corps d’une requête');
/* config.js et roster.js passent le corps reçu : une sauvegarde de l'équipe qui
   y glisserait keepRowIds garderait une ligne que la liste retire (un salarié
   parti garderait son code). Seule la console, par l'option à part, garde. */
const teamNow2 = await codeDocument(f.env, merchant, 'team', JSON.parse(f.db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'team'").get(merchant).data));
const roster = teamNow2.members.map((m) => ({ memberId: m.id, code: m.pinCode, name: m.firstName, firstName: m.firstName, lastName: '', email: m.email, role: m.function }));
const viaBody = await publishStaffCredentials(f.env, merchant, { pins: roster, keepRowIds: ['pin-console'] });
ok(!(viaBody instanceof Response) && !f.rows().some((r) => r.id === 'pin-console'), 'un corps avec keepRowIds ne garde pas la ligne', f.rows().map((r) => r.id));

console.log(bad ? `✗ ${bad} échec(s), ${n} contrôles passés` : `✓ console · voir et changer un code : ${n} contrôles`);
process.exitCode = bad ? 1 : 0;
