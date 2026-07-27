#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · les contrôles de la console opérateur (God mode).
 *
 *   node tools/check-godmode.mjs
 *
 * Fait tourner les VRAIES Pages Functions — /api/admin/sales, /api/admin/account,
 * /api/admin/reset, /auth/reset, /api/feed — contre une base SQLite en mémoire
 * chargée depuis schema.sql. Ce n'est donc pas un faux backend qui imite les
 * réponses : c'est le code qui part en production.
 *
 * Pourquoi un banc séparé de tools/check.js : celui-là vérifie la forme du dépôt
 * (syntaxe, actions, i18n). Ici on vérifie des RÈGLES — « une vente d'un magasin
 * ne peut pas être sortie depuis le panneau d'un autre », « un lien de
 * réinitialisation ne fonctionne qu'une fois », « l'accès équipe partagé ne
 * signe rien ». Ce sont des affirmations sur le comportement du serveur, et la
 * seule façon honnête de les vérifier est de l'exécuter.
 *
 * Zéro dépendance : node:sqlite (Node 22+), rien à installer.
 * Sortie : 0 = tout vert · 1 = au moins un échec.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_SECRET = crypto.randomUUID() + crypto.randomUUID();
const SITE_PASSWORD = 'equipe-' + crypto.randomUUID().slice(0, 8);
const DAY = 86400000;

/* ── D1 → node:sqlite ─────────────────────────────────────────────────────── */
function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
  const prepare = (query) => {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = db.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: db.prepare(query).all(...args) }; },
      run() { const r = db.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
      _exec() { const r = db.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
    };
    return st;
  };
  return { prepare, batch(s) { return s.map((x) => x._exec()); }, _db: db };
}

const db = makeDB();

/* La boîte d'envoi : MAIL_WEBHOOK pointe ici, et on relit ce qui en sort. C'est
   ce qui permet de vérifier le parcours ENTIER d'une réinitialisation — jusqu'au
   lien réellement reçu par le client — au lieu de s'arrêter à « le serveur dit
   que c'est parti ». */
const outbox = [];
let mailUp = true;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('/__mail')) {
    if (!mailUp) return new Response('down', { status: 500 });
    outbox.push(JSON.parse(opts.body));
    return new Response('{}', { status: 200 });
  }
  return new Response('{}', { status: 200 });
};

const env = { DB: db, AUTH_SECRET, SITE_PASSWORD, MAIL_WEBHOOK: 'http://localhost/__mail' };

const lib = await import(path.join(ROOT, 'functions/auth/_lib.js'));
const R = {
  sales:   await import(path.join(ROOT, 'functions/api/admin/sales.js')),
  account: await import(path.join(ROOT, 'functions/api/admin/account.js')),
  reset:   await import(path.join(ROOT, 'functions/api/admin/reset.js')),
  audit:   await import(path.join(ROOT, 'functions/api/admin/audit.js')),
  authReset: await import(path.join(ROOT, 'functions/auth/reset.js')),
  feed:    await import(path.join(ROOT, 'functions/api/feed.js')),
  login:   await import(path.join(ROOT, 'functions/auth/login.js')),
  clients: await import(path.join(ROOT, 'functions/api/admin/clients.js')),
  config:  await import(path.join(ROOT, 'functions/api/admin/config.js')),
  pins:    await import(path.join(ROOT, 'functions/api/admin/pins.js')),
  operators: await import(path.join(ROOT, 'functions/api/admin/operators.js')),
  health: await import(path.join(ROOT, 'functions/api/admin/health.js')),
};

/* ── amorce ───────────────────────────────────────────────────────────────── */
const now = Date.now();
const acc = (id, email, business, ts) =>
  db.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .bind(id, email, email.split('@')[0], business, 'ff', 'ff', ts).run();

acc('acc-a', 'amira@kiwi.test', 'Amira Boutique', now - 300 * DAY);
acc('acc-b', 'rif@kiwi.test', 'Snack Rif', now - 100 * DAY);

