#!/usr/bin/env node
/* Console opérateur · les trois routes à code nommé, au niveau du handler.
 *
 * functions/api/admin/reset.js, pins.js et operators.js tournent sur le vrai
 * schéma (SQLite mémoire, tools/server-money-fixture.mjs), avec de vraies
 * requêtes et de vrais cookies signés :
 *   · reset : le délai de réexpédition (RESEND_MS) dans les deux sens, un seul
 *     lien vivant à la fois, rien ne part sans canal courriel (et aucun jeton
 *     n'est créé), l'adresse est celle du compte et jamais celle de la requête,
 *     le lien n'est ni dans la réponse ni au journal, un envoi raté retire le jeton ;
 *   · pins et operators : sans code nommé vivant (aucun cookie, session
 *     commerçant, code retiré depuis) lecture et écriture sont refusées et rien
 *     n'est écrit ; ni code ni empreinte ne ressortent d'une lecture ;
 *   · operators : le dernier code ne part pas, même par deux retraits à la fois.
 * Les codes de ce banc sont fictifs. */
import { fixture } from './server-money-fixture.mjs';
import { operatorToken, operatorIdToken, makeSession, SESS_COOKIE } from '../functions/auth/_lib.js';
import { onRequestGet as resetGet, onRequestPost as resetPost } from '../functions/api/admin/reset.js';
import { onRequestGet as pinsGet, onRequestPost as pinsPost, onRequestDelete as pinsDelete } from '../functions/api/admin/pins.js';
import { onRequestGet as opsGet, onRequestPost as opsPost, onRequestDelete as opsDelete } from '../functions/api/admin/operators.js';

const ROOT = new URL('..', import.meta.url).pathname;
let passed = 0; const failures = [];
function ok(label, cond, detail = '') {
  if (cond) { passed++; console.log('  ✓ ' + label); }
  else { failures.push(label); console.log('  ✗ ' + label + (detail ? ' · ' + detail : '')); }
}
const req = (url, { method = 'POST', cookie = '', body, raw } = {}) => new Request('https://kiwi.test' + url, {
  method,
  headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  ...(raw !== undefined ? { body: raw } : body === undefined ? {} : { body: JSON.stringify(body) }),
});
const RESEND_MS = 5 * 60 * 1000;
const rest = async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) });

/* Les mails que la route envoie, capturés au niveau du webhook. */
const realFetch = globalThis.fetch;
let mails = [], mailAnswer = { ok: true, status: 200 };
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://mail.test/')) { mails.push(JSON.parse(init.body)); return mailAnswer; }
  return realFetch(url, init);
};

async function bench() {
  const f = await fixture(ROOT);
  f.env.MAIL_WEBHOOK = 'https://mail.test/hook';
  const secret = f.env.AUTH_SECRET;
  const cookies = {
    op: `kiwi_op=${await operatorToken(secret)}; kiwi_op_id=${await operatorIdToken(secret, 'money-operator')}`,
    // un code signé pour un opérateur qui n'existe (plus) pas dans la table
    revoked: `kiwi_op=${await operatorToken(secret)}; kiwi_op_id=${await operatorIdToken(secret, 'op-retired')}`,
    // le cookie commun sans identité signée
    anonymousOp: `kiwi_op=${await operatorToken(secret)}`,
    // la session d'un commerçant, pas d'un opérateur
    owner: `${SESS_COOKIE}=${await makeSession('money-owner', secret)}`,
  };
  f.sql.prepare("INSERT INTO accounts(id,email,name,business,salt,hash,created_ts,status) VALUES('acc-client','Client.Shop@example.test','Client','Boutique Test','s','h',?,'active')").run(Date.now());
  return { f, cookies };
}
const liveTokens = (f, id = 'acc-client') => f.sql.prepare('SELECT COUNT(*) AS n FROM reset_tokens WHERE account_id = ? AND used_ts IS NULL AND expires_ts > ?').get(id, Date.now()).n;
const allTokens = (f, id = 'acc-client') => f.sql.prepare('SELECT COUNT(*) AS n FROM reset_tokens WHERE account_id = ?').get(id).n;

