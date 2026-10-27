#!/usr/bin/env node
/* Support · l'urgence ne dépend pas d'un canal courriel.
 *
 * Sans SUPPORT_ALERT_EMAIL ou MAIL_WEBHOOK, l'alerte d'une demande urgente
 * restait « non envoyée » dans le fil : un commerçant qui ne peut plus vendre
 * attendait qu'on ouvre le Support. La console lit désormais, en permanence,
 * combien de demandes urgentes ouvertes n'ont reçu aucune alerte
 * (GET /api/admin/support?escalation=1, escalationOf) et l'affiche à côté du
 * bouton Support (assets/admin-support-escalation.js).
 *
 * Les vraies routes tournent (dépôt d'une demande, tri, lecture opérateur) sur
 * un SQLite en mémoire ; le modèle et le webhook sont simulés. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { operatorToken, operatorIdToken } from '../functions/auth/_lib.js';
import { onRequestPost as createTicket } from '../functions/api/support/tickets.js';
import { onRequestGet as adminGet, onRequestPatch as adminPatch } from '../functions/api/admin/support.js';
import { escalationOf, TRIAGE_QUESTIONS } from '../functions/api/_support-triage.js';

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; console.log('  ✓ ' + m); };

class Stmt {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...a) { this.args = a; return this; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(r.changes || 0) } }; }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
}
class D1 {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; }
}
const SECRET = 'support-escalation-test-secret-0123456789';
const MERCHANT = 'cafe-escalation-test';
const clef = ({ urgency, blocked }) => {
  const labels = TRIAGE_QUESTIONS.urgence.criteria, u = {};
  urgency.forEach((p, i) => { u[String(i)] = p; });
  const ids = ['caisse', 'impression', 'paiement', 'compte', 'menu_stock', 'autre'];
  const probs = Object.fromEntries(ids.map((id) => [id, id === 'caisse' ? 0.82 : 0.036]));
  return { model: 'clef', answers: {
    urgence: { type: 'score', score: urgency[1] + 2 * urgency[2], legend: { 0: labels[0], 1: labels[1], 2: labels[2] }, probabilities: u, confidence: Math.max(...urgency) },
    categorie: { type: 'choice', choice: 'caisse', probabilities: probs, confidence: 0.82 },
    bloque: { type: 'noul', noul: blocked } }, usage: { input_tokens: 100, output_tokens: 0 } };
};
const URGENT = () => clef({ urgency: [0.02, 0.08, 0.9], blocked: 0.95 });
const CALM = () => clef({ urgency: [0.9, 0.08, 0.02], blocked: 0.02 });

function freshEnv(overrides = {}) {
  const DB = new D1();
  DB.db.exec(`CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, name TEXT, type TEXT, plan TEXT, status TEXT, till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER);
    CREATE TABLE operators (id TEXT PRIMARY KEY, label TEXT, salt TEXT NOT NULL, hash TEXT NOT NULL, created_ts INTEGER NOT NULL);
    INSERT INTO operators VALUES ('op-escalation', 'Escalation', '', '', 1);
    CREATE TABLE operational_rate (merchant TEXT NOT NULL, bucket TEXT NOT NULL, window_ts INTEGER NOT NULL, hits INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (merchant, bucket, window_ts));`);
  DB.db.prepare('INSERT INTO merchant_config (merchant,name,type,plan,status,till_epoch,updated_ts) VALUES (?,?,?,?,?,?,?)').run(MERCHANT, 'Cafe Escalation', 'restaurant', 'basic', 'active', 0, Date.now());
  const env = { DB, AUTH_SECRET: SECRET, AI: { run: async () => env.__reply() }, __reply: URGENT, ...overrides };
  return env;
}
const operator = async () => `kiwi_op=${await operatorToken(SECRET)}; kiwi_op_id=${await operatorIdToken(SECRET, 'op-escalation')}`;
async function file(env, summary) {
  const waits = [];
  const res = await createTicket({ request: new Request('https://kiwi.test/api/support/tickets', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: await operator() },
    body: JSON.stringify({ merchant: MERCHANT, summary, channel: 'whatsapp', contact: '+212600000000', client: {} }) }), env, waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  return (await res.json()).ticket;
}
async function escalation(env, cookie) {
  const res = await adminGet({ request: new Request('https://kiwi.test/api/admin/support?escalation=1', { headers: cookie === undefined ? { Cookie: await operator() } : cookie ? { Cookie: cookie } : {} }), env });
  return { status: res.status, body: await res.json() };
}

const mails = [];
let mailStatus = 200;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => { mails.push(JSON.parse(init.body)); return new Response('{}', { status: mailStatus }); };

try {
  console.log('\nSans canal courriel');
  let env = freshEnv();
  ok((await escalation(env)).body.escalation.unalerted === 0, 'aucune demande : rien à signaler');
  const t1 = await file(env, 'caisse bloquée, aucune vente possible');
  let e = (await escalation(env)).body.escalation;
  ok(e.urgent === 1 && e.unalerted === 1 && e.tickets[0].id === t1.id && e.tickets[0].reason === 'unconfigured' && e.tickets[0].reference === t1.reference && e.tickets[0].merchant === MERCHANT, 'une demande urgente sans canal courriel est comptée « sans alerte », avec sa référence et sa raison');
  ok(mails.length === 0, 'et aucun courriel n’est parti');
  env.__reply = CALM;
  await file(env, 'comment changer le prix d’un plat dans le menu');
  e = (await escalation(env)).body.escalation;
  ok(e.urgent === 1 && e.unalerted === 1, 'une demande ordinaire ne compte pas');

  console.log('\nDemande urgente jamais triée (pas de modèle)');
  env = freshEnv({ AI: undefined });
  const t2 = await file(env, 'caisse bloquée depuis ce matin');
  e = (await escalation(env)).body.escalation;
  ok(e.unalerted === 1 && e.tickets[0].id === t2.id && e.tickets[0].reason === 'untriaged', 'urgence par mots-clés sans tri : comptée, raison « untriaged »');

  console.log('\nAvec un canal courriel');
  env = freshEnv({ MAIL_WEBHOOK: 'https://mail.test/hook', SUPPORT_ALERT_EMAIL: 'equipe@kiwi.test' });
  const t3 = await file(env, 'caisse bloquée');
  e = (await escalation(env)).body.escalation;
  ok(mails.length === 1 && e.urgent === 1 && e.unalerted === 0 && e.tickets.length === 0, 'alerte transmise : urgente, mais pas « sans alerte »');
  mailStatus = 500;
  env = freshEnv({ MAIL_WEBHOOK: 'https://mail.test/hook', SUPPORT_ALERT_EMAIL: 'equipe@kiwi.test' });
  await file(env, 'caisse bloquée');
  e = (await escalation(env)).body.escalation;
  ok(e.unalerted === 1 && e.tickets[0].reason === 'failed', 'envoi refusé par le fournisseur : comptée, raison « failed »');
  mailStatus = 200;

  console.log('\nQuand la demande est traitée');
  env = freshEnv();
  const t4 = await file(env, 'caisse bloquée');
  ok((await escalation(env)).body.escalation.unalerted === 1, 'ouverte : comptée');
  const patch = await adminPatch({ request: new Request('https://kiwi.test/api/admin/support', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: await operator() }, body: JSON.stringify({ id: t4.id, action: 'status', status: 'resolved' }) }), env });
  ok(patch.status === 200 && (await escalation(env)).body.escalation.unalerted === 0 && (await escalation(env)).body.escalation.urgent === 0, 'résolue : le bandeau retombe à zéro');

  console.log('\nQui peut lire');
  ok((await escalation(env, '')).status === 403, 'sans cookie opérateur : 403');
  ok((await escalation(env, `kiwi_op=${await operatorToken(SECRET)}`)).status === 403, 'cookie commun sans identité signée : 403');
  const list = await adminGet({ request: new Request('https://kiwi.test/api/admin/support?status=open', { headers: { Cookie: await operator() } }), env });
  ok(list.status === 200 && Array.isArray((await list.json()).tickets), 'la liste du Support garde sa forme');

  console.log('\nescalationOf');
  const row = (o) => ({ id: 'a', reference: 'K-1', merchant: 'm', status: 'open', priority: 'normal', created_ts: 1, triage: null, triage_alert: null, ...o });
  const sentRow = row({ triage: JSON.stringify({ verdict: 'urgent' }), triage_alert: JSON.stringify({ state: 'sent' }) });
  ok(escalationOf([sentRow, row({ priority: 'urgent' }), row({ status: 'resolved', priority: 'urgent' }), row({ status: 'waiting-client', priority: 'urgent' }), null, row({ triage: '{oops' })]).unalerted === 1, 'alerte transmise, résolue, en attente du client, ligne vide ou JSON illisible : seule l’urgente ouverte sans alerte compte');
  ok(escalationOf(undefined).unalerted === 0 && escalationOf(Array.from({ length: 50 }, (_, i) => row({ id: 'r' + i, priority: 'urgent' }))).tickets.length === 20, 'entrée vide : zéro ; la liste détaillée est bornée à 20');
  ok(escalationOf([row({ triage: JSON.stringify({ verdict: 'urgent' }), triage_alert: JSON.stringify({ state: 'unconfirmed' }) })]).tickets[0].reason === 'unconfirmed', 'alerte non confirmée : comptée');

  console.log('\nLe bandeau de la console');
  const listeners = {}, nodes = [];
  const launch = { id: 'support-console', clicks: 0, click() { this.clicks++; }, insertAdjacentElement(_, el) { nodes.push(el); return el; } };
  const makeEl = () => { const el = { hidden: false, textContent: '', title: '', className: '', attrs: {}, handlers: {}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(n, f) { this.handlers[n] = f; } }; return el; };
  const requests = [];
  let answer = { escalation: { unalerted: 2, urgent: 2, tickets: [{ reference: 'K-9', merchant: 'cafe-a' }] } };
  const timers = [];
  const documentStub = { title: 'Console Kiwi', hidden: false, documentElement: { lang: 'fr' }, getElementById: (id) => (id === 'support-console' ? launch : null), createElement: makeEl, addEventListener: (n, f) => { listeners['document:' + n] = f; } };
  const windowStub = { KiwiAdminApi: { request: async (url) => { requests.push(url); if (answer instanceof Error) throw answer; return answer; } }, addEventListener: (n, f) => { listeners['window:' + n] = f; } };
  const ctx = vm.createContext({ document: documentStub, window: windowStub, setInterval: (f, ms) => timers.push({ f, ms }), setTimeout: (f, ms) => timers.push({ f, ms, once: true }) });
  vm.runInContext(fs.readFileSync(new URL('../assets/admin-support-escalation.js', import.meta.url), 'utf8'), ctx);
  const pill = nodes[0];
  ok(pill && pill.hidden === true && pill.attrs.role === 'status', 'au chargement la pastille est cachée, annoncée comme un état');
  await windowStub.KiwiSupportEscalation.refresh();
  ok(requests[0] === '/api/admin/support?escalation=1' && pill.hidden === false && pill.textContent === '2 urgentes sans alerte', 'deux demandes sans alerte : « 2 urgentes sans alerte »');
  ok(documentStub.title === '(2) Console Kiwi' && /K-9 · cafe-a/.test(pill.title) && /SUPPORT_ALERT_EMAIL/.test(pill.title), 'le titre de l’onglet porte le nombre, l’infobulle nomme la plus ancienne et la cause');
  documentStub.documentElement.lang = 'en'; await windowStub.KiwiSupportEscalation.refresh();
  ok(pill.textContent === '2 urgent without alert' && /Oldest: K-9/.test(pill.title), 'la pastille suit la langue de la page (anglais)');
  documentStub.documentElement.lang = 'ar'; await windowStub.KiwiSupportEscalation.refresh();
  ok(/^2 عاجلة بلا تنبيه$/.test(pill.textContent) && /K-9/.test(pill.title), 'la pastille suit la langue de la page (arabe)');
  documentStub.documentElement.lang = 'de'; await windowStub.KiwiSupportEscalation.refresh();
  ok(pill.textContent === '2 urgentes sans alerte', 'une langue inconnue retombe sur le français');
  documentStub.documentElement.lang = 'fr';
  answer = { escalation: { unalerted: 1, urgent: 1, tickets: [] } };
  await windowStub.KiwiSupportEscalation.refresh();
  ok(pill.textContent === '1 urgente sans alerte' && documentStub.title === '(1) Console Kiwi', 'au singulier pour une seule');
  answer = new Error('http-401');
  await windowStub.KiwiSupportEscalation.refresh();
  ok(pill.hidden === false && pill.textContent === '1 urgente sans alerte', 'une panne réseau garde le dernier état connu');
  answer = { escalation: { unalerted: 0, urgent: 0, tickets: [] } };
  await windowStub.KiwiSupportEscalation.refresh();
  ok(pill.hidden === true && documentStub.title === 'Console Kiwi', 'plus rien : la pastille se cache, le titre revient');
  pill.handlers.click();
  ok(launch.clicks === 1, 'un clic sur la pastille ouvre le Support');
  ok(timers.some((t) => t.ms === 60000 && !t.once), 'la lecture se refait chaque minute');
  const before = requests.length;
  documentStub.hidden = true; timers.find((t) => t.ms === 60000).f();
  ok(requests.length === before, 'onglet caché : pas de lecture inutile');
} finally {
  globalThis.fetch = realFetch;
}
console.log(`support-escalation: ${checks} checks`);