const cfg = (m, aid, name, type) =>
  db.prepare('INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .bind(m, '{}', 'pro', type, aid, name, now).run();
/* Un compte, DEUX établissements — le cas qui rend la règle « jamais un autre
   établissement » testable au lieu d'être une intention. */
cfg('amira-boutique', 'acc-a', 'Amira Boutique', 'boutique');
cfg('amira-cafe', 'acc-a', 'Amira Café', 'cafe');
cfg('snack-rif', 'acc-b', 'Snack Rif', 'fastfood');

const sale = (id, m, amount, method, label, ref, ts, lines) =>
  db.prepare('INSERT INTO sales (id,merchant,amount,method,label,ref,ts,lines) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, m, amount, method, label, ref, ts, lines ? JSON.stringify(lines) : null).run();

const todayUTC = new Date(now).toISOString().slice(0, 10);
const yestTs = now - DAY;
const yestUTC = new Date(yestTs).toISOString().slice(0, 10);

sale('s-onboard', 'amira-boutique', 1, 'cash', 'Test', 'T-001-A7', now - 2 * 3600000, [{ n: 'Test', q: 1, t: 1 }]);
sale('s-basket', 'amira-boutique', 640, 'card', 'Caftan +2 art.', 'T-014-A7', now - 3 * 3600000,
     [{ n: 'Caftan coton', q: 1, t: 520, c: 'Prêt-à-porter' }, { n: 'Ceinture', q: 2, t: 120, c: 'Accessoires' }]);
sale('s-closed', 'amira-boutique', 300, 'cash', 'Vente', 'T-009-A7', yestTs, null);
sale('s-return', 'amira-boutique', 230, 'card', 'Retour · avoir AV-2031', 'T-031-A7', now - 4 * 3600000, null);
sale('s-plain', 'amira-boutique', 410, 'tap', 'Table 4', 'T-044-A7', now - 5 * 3600000, null);
sale('s-cafe', 'amira-cafe', 88, 'cash', 'Café', 'C-003-B2', now - 3600000, null);

/* Une journée CLÔTURÉE, telle que la caisse la pousse (store_docs/dayreports). */
db.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
  .bind('amira-boutique', 'dayreports', JSON.stringify({
    days: { [yestUTC]: { day: yestUTC, cutoff: 0, gross: 300, txns: 1, closedAt: yestTs + 3600000,
                         closedBy: 'Sara', closedCount: 1, refunds: { count: 1, amount: 230 } } },
  }), 1, now).run();

/* Un carnet clients, pour que l'aperçu ait une raison de parler de fidélité. */
db.prepare('INSERT INTO clients (merchant,id,name,points,spend,deleted,updated_ts,srv_ts) VALUES (?,?,?,?,?,?,?,?)')
  .bind('amira-boutique', 'c1', 'Lalla Khadija', 1240, 1240, 0, now, now).run();

/* Plusieurs UTILISATEURS sous un même commerce — le registre Équipe. */
db.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
  .bind('amira-boutique', 'team', JSON.stringify({ members: [
    { name: 'Sara Idrissi', role: 'Vendeuse', email: 'sara@amira.test' },
    { name: 'Nadia Alami', role: 'Manager', email: 'nadia@amira.test' },
  ] }), 1, now).run();

db.prepare('INSERT INTO operators (id,label,salt,hash,created_ts) VALUES (?,?,?,?,?)')
  .bind('op-1', 'Badr', 'ff', 'ff', now).run();

/* ── identités ────────────────────────────────────────────────────────────── */
const OP = await lib.operatorToken(AUTH_SECRET);
const OPID = await lib.operatorIdToken(AUTH_SECRET, 'op-1');
const GHOST_OPID = await lib.operatorIdToken(AUTH_SECRET, 'op-deleted');
const STAFF = await lib.staffToken(SITE_PASSWORD);
const SESS_A = await lib.makeSession('acc-a', AUTH_SECRET);

const AS = {
  /* Le code opérateur nommé — celui qui peut signer un geste. */
  operator: `kiwi_op=${OP}; kiwi_op_id=${OPID}`,
  /* Un DEUXIÈME appareil du même opérateur : mêmes droits, aucune mémoire
     locale partagée. C'est ce qui vérifie que l'historique vit au serveur. */
  operator2: `kiwi_op=${OP}; kiwi_op_id=${OPID}`,
  /* L'accès équipe partagé : il ouvre la console, il ne signe rien. */
  staff: `kiwi_gate=${STAFF}`,
  legacyOperator: `kiwi_op=${OP}`,
  deletedOperator: `kiwi_op=${OP}; kiwi_op_id=${GHOST_OPID}`,
  /* Un commerçant connecté — un client, un caissier, un gérant. */
  merchant: `kiwi_sess=${SESS_A}`,
  none: '',
};

async function call(mod, method, url, { as = 'operator', body } = {}) {
  const fn = mod['onRequest' + method[0] + method.slice(1).toLowerCase()];
  if (!fn) throw new Error('no handler ' + method);
  const req = new Request('https://kiwi.test' + url, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: AS[as] },
    body: (method === 'GET' || method === 'HEAD') ? null : JSON.stringify(body || {}),
  });
  const res = await fn({ env, request: req });
  let json = null;
  try { json = JSON.parse(await res.clone().text()); } catch (_) {}
  return { status: res.status, json, res };
}

/* ── le rapporteur ────────────────────────────────────────────────────────── */
let pass = 0, fail = 0;
let group = '';
function G(name) { group = name; console.log('\n\x1b[1m' + name + '\x1b[0m'); }
function ok(cond, label, detail) {
  if (cond) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + label); }
  else { fail++; console.log('  \x1b[31m✗\x1b[0m ' + label + (detail ? '\n      → ' + detail : '')); }
}

const feedFor = async (m, as = 'merchant') =>
  (await call(R.feed, 'GET', '/api/feed?merchant=' + m + '&since=0', { as })).json;

/* ═══ 1 · QUI A LE DROIT ═══════════════════════════════════════════════════ */
G('1 · Droits — un client, un caissier, un gérant n’entrent jamais');
{
  const anon = await call(R.sales, 'GET', '/api/admin/sales?merchant=amira-boutique', { as: 'none' });
  ok(anon.status === 403, 'sans cookie : 403 sur la recherche de ventes', 'reçu ' + anon.status);

  const merch = await call(R.sales, 'GET', '/api/admin/sales?merchant=amira-boutique', { as: 'merchant' });
  ok(merch.status === 403, 'session commerçant : 403 (une session client n’est pas un opérateur)', 'reçu ' + merch.status);

  const merchAcct = await call(R.account, 'GET', '/api/admin/account?merchant=amira-boutique', { as: 'merchant' });
  ok(merchAcct.status === 403, 'session commerçant : 403 sur les adresses e-mail', 'reçu ' + merchAcct.status);

  const merchReset = await call(R.reset, 'POST', '/api/admin/reset', { as: 'merchant', body: { accountId: 'acc-a' } });
  ok(merchReset.status === 403, 'session commerçant : 403 sur l’envoi de réinitialisation', 'reçu ' + merchReset.status);

  /* Le laissez-passer d'équipe : il regarde, il n'agit pas. */
  const staffRead = await call(R.sales, 'GET', '/api/admin/sales?merchant=amira-boutique', { as: 'staff' });
  ok(staffRead.status === 200, 'accès équipe : peut LIRE les ventes', 'reçu ' + staffRead.status);

  const staffWrite = await call(R.sales, 'POST', '/api/admin/sales',
    { as: 'staff', body: { merchant: 'amira-boutique', ids: ['s-onboard'], action: 'void', reason: 'onboarding' } });
  ok(staffWrite.status === 403 && staffWrite.json.error === 'operator-code-required',
    'accès équipe : REFUSÉ à l’écriture (un secret partagé ne signe pas un geste)', JSON.stringify(staffWrite.json));

  const staffMail = await call(R.account, 'PUT', '/api/admin/account',
    { as: 'staff', body: { accountId: 'acc-a', email: 'x@y.ma', reason: 'test' } });
  ok(staffMail.status === 403, 'accès équipe : REFUSÉ au changement d’adresse', 'reçu ' + staffMail.status);

  const staffConfigRead = await call(R.config, 'GET', '/api/admin/config?merchant=amira-boutique', { as: 'staff' });
  ok(staffConfigRead.status === 200, 'accès équipe : peut lire la configuration');
  const staffConfigWrite = await call(R.config, 'PUT', '/api/admin/config',
    { as: 'staff', body: { merchant:'amira-boutique', features:{ conformite:false }, plan:'pro' } });
  ok(staffConfigWrite.status === 403 && staffConfigWrite.json.error === 'operator-code-required',
    'accès équipe : REFUSÉ à la modification des modules');

  const staffPinWrite = await call(R.pins, 'POST', '/api/admin/pins',
    { as:'staff', body:{ merchant:'amira-boutique', pin:'7788', name:'Test', role:'caisse' } });
  ok(staffPinWrite.status === 403 && staffPinWrite.json.error === 'operator-code-required',
    'accès équipe : REFUSÉ à la création d’un PIN');

  const staffSuspend = await call(R.clients, 'PATCH', '/api/admin/clients',
    { as:'staff', body:{ email:'amira@kiwi.test', status:'suspended' } });
  ok(staffSuspend.status === 403 && staffSuspend.json.error === 'operator-code-required',
    'accès équipe : REFUSÉ à la suspension d’un client');
  ok(db.prepare('SELECT status FROM accounts WHERE id = ?').bind('acc-a').first().status === 'active',
    '…et le compte est resté actif');

  const staffPromote = await call(R.operators, 'POST', '/api/admin/operators',
    { as:'staff', body:{ label:'Intrus', code:'1234567890' } });
  ok(staffPromote.status === 403 && staffPromote.json.error === 'operator-code-required',
    'accès équipe : ne peut pas se promouvoir en opérateur nommé');

  const legacy = await call(R.sales, 'GET', '/api/admin/sales?merchant=amira-boutique', { as:'legacyOperator' });
  ok(legacy.status === 403, 'ancien cookie opérateur sans identité : révoqué');
  const deleted = await call(R.sales, 'GET', '/api/admin/sales?merchant=amira-boutique', { as:'deletedOperator' });
  ok(deleted.status === 403, 'cookie d’un opérateur absent de la base : révoqué');
}