/* ── reset.js ──────────────────────────────────────────────────────────── */
console.log('\nreset · qui peut, et ce que la route révèle');
{
  const { f, cookies } = await bench();
  const post = (cookie, body) => resetPost({ request: req('/api/admin/reset', { cookie, body }), env: f.env });
  for (const [label, cookie] of [['sans cookie', ''], ['avec une session commerçant', cookies.owner], ['avec un code retiré depuis', cookies.revoked], ['avec le cookie commun sans identité', cookies.anonymousOp]]) {
    const w = await rest(await post(cookie, { accountId: 'acc-client' }));
    const r = await rest(await resetGet({ request: req('/api/admin/reset?accountId=acc-client', { method: 'GET', cookie }), env: f.env }));
    ok(`${label} : lecture et envoi refusés (403), rien de créé`, w.status === 403 && r.status === 403 && allTokens(f) === 0 && mails.length === 0, `${w.status}/${r.status}`);
  }
  ok('sans base : refus fermé (403), même pour un opérateur', (await rest(await resetPost({ request: req('/api/admin/reset', { cookie: cookies.op, body: { accountId: 'acc-client' } }), env: { ...f.env, DB: undefined } }))).status === 403);

  const get = async () => rest(await resetGet({ request: req('/api/admin/reset?accountId=acc-client', { method: 'GET', cookie: cookies.op }), env: f.env }));
  ok('GET sans accountId : 400 account-required', (await rest(await resetGet({ request: req('/api/admin/reset', { method: 'GET', cookie: cookies.op }), env: f.env }))).body.error === 'account-required');
  const fresh = await get();
  ok('état d’un compte jamais relancé : envoi possible, rien de vivant, canal courriel signalé', fresh.status === 200 && fresh.body.canSend === true && fresh.body.lastSent === 0 && fresh.body.live === false && fresh.body.retryAfter === 0 && fresh.body.mail === true);
  ok('sans MAIL_WEBHOOK l’état le dit', (await rest(await resetGet({ request: req('/api/admin/reset?accountId=acc-client', { method: 'GET', cookie: cookies.op }), env: { ...f.env, MAIL_WEBHOOK: '' } }))).body.mail === false);

  ok('corps illisible : 400 bad-json', (await rest(await resetPost({ request: req('/api/admin/reset', { cookie: cookies.op, raw: '{nope' }), env: f.env }))).body.error === 'bad-json');
  ok('sans accountId : 400 account-required', (await rest(await post(cookies.op, {}))).body.error === 'account-required');
  const unknown = await rest(await post(cookies.op, { accountId: 'acc-unknown' }));
  ok('compte inconnu : 404 not-found, rien de créé', unknown.status === 404 && allTokens(f, 'acc-unknown') === 0);
  f.sql.prepare("INSERT INTO accounts(id,email,name,business,salt,hash,created_ts,status) VALUES('acc-blank','','Sans adresse','','s','h',?,'active')").run(Date.now());
  ok('compte sans adresse : 409 no-email', (await rest(await post(cookies.op, { accountId: 'acc-blank' }))).status === 409);

  // Sans canal courriel : on explique, on ne touche à rien.
  f.sql.prepare("INSERT INTO reset_tokens(selector,account_id,verifier,created_ts,expires_ts,used_ts,actor,actor_id) VALUES('sel-old','acc-client','v',?,?,NULL,'client','')").run(Date.now() - 20 * 60e3, Date.now() + 40 * 60e3);
  const noMail = await rest(await resetPost({ request: req('/api/admin/reset', { cookie: cookies.op, body: { accountId: 'acc-client' } }), env: { ...f.env, MAIL_WEBHOOK: '' } }));
  ok('sans canal courriel : 503 mail-unconfigured, adresse masquée', noMail.status === 503 && noMail.body.error === 'mail-unconfigured' && !JSON.stringify(noMail.body).includes('Client.Shop'), JSON.stringify(noMail.body));
  ok('et le lien vivant d’avant n’est pas touché, aucun jeton de plus', liveTokens(f) === 1 && allTokens(f) === 1 && f.sql.prepare("SELECT used_ts FROM reset_tokens WHERE selector='sel-old'").get().used_ts === null && mails.length === 0);

  // Le délai, dans les deux sens, autour de RESEND_MS (marge de 2 s pour l’horloge du test).
  f.sql.prepare("UPDATE reset_tokens SET created_ts = ? WHERE selector = 'sel-old'").run(Date.now() - RESEND_MS + 2000);
  const early = await rest(await post(cookies.op, { accountId: 'acc-client' }));
  ok('2 s avant la fin du délai : 429 too-soon avec le temps restant', early.status === 429 && early.body.error === 'too-soon' && early.body.canSend === false && early.body.retryAfter >= 1 && early.body.retryAfter <= 3 && early.body.nextAllowed > Date.now(), JSON.stringify(early.body));
  ok('refusé : aucun mail, le lien vivant reste valable', mails.length === 0 && liveTokens(f) === 1 && allTokens(f) === 1);
  const state = await get();
  ok('GET donne la même réponse que le refus (dernier envoi, prochain autorisé, vivant)', state.body.canSend === false && state.body.live === true && state.body.nextAllowed === early.body.nextAllowed && state.body.lastSent === early.body.lastSent);

  f.sql.prepare("UPDATE reset_tokens SET created_ts = ? WHERE selector = 'sel-old'").run(Date.now() - RESEND_MS - 2000);
  const sent = await rest(await post(cookies.op, { accountId: 'acc-client', merchant: 'boutique-test', to: 'attacker@example.test', link: 'https://evil.test/' }));
  ok('2 s après le délai : l’envoi part (200)', sent.status === 200 && sent.body.ok === true && mails.length === 1, JSON.stringify(sent.body));
  ok('le message part à l’adresse du COMPTE, jamais à celle de la requête', mails[0].to === 'client.shop@example.test' && !JSON.stringify(mails).includes('attacker'), mails[0] && mails[0].to);
  ok('le lien est dans le mail et pas dans la réponse', /\/reset\.html\?token=/.test(mails[0].text) && !/token|reset\.html|https?:\/\//.test(JSON.stringify(sent.body)), JSON.stringify(sent.body));
  ok('la réponse masque l’adresse et donne le prochain envoi possible', sent.body.to !== 'client.shop@example.test' && sent.body.to.endsWith('@example.test') && Math.abs(sent.body.nextAllowed - (Date.now() + RESEND_MS)) < 5000 && sent.body.journal === true);
  ok('un seul lien vivant : l’ancien est périmé, le nouveau porte le nom de l’opérateur', liveTokens(f) === 1 && f.sql.prepare("SELECT used_ts FROM reset_tokens WHERE selector='sel-old'").get().used_ts > 0 && f.sql.prepare("SELECT actor_id FROM reset_tokens WHERE selector <> 'sel-old'").get().actor_id === 'money-operator');
  const audit = f.sql.prepare("SELECT * FROM account_audit WHERE action = 'reset'").all();
  const token = mails[0].text.match(/token=([^\s]+)/)[1];
  ok('le journal : qui, à quelle adresse masquée, envoyé, expiration, jamais le lien ni le jeton', audit.length === 1 && audit[0].actor_id === 'money-operator' && audit[0].merchant === 'boutique-test' && JSON.parse(audit[0].detail).delivery === 'sent' && !JSON.stringify(audit).includes(token) && !JSON.stringify(audit).includes(decodeURIComponent(token).split('.')[0]) && !JSON.stringify(audit).includes('Client.Shop'));
  const again = await rest(await post(cookies.op, { accountId: 'acc-client' }));
  ok('dans la foulée : 429 (le client n’est pas enfermé dehors par un reclic)', again.status === 429 && mails.length === 1 && liveTokens(f) === 1);

  // Un envoi raté : le jeton neuf est retiré, l’opérateur peut réessayer tout de suite.
  f.sql.prepare('UPDATE reset_tokens SET created_ts = created_ts - ?').run(RESEND_MS + 5000);
  mailAnswer = { ok: false, status: 500 }; mails = [];
  const before = allTokens(f);
  const failed = await rest(await post(cookies.op, { accountId: 'acc-client' }));
  ok('webhook en panne : 502 send-failed avec la raison', failed.status === 502 && failed.body.error === 'send-failed' && failed.body.reason === 'http-500', JSON.stringify(failed.body));
  ok('le jeton fabriqué pour rien est retiré, plus aucun lien vivant', allTokens(f) === before && liveTokens(f) === 0);
  const failAudit = f.sql.prepare("SELECT detail FROM account_audit WHERE action = 'reset' ORDER BY ts DESC, rowid DESC").get();
  ok('l’échec est au journal', JSON.parse(failAudit.detail).delivery === 'failed:http-500');
  const retry = await get();
  mailAnswer = { ok: true, status: 200 };
  ok('après l’échec, l’opérateur peut renvoyer sans attendre cinq minutes', retry.body.canSend === true && (await rest(await post(cookies.op, { accountId: 'acc-client' }))).status === 200 && mails.length === 2);
  f.close();
}

/* ── pins.js ───────────────────────────────────────────────────────────── */
console.log('\npins · codes d’équipe, accès et refus');
{
  const { f, cookies } = await bench();
  const pins = (cookie, body) => pinsPost({ request: req('/api/admin/pins', { cookie, body }), env: f.env });
  const count = () => f.sql.prepare('SELECT COUNT(*) AS n FROM staff_pins').get().n;
  const auditCount = () => f.sql.prepare("SELECT COUNT(*) AS n FROM account_audit WHERE action LIKE 'staff-pin-%'").get().n;
  const payload = { merchant: f.merchant, pin: '4821', name: 'Salarié', role: 'caisse' };
  for (const [label, cookie] of [['sans cookie', ''], ['session commerçant', cookies.owner], ['code retiré', cookies.revoked], ['cookie commun sans identité', cookies.anonymousOp]]) {
    const add = await rest(await pins(cookie, payload));
    const list = await rest(await pinsGet({ request: req('/api/admin/pins?merchant=' + f.merchant, { method: 'GET', cookie }), env: f.env }));
    ok(`${label} : liste et ajout refusés (403), rien d’écrit`, add.status === 403 && list.status === 403 && count() === 0 && auditCount() === 0, `${add.status}/${list.status}`);
  }
  ok('sans base : refus fermé (403), la console ne s’ouvre pas sans journal', (await rest(await pinsPost({ request: req('/api/admin/pins', { cookie: cookies.op, body: payload }), env: { ...f.env, DB: undefined } }))).status === 403);

  ok('corps illisible : 400 bad-json', (await rest(await pinsPost({ request: req('/api/admin/pins', { cookie: cookies.op, raw: 'x' }), env: f.env }))).body.error === 'bad-json');
  ok('sans établissement : 400 merchant-required', (await rest(await pins(cookies.op, { ...payload, merchant: '' }))).body.error === 'merchant-required');
  for (const bad of ['', '12', '12345', 'abcd', '12 4', '١٢٣٤']) {
    ok(`code « ${bad} » : 400 bad-pin, rien d’écrit`, (await rest(await pins(cookies.op, { ...payload, pin: bad }))).body.error === 'bad-pin' && count() === 0);
  }
  const made = await rest(await pins(cookies.op, { ...payload, role: '' }));
  ok('ajout : 200, rôle par défaut « serveur », réponse sans le code', made.status === 200 && made.body.pin.role === 'serveur' && !JSON.stringify(made.body).includes('4821'), JSON.stringify(made.body));
  const listed = await rest(await pinsGet({ request: req('/api/admin/pins?merchant=' + f.merchant, { method: 'GET', cookie: cookies.op }), env: f.env }));
  ok('liste : id, nom, rôle, jamais le code', listed.body.pins.length === 1 && Object.keys(listed.body.pins[0]).sort().join() === 'id,name,role' && !JSON.stringify(listed.body).includes('4821'));
  ok('liste d’un autre établissement : vide', (await rest(await pinsGet({ request: req('/api/admin/pins?merchant=server-other-shop', { method: 'GET', cookie: cookies.op }), env: f.env }))).body.pins.length === 0);
  ok('liste sans établissement : 400', (await rest(await pinsGet({ request: req('/api/admin/pins', { method: 'GET', cookie: cookies.op }), env: f.env }))).status === 400);

  const id = made.body.pin.id;
  const del = (cookie, { query = '', body } = {}) => pinsDelete({ request: req('/api/admin/pins' + query, { method: 'DELETE', cookie, body }), env: f.env });
  ok('retrait sans id : 400 id-required', (await rest(await del(cookies.op))).body.error === 'id-required');
  for (const [label, cookie] of [['sans cookie', ''], ['session commerçant', cookies.owner], ['code retiré', cookies.revoked]]) {
    ok(`retrait ${label} : 403, la ligne reste`, (await del(cookie, { query: '?id=' + id })).status === 403 && count() === 1);
  }
  const traces = auditCount();
  ok('id inconnu : 200 mais ni suppression ni trace', (await del(cookies.op, { query: '?id=pin-unknown' })).status === 200 && count() === 1 && auditCount() === traces);
  ok('retrait par corps JSON : la ligne part', (await del(cookies.op, { body: { id } })).status === 200 && count() === 0);
  const gone = f.sql.prepare("SELECT * FROM account_audit WHERE action = 'staff-pin-delete'").all();
  ok('la trace du retrait nomme l’opérateur et la personne, jamais le code', gone.length === 1 && gone[0].actor_id === 'money-operator' && gone[0].prev === 'Salarié' && !JSON.stringify(f.sql.prepare('SELECT * FROM account_audit').all()).includes('4821'));
  f.close();
}

/* ── operators.js ──────────────────────────────────────────────────────── */
console.log('\noperators · codes opérateur, accès et refus');
{
  const { f, cookies } = await bench();
  const ops = (cookie, body, raw) => opsPost({ request: req('/api/admin/operators', { cookie, body, raw }), env: f.env });
  const count = () => f.sql.prepare('SELECT COUNT(*) AS n FROM operators').get().n;
  const code = 'synthetic-operator-code-77';
  for (const [label, cookie] of [['sans cookie', ''], ['session commerçant', cookies.owner], ['code retiré', cookies.revoked], ['cookie commun sans identité', cookies.anonymousOp]]) {
    const add = await rest(await ops(cookie, { label: 'Intrus', code }));
    const list = await rest(await opsGet({ request: req('/api/admin/operators', { method: 'GET', cookie }), env: f.env }));
    const del = await rest(await opsDelete({ request: req('/api/admin/operators?id=money-operator', { method: 'DELETE', cookie }), env: f.env }));
    ok(`${label} : liste, création et retrait refusés (403), rien d’écrit`, add.status === 403 && list.status === 403 && del.status === 403 && count() === 1 && f.sql.prepare("SELECT COUNT(*) AS n FROM account_audit WHERE action LIKE 'operator-%'").get().n === 0, `${add.status}/${list.status}/${del.status}`);
  }
  ok('sans base : refus fermé (403), la console ne s’ouvre pas sans journal', (await rest(await opsGet({ request: req('/api/admin/operators', { method: 'GET', cookie: cookies.op }), env: { ...f.env, DB: undefined } }))).status === 403);

  const listed = await rest(await opsGet({ request: req('/api/admin/operators', { method: 'GET', cookie: cookies.op }), env: f.env }));
  ok('liste : id, libellé, date, jamais d’empreinte ni de sel', listed.status === 200 && listed.body.operators.length === 1 && Object.keys(listed.body.operators[0]).sort().join() === 'created_ts,id,label');

  ok('corps illisible : 400 bad-json', (await rest(await ops(cookies.op, undefined, '{x'))).body.error === 'bad-json');
  ok('code de 9 caractères : 400 code-too-short', (await rest(await ops(cookies.op, { label: 'X', code: '123456789' }))).body.error === 'code-too-short' && count() === 1);
  ok('code démesuré : 400 code-too-long', (await rest(await ops(cookies.op, { label: 'X', code: 'a'.repeat(5000) }))).body.error === 'code-too-long' && count() === 1);
  const made = await rest(await ops(cookies.op, { label: '  Partenaire avec un libellé beaucoup trop long pour tenir dans la colonne  ', code }));
  ok('création : 200, libellé rogné à 40, ni code ni empreinte dans la réponse', made.status === 200 && made.body.operator.label.length <= 40 && !JSON.stringify(made.body).includes(code) && count() === 2);
  const stored = f.sql.prepare('SELECT * FROM operators WHERE id = ?').get(made.body.operator.id);
  ok('le code est stocké en empreinte salée, jamais en clair', stored.hash !== code && stored.salt.length > 8 && !JSON.stringify(stored).includes(code));
  // Le nouveau code ouvre la console (cookie signé pour son id) ; une fois retiré, il ne l'ouvre plus.
  const newOp = `kiwi_op=${await operatorToken(f.env.AUTH_SECRET)}; kiwi_op_id=${await operatorIdToken(f.env.AUTH_SECRET, made.body.operator.id)}`;
  ok('le nouveau code nommé est opérateur', (await opsGet({ request: req('/api/admin/operators', { method: 'GET', cookie: newOp }), env: f.env })).status === 200);

  ok('retrait sans id : 400 id-required', (await rest(await opsDelete({ request: req('/api/admin/operators', { method: 'DELETE', cookie: cookies.op }), env: f.env }))).body.error === 'id-required');
  ok('id inconnu : 200 sans trace ni suppression', (await opsDelete({ request: req('/api/admin/operators?id=op-unknown', { method: 'DELETE', cookie: cookies.op }), env: f.env })).status === 200 && count() === 2 && f.sql.prepare("SELECT COUNT(*) AS n FROM account_audit WHERE action = 'operator-delete'").get().n === 0);

  // Deux retraits à la fois quand il en reste deux : au moins un code survit.
  const both = await Promise.all(['money-operator', made.body.operator.id].map((id) => opsDelete({ request: req('/api/admin/operators?id=' + id, { method: 'DELETE', cookie: cookies.op }), env: f.env }).then((r) => r.status)));
  ok('deux retraits simultanés ne vident pas la table', count() === 1 && both.includes(409), both.join() + ' / ' + count());
  const deleted = f.sql.prepare("SELECT COUNT(*) AS n FROM account_audit WHERE action = 'operator-delete'").get().n;
  ok('un seul retrait est au journal', deleted === 1, String(deleted));
  // Le code retiré ne passe plus la garde tout de suite, sans attendre l'expiration du cookie.
  const survivorIsNew = !!f.sql.prepare('SELECT 1 FROM operators WHERE id = ?').get(made.body.operator.id);
  const removedCookie = survivorIsNew ? cookies.op : newOp;
  ok('le code retiré est refusé aussitôt (403), cookie encore valide', (await opsGet({ request: req('/api/admin/operators', { method: 'GET', cookie: removedCookie }), env: f.env })).status === 403);
  f.close();
}

globalThis.fetch = realFetch;
console.log(`\nadmin-console-handlers: ${passed} vérifications, ${failures.length} échec(s)`);
if (failures.length) { console.log(failures.map((x) => ' - ' + x).join('\n')); process.exit(1); }
