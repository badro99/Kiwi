// tools/support-triage-test.mjs
//
// Tri automatique des demandes de support par Clef (functions/api/_support-triage.js).
// Le binding `env.AI` est simulé : on vérifie la forme de la requête contre la
// documentation Workers AI (clef-flash, schema-input.json / schema-output.json),
// ce qui est stocké, les seuils, l'alerte équipe, et surtout que la création de la
// demande ne dépend JAMAIS du tri (pas de binding, quota épuisé, erreur, réponse
// illisible, exception synchrone).
//
// Les vraies fonctions tournent : onRequestPost de /api/support/tickets et de
// /api/support/attachments, sur un SQLite en mémoire, avec une vraie caisse appairée.
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { ensureSupport, SUPPORT_TABLES } from '../functions/api/_support.js';
import { TILL_COOKIE, tillToken } from '../functions/auth/_lib.js';
import { DAILY_CAPS } from '../functions/api/ai/_quota.js';
import { GATEWAY_OPTS } from '../functions/api/ai/_run.js';
import {
  ALERT_AT, CONFIDENT_AT, TRIAGE_MODEL, TRIAGE_QUESTIONS, WATCH_AT,
  alertRecipients, buildTriageRequest, consoleRank, publicTriage, readTriageAnswers,
  triageAfterImage, triageSupportTicket, verdictOf,
} from '../functions/api/_support-triage.js';
import { onRequestGet as listTickets, onRequestPost as createTicket } from '../functions/api/support/tickets.js';
import { onRequestPost as addAttachment } from '../functions/api/support/attachments.js';

let controls = 0;
function ok(value, message) { assert.ok(value, message); controls += 1; }
function eq(actual, expected, message) { assert.deepEqual(actual, expected, message); controls += 1; }

class D1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
}
class D1Database {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new D1Statement(this.db, sql); }
}

const SECRET = 'support-triage-test-secret-0123456789abcdef';
const MERCHANT = 'cafe-triage-test';

/* Réponse de Clef conforme à schema-output.json. */
function clef({ urgency = [0.05, 0.15, 0.8], category = 'caisse', categoryP, blocked = 0.9, keyedBy = 'index', model = 'clef' } = {}) {
  const ids = ['caisse', 'impression', 'paiement', 'compte', 'menu_stock', 'autre'];
  const probs = categoryP || Object.fromEntries(ids.map((id) => [id, id === category ? 0.82 : 0.036]));
  const labels = TRIAGE_QUESTIONS.urgence.criteria;
  const u = {};
  urgency.forEach((p, i) => { u[keyedBy === 'index' ? String(i) : labels[i]] = p; });
  return {
    model,
    answers: {
      urgence: {
        type: 'score', score: urgency[1] + 2 * urgency[2],
        legend: { 0: labels[0], 1: labels[1], 2: labels[2] }, probabilities: u, confidence: Math.max(...urgency),
      },
      categorie: { type: 'choice', choice: category, probabilities: probs, confidence: probs[category] },
      bloque: { type: 'noul', noul: blocked },
    },
    usage: { input_tokens: 120, output_tokens: 0 },
  };
}

function freshEnv(overrides = {}) {
  const DB = new D1Database();
  DB.db.exec(`CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, name TEXT, type TEXT, plan TEXT, status TEXT, till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER)`);
  DB.db.prepare(`INSERT INTO merchant_config (merchant,name,type,plan,status,till_epoch,updated_ts) VALUES (?,?,?,?,?,?,?)`)
    .run(MERCHANT, 'Cafe Triage Test', 'restaurant', 'basic', 'active', 0, Date.now());
  const media = new Map();
  const calls = [];
  const env = {
    DB, AUTH_SECRET: SECRET,
    MEDIA: { async put(key, value) { media.set(key, value); }, async delete(key) { media.delete(key); } },
    AI: { run: async (...args) => { calls.push(args); return env.__reply(); } },
    __reply: () => clef(),
    __calls: calls,
    ...overrides,
  };
  return env;
}

async function cookie() { return `${TILL_COOKIE}=${await tillToken(SECRET, MERCHANT, 0)}`; }