/* ═══ 2 · RECHERCHE ════════════════════════════════════════════════════════ */
G('2 · Recherche — par client, date, montant, moyen, référence');
{
  const all = await call(R.sales, 'GET', '/api/admin/sales?merchant=amira-boutique&state=all');
  ok(all.json.sales.length === 5, 'les 5 ventes de la boutique, et rien du café', 'n=' + all.json.sales.length);
  ok(!all.json.sales.some((s) => s.id === 's-cafe'), 'la vente du café n’apparaît pas dans la boutique');

  const byRef = await call(R.sales, 'GET', '/api/admin/sales?merchant=amira-boutique&q=T-014');
  ok(byRef.json.sales.length === 1 && byRef.json.sales[0].id === 's-basket', 'par numéro de ticket');

  const byAmount = await call(R.sales, 'GET', '/api/admin/sales?merchant=amira-boutique&min=600&max=700');
  ok(byAmount.json.sales.length === 1 && byAmount.json.sales[0].id === 's-basket', 'par montant');

  const byMethod = await call(R.sales, 'GET', '/api/admin/sales?merchant=amira-boutique&method=tap');
  ok(byMethod.json.sales.length === 1 && byMethod.json.sales[0].id === 's-plain', 'par moyen de paiement');

  const byDate = await call(R.sales, 'GET',
    '/api/admin/sales?merchant=amira-boutique&from=' + (now - 6 * 3600000) + '&to=' + now);
  ok(!byDate.json.sales.some((s) => s.id === 's-closed'), 'par plage de dates (la vente d’hier est exclue)');

  const basket = all.json.sales.find((s) => s.id === 's-basket');
  ok(basket.lines && basket.lines.length === 2 && basket.lines[0].name === 'Caftan coton',
    'la transaction complète est lisible avant d’agir (panier détaillé)');
  ok(all.json.sales.find((s) => s.id === 's-return').returnish === true,
    'un libellé de retour est signalé comme tel');
}

/* ═══ 3 · APERÇU DES CONSÉQUENCES ══════════════════════════════════════════ */
G('3 · Conséquences — ce que ça retire, et ce que ça ne retire pas');
{
  const i = (await call(R.sales, 'GET',
    '/api/admin/sales?impact=1&merchant=amira-boutique&ids=s-basket')).json;
  ok(i.totals.amount === 640 && i.totals.count === 1, 'CA et nombre de ventes annoncés');
  ok(i.methods.card === 640, 'répartition des encaissements annoncée');
  ok(i.stock.length === 2 && i.stock[0].qty === 1 && i.stock[1].qty === 2,
    'les mouvements de stock à reprendre sont listés (2 lignes)');
  ok(i.loyalty && i.loyalty.clients === 1,
    'la fidélité est signalée quand le commerce tient un carnet');
  ok(i.manual.includes('stock') && i.manual.includes('loyalty'),
    'stock et fidélité sont annoncés comme NON automatiques');
  ok(i.auto.includes('revenue') && i.auto.includes('products') && i.auto.includes('exports'),
    'CA, classement produits et exports sont annoncés comme automatiques');

  const ret = (await call(R.sales, 'GET',
    '/api/admin/sales?impact=1&merchant=amira-boutique&ids=s-return')).json;
  ok(ret.warnings.some((w) => w.code === 'return'),
    'une transaction qui ressemble à un retour déclenche un avertissement');

  const closed = (await call(R.sales, 'GET',
    '/api/admin/sales?impact=1&merchant=amira-boutique&ids=s-closed')).json;
  ok(closed.blockers.some((b) => b.code === 'day-closed'),
    'une vente dans une journée clôturée déclenche un BLOCAGE');
  ok(closed.days.some((d) => d.closed && d.closedBy === 'Sara'),
    'le blocage nomme la journée et qui l’a clôturée');
  ok(closed.warnings.some((w) => w.code === 'day-refunds'),
    'la journée contenant un remboursement est signalée');
}

