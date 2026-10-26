// tools/support-triage-retry-test.mjs
//
// Un tri automatique qui n'aboutit pas (modèle absent, quota, erreur, alerte
// refusée par le fournisseur de courriel) laisse une trace dans le fil interne
// de la demande, et un opérateur nommé peut le relancer depuis la console.
// Les vraies routes tournent : POST /api/support/tickets et PATCH
// /api/admin/support, sur le schéma réel (schema.sql) en SQLite mémoire, avec
// une vraie caisse appairée et un vrai cookie d'opérateur.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as auth from '../functions/auth/_lib.js';
import { TRIAGE_QUESTIONS, consoleRank, retriageTicket, triageOutcomeNote, STALE_ALERT_MS } from '../functions/api/_support-triage.js';
import { onRequestPost as createTicket } from '../functions/api/support/tickets.js';
import { onRequestPatch as adminPatch, onRequestGet as adminGet } from '../functions/api/admin/support.js';

let controls = 0;
const ok = (value, message) => { assert.ok(value, message); controls += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); controls += 1; };

const MERCHANT = 'cafe-retry-test';
const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

function clef({ urgency = [0.05, 0.15, 0.8], blocked = 0.9 } = {}) {
  const ids = ['caisse', 'impression', 'paiement', 'compte', 'menu_stock', 'autre'];
  const probs = Object.fromEntries(ids.map((id) => [id, id === 'caisse' ? 0.82 : 0.036]));
  const labels = TRIAGE_QUESTIONS.urgence.criteria;
  return { model: 'clef', answers: {
    urgence: { type: 'score', score: urgency[1] + 2 * urgency[2], legend: { 0: labels[0], 1: labels[1], 2: labels[2] },
      probabilities: { 0: urgency[0], 1: urgency[1], 2: urgency[2] }, confidence: Math.max(...urgency) },
    categorie: { type: 'choice', choice: 'caisse', probabilities: probs, confidence: probs.caisse },
    bloque: { type: 'noul', noul: blocked },
  } };
}

async function fresh(overrides = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  db.prepare('INSERT INTO merchant_config (merchant, name, type, plan, status, till_epoch, features, updated_ts) VALUES (?,?,?,?,?,?,?,?)')
    .run(MERCHANT, 'Cafe Retry', 'restaurant', 'basic', 'active', 0, '{}', Date.now());
  db.exec("INSERT INTO operators (id, label, salt, hash, created_ts) VALUES ('op-a', 'Alice', '', '', 1)");
  const DB = { db, prepare(sql) { let args = []; const st = {
    bind(...v) { args = v; return st; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes || 0) } }; },
  }; return st; } };
  const env = { DB, AUTH_SECRET: 'support-retry-secret-0123456789abcdef', calls: 0,
    AI: { run: async () => { env.calls += 1; return env.reply(); } }, reply: () => clef(), ...overrides };
  return env;
}

const tillCookie = (env) => auth.tillToken(env.AUTH_SECRET, MERCHANT, 0).then((t) => `${auth.TILL_COOKIE}=${t}`);
async function opCookie(env) {
  return `kiwi_op=${await auth.operatorToken(env.AUTH_SECRET)}; kiwi_op_id=${await auth.operatorIdToken(env.AUTH_SECRET, 'op-a')}`;
}
async function post(env, summary) {
  const waits = [];
  const res = await createTicket({ request: new Request('https://kiwi.test/api/support/tickets', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: await tillCookie(env) },
    body: JSON.stringify({ merchant: MERCHANT, summary, channel: 'whatsapp', contact: '+212600000000', client: {} }),
  }), env, waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  return (await res.json()).ticket.id;
}
async function retriage(env, id) {
  const res = await adminPatch({ request: new Request('https://kiwi.test/api/admin/support', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: await opCookie(env) },
    body: JSON.stringify({ id, action: 'retriage' }) }), env });
  return { status: res.status, body: await res.json() };
}
const thread = (env, id) => env.DB.db.prepare("SELECT author, body FROM support_messages WHERE ticket_id = ? AND kind = 'triage' ORDER BY ts, rowid").all(id);
const row = (env, id) => env.DB.db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id);

const mails = [];
let mailStatus = 500;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { mails.push(JSON.parse(init.body)); return new Response('{}', { status: mailStatus }); };
const urgent = () => mails.filter((m) => /^\[URGENT\]/.test(m.subject));