async function post(env, summary, extra = {}) {
  const waits = [];
  const res = await createTicket({
    request: new Request('https://kiwi.test/api/support/tickets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: await cookie() },
      body: JSON.stringify({ merchant: MERCHANT, summary, channel: 'whatsapp', contact: '+212600000000', client: {}, ...extra }),
    }),
    env, waitUntil: (p) => waits.push(p),
  });
  await Promise.all(waits);
  return { res, body: await res.json() };
}
const row = (env, id) => env.DB.db.prepare('SELECT * FROM support_tickets WHERE id = ?').get(id);

/* fetch simulé : le webhook de courriel. */
const mails = [];
let mailStatus = 200;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  mails.push({ url: String(url), body: JSON.parse(init.body) });
  return new Response('{}', { status: mailStatus });
};
const urgentMails = () => mails.filter((m) => /^\[URGENT\]/.test(m.body.subject));

try {
  /* ── 1. La requête respecte la documentation de Clef ─────────────────────── */
  const request = buildTriageRequest({ summary: 'la caisse ne s\'ouvre plus', storeType: 'restaurant' });
  eq(Object.keys(request).sort(), ['model', 'questions', 'state'], 'texte seul : model, state, questions, rien d\'autre');
  ok(request.model === 'clef' && /^\s*(clef|clef-flash)\s*$/.test(request.model), 'model suit le motif du schéma');
  ok(typeof request.state === 'string' && request.state.includes('la caisse ne s\'ouvre plus'), 'le message du commerçant est dans state');
  ok(request.state.indexOf('la caisse') < request.state.indexOf('restaurant'), 'le message passe avant le contexte (Clef lit environ 2 000 jetons)');
  const qids = Object.keys(request.questions);
  ok(qids.length >= 1 && qids.length <= 64 && qids.every((id) => /^[A-Za-z0-9_.-]{1,100}$/.test(id)), '1 à 64 questions, identifiants valides');
  eq(qids.sort(), ['bloque', 'categorie', 'urgence'], 'urgence, catégorie, « ne peut pas vendre »');
  const { urgence, categorie, bloque } = request.questions;
  ok(urgence.type === 'score' && Array.isArray(urgence.criteria) && urgence.criteria.length === 3 && urgence.instructions, 'score : critères ordonnés, du plus bas au plus haut, 2 à 10 niveaux');
  ok(/^Peut attendre/.test(urgence.criteria[0]) && /^Aujourd/.test(urgence.criteria[1]) && /^Maintenant/.test(urgence.criteria[2]), 'niveaux : peut attendre, aujourd\'hui, maintenant');
  ok(categorie.type === 'choice' && !Array.isArray(categorie.criteria) && Object.keys(categorie.criteria).length === 6 && categorie.instructions, 'choice : 6 catégories');
  eq(Object.keys(categorie.criteria), ['caisse', 'impression', 'paiement', 'compte', 'menu_stock', 'autre'], 'catégories voulues');
  ok(bloque.type === 'noul' && bloque.instructions && Object.keys(bloque.criteria).sort().join() === 'false,true', 'noul : instructions + critères true/false');
  const withImage = buildTriageRequest({ summary: 'x'.repeat(10), images: [
    { content_type: 'image/png', base64: 'AAAA' }, { content_type: 'image/gif', base64: 'AAAA' }, { content_type: 'image/webp', base64: 'BBBB' },
  ] });
  eq(withImage.images, [{ content_type: 'image/png', base64: 'AAAA' }, { content_type: 'image/webp', base64: 'BBBB' }], 'images : { content_type, base64 }, PNG/JPEG/WebP seulement');
  ok(buildTriageRequest({ summary: 'é'.repeat(9000) }).state.length < 3200, 'le texte est borné');

  /* ── 2. Lecture de la réponse ───────────────────────────────────────────── */
  const read = readTriageAnswers(clef({ urgency: [0.02, 0.08, 0.9], category: 'impression', blocked: 0.74 }), 1234);
  ok(read && read.v === 1 && read.model === TRIAGE_MODEL && read.served === 'clef' && read.ts === 1234, 'modèle et date stockés');
  eq(read.urgency.p, [0.02, 0.08, 0.9], 'probabilités par niveau conservées');
  ok(read.urgency.level === 'now' && read.urgency.now === 0.9 && read.urgency.top === 0.9, 'niveau d\'urgence en tête');
  ok(read.category.id === 'impression' && read.category.top === 0.82 && Object.keys(read.category.p).length === 6, 'catégorie avec sa probabilité et la distribution');
  ok(read.blocked === 0.74, 'P(ne peut pas vendre) conservée');
  eq(readTriageAnswers(clef({ keyedBy: 'text' })).urgency.p, [0.05, 0.15, 0.8], 'probabilités de score lues aussi si elles sont clés par texte');
  ok(readTriageAnswers({ answers: {} }) === null && readTriageAnswers(null) === null && readTriageAnswers({}) === null, 'réponse sans forme : null');
  const bad = clef(); bad.answers.categorie.choice = 'inconnue';
  ok(readTriageAnswers(bad) === null, 'catégorie hors liste : refusée, pas devinée');
  const bad2 = clef(); bad2.answers.bloque.noul = 1.4;
  ok(readTriageAnswers(bad2) === null, 'probabilité hors [0,1] : refusée');
  const bad3 = clef(); bad3.answers.urgence.probabilities = { 0: 0.3 };
  ok(readTriageAnswers(bad3) === null, 'distribution incomplète : refusée');

  /* ── 3. Seuils ──────────────────────────────────────────────────────────── */
  ok(ALERT_AT === 0.5 && WATCH_AT === 0.3 && CONFIDENT_AT === 0.6, 'seuils documentés : alerte 0,5, à vérifier 0,3, étiquette assurée 0,6');
  const v = (blocked, now) => verdictOf({ blocked, urgency: { now } });
  ok(v(0.5, 0) === 'urgent' && v(0.499, 0.1) === 'watch', 'P(ne peut pas vendre) = 0,5 alerte, 0,499 non');
  ok(v(0, 0.5) === 'urgent' && v(0.1, 0.49) === 'watch', 'P(maintenant) = 0,5 alerte aussi');
  ok(v(0.3, 0) === 'watch' && v(0.29, 0.29) === 'normal', 'sous 0,3 : rien');

  /* ── 4. Création avec tri : champs stockés, rien côté commerçant ─────────── */
  {
    const env = freshEnv();
    env.__reply = () => clef({ urgency: [0.02, 0.08, 0.9], category: 'caisse', blocked: 0.88 });
    const { res, body } = await post(env, 'La caisse ne s\'ouvre plus, on ne peut plus encaisser depuis ce matin');
    ok(res.status === 200 && body.ok === true, 'la demande est créée');
    ok(env.__calls.length === 1, 'un seul appel Clef par demande');
    const [model, payload, opts] = env.__calls[0];
    ok(model === '@cf/cloudflare/clef', 'modèle @cf/cloudflare/clef');
    ok(payload.model === 'clef' && typeof payload.state === 'string' && payload.state.includes('La caisse ne s\'ouvre plus'), 'state = le message');
    ok(!('images' in payload), 'pas d\'image à la création');
    eq(opts, GATEWAY_OPTS, 'passe par la passerelle AI Gateway kiwi (aucun appel direct)');
    ok(!payload.state.includes('+212600000000') && !JSON.stringify(payload).includes('contact'), 'le contact du commerçant n\'est jamais envoyé au modèle');
    const r = row(env, body.ticket.id);
    const t = JSON.parse(r.triage);
    ok(t.model === '@cf/cloudflare/clef' && t.verdict === 'urgent' && t.blocked === 0.88 && t.urgency.now === 0.9 && t.category.id === 'caisse', 'tri stocké avec modèle, probabilités et verdict');
    ok(!JSON.stringify(body).match(/triage|clef|0\.88/), 'la réponse au commerçant ne contient aucune étiquette');
    ok(Object.keys(body.ticket).sort().join() === 'category,channel,id,priority,reference', 'forme de la réponse inchangée');
    const mine = await (await listTickets({ request: new Request(`https://kiwi.test/api/support/tickets?merchant=${MERCHANT}`, { headers: { Cookie: await cookie() } }), env })).json();
    ok(mine.tickets.length === 1 && !JSON.stringify(mine).match(/triage|clef|blocked/), 'la liste du commerçant ne montre aucune étiquette IA');
    ok(Object.keys(mine.tickets[0]).sort().join() === 'category,channel,created_ts,id,priority,reference,status,updated_ts', 'colonnes de la liste commerçant inchangées');
  }

  /* ── 5. Alerte : jamais « envoyée » sans l'avoir été ─────────────────────── */
  {
    // a) pas de destinataire configuré
    mails.length = 0;
    let env = freshEnv({ MAIL_WEBHOOK: 'https://mail.test/hook' });
    let { body } = await post(env, 'caisse bloquée, aucune vente possible');
    let alert = JSON.parse(row(env, body.ticket.id).triage_alert);
    ok(alert.state === 'unconfigured' && urgentMails().length === 0, 'sans SUPPORT_ALERT_EMAIL : « unconfigured », aucun courriel');
    ok(publicTriage(row(env, body.ticket.id)).alert.state === 'unconfigured', 'la console reçoit cet état');

    // b) destinataire mais pas de fournisseur de courriel
    mails.length = 0;
    env = freshEnv({ SUPPORT_ALERT_EMAIL: 'equipe@kiwi.test' });
    ({ body } = await post(env, 'caisse bloquée'));
    ok(JSON.parse(row(env, body.ticket.id).triage_alert).state === 'unconfigured' && mails.length === 0, 'sans MAIL_WEBHOOK : « unconfigured »');

    // c) le fournisseur refuse
    mails.length = 0; mailStatus = 500;
    env = freshEnv({ MAIL_WEBHOOK: 'https://mail.test/hook', SUPPORT_ALERT_EMAIL: 'equipe@kiwi.test' });
    ({ body } = await post(env, 'caisse bloquée'));
    ok(JSON.parse(row(env, body.ticket.id).triage_alert).state === 'failed' && urgentMails().length === 1, 'refus du fournisseur : « failed »');

    // d) envoi accepté
    mails.length = 0; mailStatus = 200;
    env = freshEnv({ MAIL_WEBHOOK: 'https://mail.test/hook', SUPPORT_ALERT_EMAIL: 'equipe@kiwi.test, astreinte@kiwi.test' });
    ({ body } = await post(env, 'caisse bloquée depuis ce matin'));
    const sent = urgentMails();
    ok(JSON.parse(row(env, body.ticket.id).triage_alert).state === 'sent', 'fournisseur 2xx : « sent »');
    ok(sent.length === 2 && sent.map((m) => m.body.to).sort().join() === 'astreinte@kiwi.test,equipe@kiwi.test', 'chaque destinataire reçoit l\'alerte');
    ok(/\[URGENT\] K-/.test(sent[0].body.subject) && sent[0].body.text.includes('88 %') === false && sent[0].body.text.includes('90 %') && sent[0].body.text.includes(MERCHANT), 'sujet, probabilités et commerçant dans le courriel');
    ok(!sent[0].body.text.includes('+212600000000'), 'le contact du commerçant ne part pas dans l\'alerte');
    ok(alertRecipients({ SUPPORT_ALERT_EMAIL: 'a@x.test; b@x.test c@x.test d@x.test' }).length === 3, 'trois destinataires au plus');

    // e) pas d'alerte sous le seuil
    mails.length = 0;
    env = freshEnv({ MAIL_WEBHOOK: 'https://mail.test/hook', SUPPORT_ALERT_EMAIL: 'equipe@kiwi.test' });
    env.__reply = () => clef({ urgency: [0.7, 0.2, 0.1], category: 'menu_stock', blocked: 0.04 });
    ({ body } = await post(env, 'comment changer le prix d\'un plat'));
    const calm = row(env, body.ticket.id);
    ok(JSON.parse(calm.triage).verdict === 'normal' && calm.triage_alert === null && urgentMails().length === 0, 'demande calme : triée, aucune alerte');

    // f) zone « à vérifier » : tête de liste, pas de courriel
    env.__reply = () => clef({ urgency: [0.3, 0.4, 0.3], blocked: 0.36 });
    ({ body } = await post(env, 'la caisse est lente parfois'));
    const watch = row(env, body.ticket.id);
    ok(JSON.parse(watch.triage).verdict === 'watch' && watch.triage_alert === null && urgentMails().length === 0, 'entre 0,3 et 0,5 : « watch », aucun courriel');
  }

  /* ── 6. Fail-soft : la création ne dépend jamais du tri ──────────────────── */
  {
    const cases = [
      ['pas de binding AI (pile locale)', () => freshEnv({ AI: undefined })],
      ['AI.run rejette', () => { const e = freshEnv(); e.AI.run = async () => { throw new Error('model down'); }; return e; }],
      ['AI.run lève de façon synchrone', () => { const e = freshEnv(); e.AI.run = () => { throw new Error('sync boom'); }; return e; }],
      ['réponse illisible', () => { const e = freshEnv(); e.__reply = () => ({ answers: { urgence: 3 } }); return e; }],
      ['réponse vide', () => { const e = freshEnv(); e.__reply = () => null; return e; }],
      ['refus 429 de la passerelle', () => { const e = freshEnv(); e.AI.run = async () => { const err = new Error('rate limit'); err.status = 429; throw err; }; return e; }],
    ];
    for (const [name, make] of cases) {
      const env = make();
      const { res, body } = await post(env, 'imprimante ma kat5demch');
      ok(res.status === 200 && body.ok && body.ticket.reference.startsWith('K-'), `${name} : la demande est créée`);
      const r = row(env, body.ticket.id);
      ok(r && r.triage === null && r.triage_alert === null && r.status === 'open', `${name} : demande non triée, rien de faux écrit`);
      ok(publicTriage(r) === null, `${name} : la console lit « non triée »`);
    }

    // quota épuisé : Clef n'est même pas appelé
    const env = freshEnv();
    await post(env, 'première demande pour créer la table de quota');
    const day = new Date().toISOString().slice(0, 10);
    env.DB.db.prepare(`UPDATE ai_usage_kind SET calls = ? WHERE merchant = ? AND day = ? AND kind = 'supporttriage'`).run(DAILY_CAPS.supporttriage, MERCHANT, day);
    const before = env.__calls.length;
    const { res, body } = await post(env, 'la caisse ne démarre plus du tout');
    ok(DAILY_CAPS.supporttriage === 60, 'quota : 60 tris par jour et par établissement');
    ok(res.status === 200 && env.__calls.length === before, 'quota épuisé : demande créée, Clef non appelé');
    ok(row(env, body.ticket.id).triage === null, 'quota épuisé : demande non triée');

    // sans waitUntil (hors Workers) : le tri est attendu mais ne peut pas échouer la réponse
    const env2 = freshEnv();
    env2.AI.run = () => { throw new Error('boom'); };
    const res2 = await createTicket({
      request: new Request('https://kiwi.test/api/support/tickets', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: await cookie() },
        body: JSON.stringify({ merchant: MERCHANT, summary: 'caisse bloquée depuis ce matin', channel: 'whatsapp', contact: '+212600000000' }) }),
      env: env2,
    });
    ok(res2.status === 200, 'sans waitUntil et avec un modèle en panne : 200');

    // triageSupportTicket ne lève jamais, même sur des entrées absurdes
    eq(await triageSupportTicket(null, null), { status: 'skipped', reason: 'no-ai' }, 'env nul : ignoré');
    eq((await triageSupportTicket(freshEnv(), { id: 'x' })).status, 'skipped', 'ticket incomplet : ignoré');
  }

  /* ── 7. Base de production en retard sur schema.sql ───────────────────────── */
  {
    const DB = new D1Database();
    const legacy = SUPPORT_TABLES.find((sql) => sql.includes('support_tickets (id')).replace(', triage TEXT, triage_alert TEXT', '');
    ok(!/triage/.test(legacy), 'table de test : ancienne forme sans colonnes de tri');
    DB.db.exec(legacy);
    DB.db.prepare(`INSERT INTO support_tickets (id,reference,merchant,category,priority,channel,contact,summary,created_ts,updated_ts) VALUES ('t0','K-OLD','m','autre','normal','email','a@b.c','ancienne demande',1,1)`).run();
    await ensureSupport({ DB });
    const cols = DB.db.prepare('PRAGMA table_info(support_tickets)').all().map((c) => c.name);
    ok(cols.includes('triage') && cols.includes('triage_alert'), 'ensureSupport ajoute les colonnes manquantes');
    ok(DB.db.prepare('SELECT triage FROM support_tickets WHERE id = ?').get('t0').triage === null, 'les anciennes demandes restent non triées');
    await ensureSupport({ DB });
    ok(true, 'ensureSupport est rejouable (colonne déjà là)');
    const schema = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
    ok(/support_tickets \([\s\S]*?triage\s+TEXT,\s*[\s\S]*?triage_alert\s+TEXT/.test(schema), 'schema.sql déclare les deux colonnes');
  }

  /* ── 8. Capture d'écran : relance du tri avec l'image ─────────────────────── */
  {
    mails.length = 0;
    const env = freshEnv({ MAIL_WEBHOOK: 'https://mail.test/hook', SUPPORT_ALERT_EMAIL: 'equipe@kiwi.test' });
    env.__reply = () => clef({ urgency: [0.3, 0.4, 0.3], blocked: 0.2 });
    const { body } = await post(env, 'regardez cette erreur sur mon écran');
    ok(JSON.parse(row(env, body.ticket.id).triage).images === 0, 'création : tri du texte seul');
    env.__reply = () => clef({ urgency: [0.02, 0.08, 0.9], blocked: 0.93 });
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const waits = [];
    const upload = async (type, bytes) => {
      const res = await addAttachment({
        request: new Request(`https://kiwi.test/api/support/attachments?ticket=${body.ticket.id}&merchant=${MERCHANT}&name=capture`, {
          method: 'POST', headers: { 'Content-Type': type, Cookie: await cookie() }, body: bytes }),
        env, waitUntil: (p) => waits.push(p),
      });
      await Promise.all(waits.splice(0));
      return res;
    };
    const before = env.__calls.length;
    ok((await upload('image/png', png)).status === 200, 'la pièce jointe est acceptée');
    ok(env.__calls.length === before + 1, 'la première image relance le tri');
    const sent = env.__calls[env.__calls.length - 1][1];
    ok(sent.images.length === 1 && sent.images[0].content_type === 'image/png' && sent.images[0].base64 === Buffer.from(png).toString('base64'), 'image envoyée en { content_type, base64 }');
    const after = row(env, body.ticket.id);
    ok(JSON.parse(after.triage).images === 1 && JSON.parse(after.triage).verdict === 'urgent', 'tri stocké avec l\'image');
    ok(JSON.parse(after.triage_alert).state === 'sent' && urgentMails().length === 1, 'l\'image rend la demande urgente : une alerte part');
    // un tri du texte seul qui arrive après ne remplace pas celui qui a vu la capture
    env.__reply = () => clef({ urgency: [0.9, 0.05, 0.05], blocked: 0.01 });
    await triageSupportTicket(env, { id: body.ticket.id, reference: 'K', merchant: MERCHANT, summary: 'regardez cette erreur sur mon écran' });
    ok(JSON.parse(row(env, body.ticket.id).triage).images === 1, 'un tri sans image n\'écrase pas un tri avec image');
    // une deuxième image ne relance pas le tri, et une alerte ne part qu\'une fois
    const calls = env.__calls.length;
    await upload('image/png', png);
    ok(env.__calls.length === calls, 'deuxième image : pas de nouvel appel');
    env.__reply = () => clef({ urgency: [0.02, 0.08, 0.9], blocked: 0.95 });
    await triageSupportTicket(env, { id: body.ticket.id, reference: 'K', merchant: MERCHANT, summary: 'encore' }, { images: [{ content_type: 'image/png', base64: 'AAAA' }] });
    ok(urgentMails().length === 1, 'une seule alerte par demande, même si le tri est refait');
    // un PDF n'est pas une image pour Clef
    const pdfCalls = env.__calls.length;
    await upload('application/pdf', new TextEncoder().encode('%PDF-1.7 ...'));
    ok(env.__calls.length === pdfCalls, 'un PDF n\'est pas envoyé au modèle');
    ok((await triageAfterImage(freshEnv({ AI: undefined }), { id: 'x' }, 'image/png', new ArrayBuffer(8))).status === 'skipped', 'sans AI : image ignorée');
    ok((await triageAfterImage(env, { id: body.ticket.id }, 'image/png', new ArrayBuffer(5 * 1024 * 1024))).status === 'skipped', 'image de plus de 4 Mo : non envoyée (limite de Clef)');
  }

  /* ── 9. Ordre et lecture dans la console ────────────────────────────────── */
  {
    const mk = (status, priority, verdict) => ({ status, priority, triage: verdict ? { verdict } : null });
    const list = [mk('open', 'normal', null), mk('open', 'urgent', null), mk('open', 'normal', 'watch'), mk('open', 'normal', 'urgent'), mk('resolved', 'normal', 'urgent')];
    list.sort((a, b) => consoleRank(a) - consoleRank(b));
    eq(list.map((t) => (t.triage ? t.triage.verdict : '') + '/' + t.priority + '/' + t.status),
      ['urgent/normal/open', '/urgent/open', 'watch/normal/open', '/normal/open', 'urgent/normal/resolved'],
      'alerte IA en tête, puis mots-clés ou « à vérifier », les demandes résolues redescendent');
    const consoleSrc = fs.readFileSync(new URL('../assets/admin-support.js', import.meta.url), 'utf8');
    ok(/CONFIDENT=0\.6/.test(consoleSrc) && consoleSrc.includes('à vérifier (piste'), 'la console écrit « à vérifier » sous 60 %');
    ok(consoleSrc.includes('Non triée') && consoleSrc.includes('SUPPORT_ALERT_EMAIL ou MAIL_WEBHOOK'), 'la console dit « non triée » et « aucune alerte envoyée » tels quels');
    const adminApi = fs.readFileSync(new URL('../functions/api/admin/support.js', import.meta.url), 'utf8');
    ok(adminApi.includes('publicTriage(row)') && adminApi.includes('consoleRank'), 'l\'API opérateur renvoie le tri et trie par rang');
    const help = fs.readFileSync(new URL('../assets/help-centre.js', import.meta.url), 'utf8');
    ok(!/triage|clef/i.test(help), 'le centre d\'aide du commerçant ne connaît pas le tri');
    ok(!/triage/.test(fs.readFileSync(new URL('../functions/api/support/tickets.js', import.meta.url), 'utf8').match(/export async function onRequestGet[\s\S]*?\n}\n/)[0]), 'GET commerçant : aucune colonne de tri');
    const run = fs.readFileSync(new URL('../functions/api/_support-triage.js', import.meta.url), 'utf8');
    ok(!/—/.test(run) && /runAiWithGateway\(env, TRIAGE_MODEL/.test(run) && !/env\.AI\.run\(/.test(run), 'passerelle seulement, pas d\'appel direct, pas de tiret cadratin');
  }
  /* ── 10. Le banc d'essai (support-triage-eval.mjs) ───────────────────────── */
  {
    const { DATASET, validateDataset } = await import('./support-triage-eval.mjs');
    ok(DATASET.length >= 20 && validateDataset(DATASET).length === 0, 'jeu d\'évaluation : 20 demandes ou plus, étiquettes valides');
    ok(['fr', 'en', 'darija', 'ar'].every((l) => DATASET.some((t) => t.lang === l)), 'jeu d\'évaluation : français, anglais, darija, arabe');
    ok(DATASET.some((t) => t.text === 'imprimante ma kat5demch') && DATASET.some((t) => /prix d'un plat/.test(t.text)), 'jeu d\'évaluation : les cas du cahier des charges');
    const clean = { ...process.env }; delete clean.CLOUDFLARE_ACCOUNT_ID; delete clean.CLOUDFLARE_API_TOKEN;
    const dry = execFileSync(process.execPath, [fileURLToPath(new URL('./support-triage-eval.mjs', import.meta.url)), '--dry'], { env: clean, encoding: 'utf8' });
    ok(/MODE SEC/.test(dry) && /Catégorie\s+: 100\.0 %/.test(dry) && /"model": "clef"/.test(dry), 'mode sec : requête affichée, calcul exercé, aucun réseau');
    const unset = spawnSync(process.execPath, [fileURLToPath(new URL('./support-triage-eval.mjs', import.meta.url))], { env: clean, encoding: 'utf8' });
    ok(unset.status === 2 && /CLOUDFLARE_ACCOUNT_ID/.test(unset.stderr) && /CLOUDFLARE_API_TOKEN/.test(unset.stderr), 'sans variables : message clair et code 2');
    const evalSrc = fs.readFileSync(new URL('./support-triage-eval.mjs', import.meta.url), 'utf8');
    ok(!/console\.\w+\([^)]*\btoken\b/.test(evalSrc.replace(/'Bearer ' \+ token/, '')), 'le jeton n\'est jamais écrit dans la sortie');
  }
} finally {
  globalThis.fetch = realFetch;
}

console.log(`support-triage-test: ${controls} controls passed`);