/* ═══ 4 · JAMAIS UN AUTRE ÉTABLISSEMENT ════════════════════════════════════ */
G('4 · Cloisonnement — deux établissements d’un MÊME compte ne se touchent pas');
{
  const cross = await call(R.sales, 'POST', '/api/admin/sales',
    { body: { merchant: 'amira-boutique', ids: ['s-cafe'], action: 'void', reason: 'onboarding' } });
  ok(cross.status === 409 && cross.json.error === 'foreign-sale',
    'sortir la vente du café depuis le panneau de la boutique : REFUSÉ', JSON.stringify(cross.json));

  const mixed = await call(R.sales, 'POST', '/api/admin/sales',
    { body: { merchant: 'amira-boutique', ids: ['s-plain', 's-cafe'], action: 'void', reason: 'onboarding' } });
  ok(mixed.status === 409, 'un lot mélangeant deux magasins est refusé EN ENTIER');
  const still = db.prepare('SELECT void_ts FROM sales WHERE id = ?').bind('s-plain').first();
  ok(!still.void_ts, '…et la vente légitime du lot n’a pas été touchée non plus');

  const impactCross = await call(R.sales, 'GET',
    '/api/admin/sales?impact=1&merchant=amira-boutique&ids=s-cafe');
  ok(impactCross.status === 409, 'même l’APERÇU refuse une vente d’un autre établissement');
}

/* ═══ 5 · LE MOTIF EST IMPOSÉ ══════════════════════════════════════════════ */
G('5 · Motif — imposé par le serveur, pas seulement par l’écran');
{
  const noReason = await call(R.sales, 'POST', '/api/admin/sales',
    { body: { merchant: 'amira-boutique', ids: ['s-onboard'], action: 'void' } });
  ok(noReason.status === 400 && noReason.json.error === 'reason-required', 'sans motif : refusé');

  const badReason = await call(R.sales, 'POST', '/api/admin/sales',
    { body: { merchant: 'amira-boutique', ids: ['s-onboard'], action: 'void', reason: 'parce-que' } });
  ok(badReason.status === 400, 'un motif inventé est refusé (la liste est fermée)');

  const otherNoNote = await call(R.sales, 'POST', '/api/admin/sales',
    { body: { merchant: 'amira-boutique', ids: ['s-onboard'], action: 'void', reason: 'autre' } });
  ok(otherNoNote.status === 400 && otherNoNote.json.error === 'note-required',
    '« Autre » sans explication écrite : refusé');
}

/* ═══ 6 · SORTIR, PUIS REMETTRE ════════════════════════════════════════════ */
G('6 · Une vente d’onboarding — sortie des livres, puis remise');
{
  const before = await feedFor('amira-boutique');
  const beforeTotal = before.sales.reduce((a, s) => a + s.amount, 0);
  ok(before.sales.some((s) => s.id === 's-onboard'), 'avant : la vente de test est dans le flux');

  const out = await call(R.sales, 'POST', '/api/admin/sales',
    { body: { merchant: 'amira-boutique', ids: ['s-onboard'], action: 'void', reason: 'onboarding' } });
  ok(out.status === 200 && out.json.ok, 'sortie acceptée');
  ok(out.json.journal === true, 'la trace est écrite');

  const after = await feedFor('amira-boutique');
  ok(!after.sales.some((s) => s.id === 's-onboard'), 'après : elle a quitté le flux');
  ok(after.sales.reduce((a, s) => a + s.amount, 0) === beforeTotal - 1,
    'le chiffre d’affaires a baissé du montant exact');
  ok(after.voided.some((v) => v.r === 'T-001-A7'),
    'la liste de retrait porte la référence du ticket (pour la caisse)');
  ok(after.voided.some((v) => v.c), 'la liste de retrait porte le curseur (pour le tableau de bord)');

  /* La LIGNE est toujours là — c'est toute la différence avec une suppression. */
  const row = db.prepare('SELECT amount, lines, void_reason, void_actor FROM sales WHERE id = ?')
    .bind('s-onboard').first();
  ok(row && row.amount === 1, 'la vente n’est PAS supprimée : le montant est toujours en base');
  ok(row.void_reason === 'onboarding' && row.void_actor === 'Badr',
    'le motif et l’auteur sont inscrits sur la ligne');

  const again = await call(R.sales, 'POST', '/api/admin/sales',
    { body: { merchant: 'amira-boutique', ids: ['s-onboard'], action: 'void', reason: 'doublon' } });
  ok(again.status === 409 && again.json.error === 'already-void', 'la sortir deux fois : refusé');

  const back = await call(R.sales, 'POST', '/api/admin/sales',
    { body: { merchant: 'amira-boutique', ids: ['s-onboard'], action: 'restore' } });
  ok(back.status === 200, 'remise dans les livres acceptée');

  const restored = await feedFor('amira-boutique');
  ok(restored.sales.some((s) => s.id === 's-onboard'), 'la vente est revenue dans le flux');
  ok(restored.sales.reduce((a, s) => a + s.amount, 0) === beforeTotal,
    'le chiffre d’affaires est revenu à l’identique');
  const rl = restored.sales.find((s) => s.id === 's-onboard');
  ok(rl.lines && rl.lines.length === 1, '…avec son panier intact');
}

/* ═══ 7 · LA JOURNÉE CLÔTURÉE ══════════════════════════════════════════════ */
G('7 · Journée clôturée — refus, puis passage explicite');
{
  const blocked = await call(R.sales, 'POST', '/api/admin/sales',
    { body: { merchant: 'amira-boutique', ids: ['s-closed'], action: 'void', reason: 'formation' } });
  ok(blocked.status === 409 && blocked.json.error === 'blocked',
    'sans confirmation : refusé, avec les conséquences en retour');
  ok(blocked.json.impact.blockers.length > 0, 'la réponse porte le détail du blocage');
  const untouched = db.prepare('SELECT void_ts FROM sales WHERE id = ?').bind('s-closed').first();
  ok(!untouched.void_ts, '…et rien n’a été touché');

  const forced = await call(R.sales, 'POST', '/api/admin/sales',
    { body: { merchant: 'amira-boutique', ids: ['s-closed'], action: 'void', reason: 'formation', force: true } });
  ok(forced.status === 200, 'avec confirmation explicite : accepté');

  const j = db.prepare('SELECT impact FROM sale_audit WHERE sale_id = ? ORDER BY id DESC LIMIT 1')
    .bind('s-closed').first();
  ok(JSON.parse(j.impact).forced === true, 'le journal retient que le geste a été FORCÉ');

  await call(R.sales, 'POST', '/api/admin/sales',
    { body: { merchant: 'amira-boutique', ids: ['s-closed'], action: 'restore' } });
}