try {
  /* 1. Le modèle échoue : la demande existe, le fil interne dit pourquoi. */
  {
    const env = await fresh();
    env.reply = () => { throw new Error('model down'); };
    const id = await post(env, 'la caisse ne s\'ouvre plus du tout');
    ok(row(env, id) && row(env, id).triage === null, 'la demande est créée, sans tri');
    const notes = thread(env, id);
    eq(notes.length, 1, 'un échec du modèle laisse une trace dans le fil interne');
    ok(/Tri automatique non fait : le modèle n’a pas répondu à temps/.test(notes[0].body) && notes[0].author === 'kiwi', 'la trace dit pourquoi, signée kiwi');

    /* La console la remonte : ouverte et jamais triée passe avant le reste. */
    const list = await (await adminGet({ request: new Request('https://kiwi.test/api/admin/support', { headers: { Cookie: await opCookie(env) } }), env })).json();
    eq(consoleRank(list.tickets[0]), 1.5, 'une demande ouverte jamais triée passe avant les demandes triées sans urgence');
    ok(consoleRank({ status: 'open', triage: { verdict: 'normal' } }) > 1.5 && consoleRank({ status: 'open', priority: 'urgent', triage: null }) < 1.5, 'et après les urgences par mots-clés');
    eq(consoleRank({ status: 'closed', triage: null }), 2, 'une demande fermée non triée ne monte pas');

    /* Relance par l'opérateur, modèle revenu : la demande est triée. */
    env.reply = () => clef({ urgency: [0.7, 0.2, 0.1], blocked: 0.05 });
    const r = await retriage(env, id);
    eq(r.status, 200, 'la relance est acceptée pour un opérateur nommé');
    ok(JSON.parse(row(env, id).triage).verdict === 'normal', 'la relance enregistre le tri');
    ok(thread(env, id).some((m) => /^Tri relancé : normal/.test(m.body) && m.author !== 'kiwi'), 'la relance est consignée avec son auteur');
  }

  /* 2. Sans liaison AI : la trace le dit aussi ; un marchand sans opérateur ne peut pas relancer. */
  {
    const env = await fresh({ AI: undefined });
    const id = await post(env, 'imprimante muette');
    ok(/le modèle n’est pas disponible/.test(thread(env, id)[0].body), 'sans liaison AI : trace « modèle indisponible »');
    const res = await adminPatch({ request: new Request('https://kiwi.test/api/admin/support', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: await tillCookie(env) },
      body: JSON.stringify({ id, action: 'retriage' }) }), env });
    eq(res.status, 403, 'une caisse ne peut pas relancer le tri');
  }

  /* 3. Quota du commerçant atteint : la création le consigne, l'opérateur passe outre. */
  {
    const env = await fresh();
    // Remplit le quota par l'API publique du module plutôt qu'en devinant ses tables.
    const { quotaOk, DAILY_CAPS } = await import('../functions/api/ai/_quota.js');
    for (let i = 0; i < DAILY_CAPS.supporttriage; i += 1) await quotaOk(env, MERCHANT, 'supporttriage', DAILY_CAPS.supporttriage);
    const id = await post(env, 'paiement carte refusé');
    ok(/quota quotidien du commerçant est atteint/.test(thread(env, id).map((m) => m.body).join('\n')), 'quota atteint : trace dans le fil');
    const before = env.calls;
    await retriage(env, id);
    ok(env.calls === before + 1 && row(env, id).triage, 'la relance d\'un opérateur ne bute pas sur le quota du commerçant');
  }

  /* 4. Alerte urgente refusée par le fournisseur : trace, puis relance qui renvoie une seule fois. */
  {
    const env = await fresh({ SUPPORT_ALERT_EMAIL: 'equipe@kiwi.test', MAIL_WEBHOOK: 'https://mail.test/hook' });
    mails.length = 0; mailStatus = 500;
    const id = await post(env, 'caisse bloquée, aucune vente possible');
    eq(JSON.parse(row(env, id).triage_alert).state, 'failed', 'le fournisseur refuse : alerte « failed »');
    ok(thread(env, id).some((m) => /l’e-mail d’alerte n’est pas parti/.test(m.body)), 'l\'alerte manquée est écrite dans le fil interne');
    eq(urgent().length, 1, 'une tentative d\'envoi');
    mailStatus = 200;
    await retriage(env, id);
    eq(JSON.parse(row(env, id).triage_alert).state, 'sent', 'la relance renvoie l\'alerte');
    eq(urgent().length, 2, 'un seul nouvel envoi');
    await retriage(env, id);
    eq(urgent().length, 2, 'une alerte envoyée ne repart jamais');
  }

  /* 5. Alerte « non confirmée » : libérée seulement quand elle est périmée. */
  {
    const env = await fresh({ SUPPORT_ALERT_EMAIL: 'equipe@kiwi.test', MAIL_WEBHOOK: 'https://mail.test/hook' });
    mailStatus = 200;
    const id = await post(env, 'caisse bloquée encore');
    const now = Date.now();
    env.DB.db.prepare('UPDATE support_tickets SET triage_alert = ? WHERE id = ?').run(JSON.stringify({ state: 'unconfirmed', ts: now - 1000 }), id);
    mails.length = 0;
    await retriageTicket(env, row(env, id), now);
    eq(urgent().length, 0, 'une alerte en cours d\'envoi n\'est pas doublée');
    env.DB.db.prepare('UPDATE support_tickets SET triage_alert = ? WHERE id = ?').run(JSON.stringify({ state: 'unconfirmed', ts: now - STALE_ALERT_MS - 1 }), id);
    await retriageTicket(env, row(env, id), now);
    eq(urgent().length, 1, 'une alerte restée non confirmée plus de deux minutes repart');
  }

  /* 6. Rien à dire quand tout va bien. */
  eq(triageOutcomeNote({ status: 'triaged', triage: { verdict: 'normal' } }), null, 'tri réussi sans alerte : aucune trace');
  eq(triageOutcomeNote({ status: 'triaged', triage: { verdict: 'urgent', alert: { state: 'sent' } } }), null, 'alerte envoyée : aucune trace');
  eq(triageOutcomeNote({ status: 'skipped', reason: 'no-ticket' }), null, 'demande incomplète : pas de trace inventée');
} finally {
  globalThis.fetch = realFetch;
}

console.log(`support-triage-retry-test: ${controls} controls passed`);