/* ═══ 8 · LE JOURNAL ═══════════════════════════════════════════════════════ */
G('8 · Historique — la transaction, le client, l’auteur, l’heure, le motif');
{
  const a = (await call(R.audit, 'GET', '/api/admin/audit?merchant=amira-boutique')).json.entries;
  const voids = a.filter((e) => e.kind === 'sale');
  ok(voids.length >= 4, 'toutes les sorties ET les remises sont inscrites', 'n=' + voids.length);
  const one = voids.find((e) => e.sale_id === 's-onboard' && e.action === 'void');
  ok(one && one.amount === 1 && one.ref === 'T-001-A7' && one.sale_ts,
    'la transaction d’origine est recopiée (montant, ticket, date)');
  ok(one.reason === 'onboarding', 'le motif est là');
  ok(one.actor === 'Badr', 'l’administrateur responsable est nommé');
  ok(one.ts > 0, 'la date et l’heure sont là');
  ok(voids.some((e) => e.sale_id === 's-onboard' && e.action === 'restore'),
    'la remise est inscrite AUSSI (le journal ne s’efface pas quand on annule l’annulation)');

  /* Un DEUXIÈME appareil, rien en commun sauf le serveur. */
  const other = (await call(R.audit, 'GET', '/api/admin/audit?merchant=amira-boutique',
    { as: 'operator2' })).json.entries;
  ok(other.length === a.length, 'le même historique s’ouvre depuis un autre appareil autorisé');

  const denied = await call(R.audit, 'GET', '/api/admin/audit?merchant=amira-boutique', { as: 'merchant' });
  ok(denied.status === 403, 'un commerçant ne lit pas l’historique administratif');
}

/* ═══ 9 · ADRESSES E-MAIL ══════════════════════════════════════════════════ */
G('9 · Adresses — voir, distinguer, corriger');
{
  const v = (await call(R.account, 'GET', '/api/admin/account?merchant=amira-boutique')).json;
  ok(v.account && v.account.login === 'amira@kiwi.test', 'l’adresse de CONNEXION est lisible');
  ok(v.account.contact === '' && v.account.billing === '',
    'contact et facturation sont distincts, et vides = « la même que la connexion »');
  ok(v.stores.length === 2, 'les deux établissements du compte sont listés');
  ok(v.team.length === 2 && v.team.some((t) => t.email === 'nadia@amira.test'),
    'les adresses des utilisateurs (propriétaire, manager, salariés) sont visibles');
  ok(v.verification === 'immediate', 'la console sait dire si une vérification est nécessaire');

  const taken = await call(R.account, 'PUT', '/api/admin/account',
    { body: { accountId: 'acc-a', field: 'login', email: 'rif@kiwi.test', reason: 'saisie erronée' } });
  ok(taken.status === 409 && taken.json.error === 'email-taken',
    'une adresse qui appartient déjà à un autre compte : REFUSÉE');
  ok(taken.json.business === 'Snack Rif', '…en nommant le commerce concerné');
  const unchanged = db.prepare('SELECT email FROM accounts WHERE id = ?').bind('acc-a').first();
  ok(unchanged.email === 'amira@kiwi.test', '…et rien n’a changé');

  const noReason = await call(R.account, 'PUT', '/api/admin/account',
    { body: { accountId: 'acc-a', field: 'login', email: 'amira.b@kiwi.test' } });
  ok(noReason.status === 400 && noReason.json.error === 'reason-required', 'sans motif : refusé');

  outbox.length = 0;
  const fix = await call(R.account, 'PUT', '/api/admin/account',
    { body: { accountId: 'acc-a', field: 'login', email: 'amira.b@kiwi.test',
              reason: 'adresse mal saisie à l’inscription', merchant: 'amira-boutique' } });
  ok(fix.status === 200, 'correction d’une adresse de connexion mal saisie : acceptée');
  ok(outbox.length === 2, 'DEUX messages partent : l’ancienne adresse et la nouvelle', 'n=' + outbox.length);
  ok(outbox.some((m) => m.to === 'amira@kiwi.test'), '…un avis à l’ancienne adresse');
  ok(outbox.some((m) => m.to === 'amira.b@kiwi.test'), '…une confirmation à la nouvelle');
  ok(!outbox.some((m) => /mot de passe.{0,20}:/i.test(m.text) && /[a-f0-9]{16}/.test(m.text)),
    'aucun message ne transporte de mot de passe ni de jeton');

  /* Rien ne doit casser. Ce sont des propriétés du schéma, on les vérifie. */
  const accs = db.prepare('SELECT COUNT(*) AS n FROM accounts').all().results[0];
  ok(accs.n === 2, 'aucun second compte n’a été créé');
  const owned = db.prepare('SELECT COUNT(*) AS n FROM merchant_config WHERE account_id = ?').bind('acc-a').all().results[0];
  ok(owned.n === 2, 'le client tient toujours ses deux établissements');
  const sess = await lib.readSession(SESS_A, AUTH_SECRET);
  ok(sess && sess.aid === 'acc-a', 'la session du client reste valable (elle porte l’identifiant, pas l’adresse)');
  const salesStill = db.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant = ?').bind('amira-boutique').all().results[0];
  ok(salesStill.n === 5, 'ses ventes sont intactes');

  const hist = (await call(R.audit, 'GET', '/api/admin/audit?merchant=amira-boutique')).json.entries;
  const em = hist.find((e) => e.kind === 'account' && e.action === 'email');
  ok(em && em.prev === 'amira@kiwi.test' && em.next === 'amira.b@kiwi.test',
    'le journal porte l’ancienne ET la nouvelle adresse');
  ok(em.reason === 'adresse mal saisie à l’inscription' && em.actor === 'Badr',
    '…le motif et l’administrateur responsable');
  ok(JSON.parse(em.detail).delivery.old === 'sent', '…et l’état d’envoi');

  /* Reprise contrôlée. */
  const rev = await call(R.account, 'PUT', '/api/admin/account',
    { body: { accountId: 'acc-a', field: 'login', revert: true, reason: 'le client conteste', merchant: 'amira-boutique' } });
  ok(rev.status === 200 && rev.json.next === 'amira@kiwi.test',
    'reprise contrôlée : l’adresse précédente est rétablie sans la retaper');
  const backNow = db.prepare('SELECT email FROM accounts WHERE id = ?').bind('acc-a').first();
  ok(backNow.email === 'amira@kiwi.test', '…et c’est bien elle en base');

  const contact = await call(R.account, 'PUT', '/api/admin/account',
    { body: { accountId: 'acc-a', field: 'contact', email: 'compta@amira.test', reason: 'demande du client' } });
  ok(contact.status === 200, 'l’adresse de contact se corrige séparément');
  const login2 = db.prepare('SELECT email, contact_email FROM accounts WHERE id = ?').bind('acc-a').first();
  ok(login2.email === 'amira@kiwi.test' && login2.contact_email === 'compta@amira.test',
    '…sans toucher à l’adresse de connexion');
}

/* ═══ 10 · RÉINITIALISATION ════════════════════════════════════════════════ */
G('10 · Mot de passe — envoyer, renvoyer, une seule fois, expirer');
{
  outbox.length = 0;
  const s1 = await call(R.reset, 'POST', '/api/admin/reset', { body: { accountId: 'acc-a', merchant: 'amira-boutique' } });
  ok(s1.status === 200 && s1.json.ok, 'l’envoi est accepté');
  ok(s1.json.to === lib.maskEmail('amira@kiwi.test') && s1.json.to.includes('•'),
    'la console voit l’adresse MASQUÉE : ' + s1.json.to);
  ok(!JSON.stringify(s1.json).includes('reset.html?token='),
    'le lien n’est JAMAIS renvoyé à l’opérateur');
  ok(outbox.length === 1 && outbox[0].to === 'amira@kiwi.test', 'le message part au client');

  const link = (outbox[0].text.match(/https?:\/\/\S+/) || [])[0];
  const token = decodeURIComponent(new URL(link).searchParams.get('token'));
  ok(!!token, 'le message contient bien un lien');

  const jr = db.prepare(`SELECT next, detail FROM account_audit WHERE action='reset' ORDER BY id DESC LIMIT 1`).first();
  ok(jr.next.includes('•'), 'le journal note l’adresse masquée');
  ok(!jr.detail.includes(token) && !jr.next.includes(token),
    'le journal ne contient PAS le lien ni le jeton');

  const s2 = await call(R.reset, 'POST', '/api/admin/reset', { body: { accountId: 'acc-a' } });
  ok(s2.status === 429 && s2.json.error === 'too-soon', 'un renvoi immédiat est refusé (anti-spam)');
  ok(s2.json.retryAfter > 0, '…en disant quand le prochain envoi sera possible : ' + s2.json.retryAfter + ' s');

  const st = (await call(R.reset, 'GET', '/api/admin/reset?accountId=acc-a')).json;
  ok(st.lastSent > 0 && st.live === true, 'la console voit le dernier envoi et qu’un lien est vivant');

  /* Le lien vaut, et ne vaut qu'une fois. */
  const chk = (await call(R.authReset, 'GET', '/auth/reset?token=' + encodeURIComponent(token), { as: 'none' })).json;
  ok(chk.valid === true, 'le lien est valide avant usage');

  const weak = await call(R.authReset, 'POST', '/auth/reset', { as: 'none', body: { token, password: 'court' } });
  ok(weak.status === 400 && weak.json.error === 'weak', 'un mot de passe trop court est refusé');

  const used = await call(R.authReset, 'POST', '/auth/reset', { as: 'none', body: { token, password: 'nouveau-mot-de-passe' } });
  ok(used.status === 200 && used.json.ok, 'le client choisit son nouveau mot de passe');
  ok(/kiwi_sess=/.test(used.res.headers.get('Set-Cookie') || ''),
    '…et repart connecté, dans le parcours Kiwi normal');

  const twice = await call(R.authReset, 'POST', '/auth/reset', { as: 'none', body: { token, password: 'encore-un-autre' } });
  ok(twice.status === 400 && twice.json.error === 'invalid', 'le MÊME lien ne fonctionne pas une deuxième fois');

  const chk2 = (await call(R.authReset, 'GET', '/auth/reset?token=' + encodeURIComponent(token), { as: 'none' })).json;
  ok(chk2.valid === false && chk2.reason === 'invalid', 'et il se déclare invalide');

  /* Le nouveau mot de passe fonctionne vraiment — c'est la seule preuve qui compte. */
  const login = await call(R.login, 'POST', '/auth/login',
    { as: 'none', body: { email: 'amira@kiwi.test', password: 'nouveau-mot-de-passe' } });
  ok(login.status === 200, 'le client se connecte avec son nouveau mot de passe');

  const oldPw = await call(R.login, 'POST', '/auth/login',
    { as: 'none', body: { email: 'amira@kiwi.test', password: 'ancien' } });
  ok(oldPw.status !== 200, 'l’ancien ne fonctionne plus');

  const done = db.prepare(`SELECT detail FROM account_audit WHERE action='reset' ORDER BY id DESC LIMIT 1`).first();
  ok(JSON.parse(done.detail).completed === true, 'le journal sait que la réinitialisation a ABOUTI');

  /* Expiration. */
  db.prepare('INSERT INTO reset_tokens (selector,account_id,verifier,created_ts,expires_ts,used_ts,actor,actor_id) VALUES (?,?,?,?,?,NULL,?,?)')
    .bind('expired1', 'acc-a', await lib.resetVerifierHash(AUTH_SECRET, 'vvvvvvvvvvvv'),
          now - 2 * 3600000, now - 3600000, 'Badr', 'op-1').run();
  const exp = (await call(R.authReset, 'GET', '/auth/reset?token=expired1.vvvvvvvvvvvv', { as: 'none' })).json;
  ok(exp.valid === false, 'un lien expiré est refusé');

  const forged = (await call(R.authReset, 'GET', '/auth/reset?token=expired1.jesuisunfaux', { as: 'none' })).json;
  ok(forged.valid === false && forged.reason === 'invalid',
    'un jeton falsifié est refusé — et avec le MÊME message qu’un lien expiré (aucun oracle)');

  const nobody = (await call(R.authReset, 'GET', '/auth/reset?token=inexistant.jamaisvu', { as: 'none' })).json;
  ok(nobody.reason === exp.reason,
    'un selector inexistant répond exactement comme un lien réel expiré');

  /* Chaque envoi périme le précédent. */
  db.prepare('UPDATE reset_tokens SET created_ts = ? WHERE account_id = ?').bind(now - 3600000, 'acc-b').run();
  outbox.length = 0;
  const b1 = await call(R.reset, 'POST', '/api/admin/reset', { body: { accountId: 'acc-b' } });
  const t1 = decodeURIComponent(new URL((outbox[0].text.match(/https?:\/\/\S+/) || [])[0]).searchParams.get('token'));
  db.prepare('UPDATE reset_tokens SET created_ts = ? WHERE account_id = ?').bind(now - 3600000, 'acc-b').run();
  outbox.length = 0;
  await call(R.reset, 'POST', '/api/admin/reset', { body: { accountId: 'acc-b' } });
  const chkOld = (await call(R.authReset, 'GET', '/auth/reset?token=' + encodeURIComponent(t1), { as: 'none' })).json;
  ok(b1.status === 200 && chkOld.valid === false,
    'un nouvel envoi périme le lien précédent (une seule clé vivante)');

  /* Sans sortie e-mail : on ne fabrique rien. */
  mailUp = false;
  db.prepare('UPDATE reset_tokens SET created_ts = ? WHERE account_id = ?').bind(now - 3600000, 'acc-b').run();
  const beforeN = db.prepare('SELECT COUNT(*) AS n FROM reset_tokens').all().results[0].n;
  const failed = await call(R.reset, 'POST', '/api/admin/reset', { body: { accountId: 'acc-b' } });
  const afterN = db.prepare('SELECT COUNT(*) AS n FROM reset_tokens').all().results[0].n;
  ok(failed.status === 502 && failed.json.error === 'send-failed',
    'un envoi qui échoue est signalé comme tel, pas comme un succès');
  ok(afterN === beforeN, '…et le jeton mort-né est retiré (l’état affiché reste vrai)');
  mailUp = true;

  const noMailEnv = { ...env, MAIL_WEBHOOK: '' };
  const r = await R.reset.onRequestPost({ env: noMailEnv, request: new Request('https://kiwi.test/api/admin/reset',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: AS.operator },
      body: JSON.stringify({ accountId: 'acc-b' }) }) });
  ok(r.status === 503, 'sans MAIL_WEBHOOK configuré : refus honnête, aucun lien créé');
}

/* ═══ 11 · LA CAISSE ET LE TABLEAU DE BORD ═════════════════════════════════ */
G('11 · Le retrait atteint tous les appareils');
{
  await call(R.sales, 'POST', '/api/admin/sales',
    { body: { merchant: 'amira-boutique', ids: ['s-plain'], action: 'void', reason: 'installation' } });

  const dash = await feedFor('amira-boutique');
  ok(!dash.sales.some((s) => s.id === 's-plain'), 'tableau de bord : la vente a disparu du flux');
  ok(dash.voided.some((v) => v.r === 'T-044-A7' && v.c),
    'tableau de bord : la liste de retrait porte curseur + référence');

  /* La caisse ne demande QUE les retraits — requête minuscule, pas de rejeu. */
  const till = (await call(R.feed, 'GET', '/api/feed?voids=1&merchant=amira-boutique', { as: 'merchant' })).json;
  ok(till.sales.length === 0, 'caisse : le sondage « retraits seuls » ne rejoue aucune vente');
  ok(till.voided.some((v) => v.r === 'T-044-A7'),
    'caisse : elle reçoit la référence de ticket, la seule clé qu’elle connaît');

  /* Une caisse qui rejoue sa file hors-ligne ne doit pas ressusciter la vente. */
  const saleMod = await import(path.join(ROOT, 'functions/api/sale.js'));
  await saleMod.onRequestPost({ env, request: new Request('https://kiwi.test/api/sale',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: AS.merchant },
      body: JSON.stringify({ id: 's-plain', merchant: 'amira-boutique', amount: 410, method: 'tap', ref: 'T-044-A7' }) }) });
  const after = await feedFor('amira-boutique');
  ok(!after.sales.some((s) => s.id === 's-plain'),
    'une caisse qui rejoue sa file hors-ligne ne ressuscite pas la vente retirée');

  await call(R.sales, 'POST', '/api/admin/sales',
    { body: { merchant: 'amira-boutique', ids: ['s-plain'], action: 'restore' } });
}

/* ═══ 12 · BASE PAS ENCORE MIGRÉE ══════════════════════════════════════════ */
G('12 · Base pas migrée — le produit reste debout');
{
  /* La vraie forme d'avant : `lines` est là (cette migration-là est ancienne),
     les colonnes d'annulation non. C'est l'état exact de la base de production
     tant que le partenaire n'a pas relancé schema.sql. */
  const old = makeDB();
  old.prepare('INSERT INTO operators (id,label,salt,hash,created_ts) VALUES (?,?,?,?,?)')
    .bind('op-1', 'Badr', 'ff', 'ff', now).run();
  old._db.exec('DROP TABLE sales');
  old._db.exec('CREATE TABLE sales (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, amount INTEGER NOT NULL, method TEXT NOT NULL, label TEXT, ref TEXT, ts INTEGER NOT NULL, lines TEXT)');
  old.prepare('INSERT INTO sales (id,merchant,amount,method,label,ref,ts,lines) VALUES (?,?,?,?,?,?,?,?)')
    .bind('x1', 'amira-boutique', 100, 'cash', 'V', 'R1', now, null).run();
  const oldEnv = { DB: old, AUTH_SECRET };

  /* …et la forme préhistorique, sans `lines` non plus : la console doit encore
     tenir debout, sans le détail des paniers. */
  const ancient = makeDB();
  ancient.prepare('INSERT INTO operators (id,label,salt,hash,created_ts) VALUES (?,?,?,?,?)')
    .bind('op-1', 'Badr', 'ff', 'ff', now).run();
  ancient._db.exec('DROP TABLE sales');
  ancient._db.exec('CREATE TABLE sales (id TEXT PRIMARY KEY, merchant TEXT NOT NULL, amount INTEGER NOT NULL, method TEXT NOT NULL, label TEXT, ref TEXT, ts INTEGER NOT NULL)');
  ancient.prepare('INSERT INTO sales (id,merchant,amount,method,label,ref,ts) VALUES (?,?,?,?,?,?,?)')
    .bind('y1', 'amira-boutique', 70, 'cash', 'V', 'R2', now).run();

  const f = await R.feed.onRequestGet({ env: oldEnv, request: new Request(
    'https://kiwi.test/api/feed?merchant=amira-boutique&since=0',
    { headers: { Cookie: AS.operator } }) });
  const fj = JSON.parse(await f.text());
  ok(fj.sales.length === 1, 'le flux sert toujours les ventes (un tableau de bord vide serait une panne)');

  const s = await R.sales.onRequestGet({ env: oldEnv, request: new Request(
    'https://kiwi.test/api/admin/sales?merchant=amira-boutique',
    { headers: { Cookie: AS.operator } }) });
  const sj = JSON.parse(await s.text());
  ok(sj.migration === 'needed', 'la console peut chercher, et DIT que la migration manque');

  const w = await R.sales.onRequestPost({ env: oldEnv, request: new Request(
    'https://kiwi.test/api/admin/sales',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: AS.operator },
      body: JSON.stringify({ merchant: 'amira-boutique', ids: ['x1'], action: 'void', reason: 'onboarding' }) }) });
  ok(w.status === 503, 'et elle refuse d’annuler plutôt que d’échouer en silence');

  const a = await R.sales.onRequestGet({ env: { DB: ancient, AUTH_SECRET }, request: new Request(
    'https://kiwi.test/api/admin/sales?merchant=amira-boutique',
    { headers: { Cookie: AS.operator } }) });
  const aj = JSON.parse(await a.text());
  ok(aj.sales && aj.sales.length === 1 && aj.migration === 'needed',
    'même sans la colonne `lines`, la recherche répond (sans le détail des paniers)');
}

/* ═══ 13 · DIAGNOSTIC SUPPORT ═════════════════════════════════════════════ */
G('13 · Diagnostic — factuel, cloisonné, explicite si la base manque');
{
  const h = await call(R.health, 'GET', '/api/admin/health?merchant=amira-boutique');
  ok(h.status === 200 && h.json.merchant === 'amira-boutique', 'le dossier du magasin demandé est lisible');
  ok(h.json.sales && h.json.sales.total === 5 && h.json.sales.last_24h === 4,
    'le battement ventes vient des lignes réelles, sans celles de l’autre établissement');
  ok(h.json.documents && h.json.documents.total === 2 && h.json.customers.total === 1,
    'documents cloud et carnet clients sont comptés sans exposer leur contenu');

  const noAuth = await R.health.onRequestGet({ env, request: new Request(
    'https://kiwi.test/api/admin/health?merchant=amira-boutique') });
  ok(noAuth.status === 403, 'un commerçant sans droit opérateur ne lit pas le diagnostic support');

  const old = makeDB();
  old.prepare('INSERT INTO operators (id,label,salt,hash,created_ts) VALUES (?,?,?,?,?)')
    .bind('op-1', 'Badr', 'ff', 'ff', now).run();
  old._db.exec('DROP TABLE channel_links');
  const degraded = await R.health.onRequestGet({ env:{ DB:old, AUTH_SECRET }, request:new Request(
    'https://kiwi.test/api/admin/health?merchant=amira-boutique', { headers:{ Cookie:AS.operator } }) });
  const degradedJson = JSON.parse(await degraded.text());
  ok(degraded.status === 200 && degradedJson.missing.some((x) => x.area === 'channels'),
    'une migration absente est nommée, jamais présentée comme zéro canal');
}

/* ═══ 14 · MUTATIONS DANGEREUSES ET RÉVOCATION ════════════════════════════ */
G('14 · Révocation — supprimer un droit coupe vraiment la session');
{
  const del = await call(R.clients, 'DELETE',
    '/api/admin/clients?merchant=amira-boutique&email=amira%40kiwi.test');
  ok(del.status === 423 && del.json.error === 'account-deletion-disabled',
    'suppression de compte bloquée tant que l’effacement complet n’existe pas');
  ok(!!db.prepare('SELECT id FROM accounts WHERE id = ?').bind('acc-a').first(),
    '…et le compte ainsi que ses données sont restés en place');

  const before = await lib.isSeniorOperator(new Request('https://kiwi.test/',
    { headers:{ Cookie:AS.operator } }), env);
  ok(before === true, 'la session de l’opérateur vivant est reconnue');

  const removed = await call(R.operators, 'DELETE', '/api/admin/operators?id=op-1');
  ok(removed.status === 200, 'l’opérateur peut révoquer son code');
  const after = await lib.isSeniorOperator(new Request('https://kiwi.test/',
    { headers:{ Cookie:AS.operator } }), env);
  ok(after === false, 'la session déjà ouverte est révoquée immédiatement');
}

/* ── verdict ──────────────────────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(64));
console.log(fail === 0
  ? `\x1b[32m✓ ${pass} contrôles passés.\x1b[0m`
  : `\x1b[31m✗ ${fail} échec(s) sur ${pass + fail}.\x1b[0m`);
process.exit(fail ? 1 : 0);
