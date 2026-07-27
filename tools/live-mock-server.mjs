#!/usr/bin/env node
/* Kiwi — banc d'essai local de la console opérateur.
 *
 *   node tools/live-mock-server.js        →  http://localhost:4181
 *
 * Sert le dépôt ET fait tourner les VRAIES Pages Functions (functions/api/*.js)
 * contre une base SQLite en mémoire chargée depuis schema.sql. Ce n'est donc pas
 * un faux backend qui imite les réponses : c'est le code qui part en production,
 * exécuté ici, ce qui est la seule façon de vérifier une règle comme « un
 * établissement neuf naît avec cinq modules coupés, un client existant n'est
 * jamais touché » sans déployer.
 *
 * Ce qu'on peut ouvrir :
 *   /kiwi-admin.html                   la console, en mode « Live · D1 »
 *   /dashboard.html                    le tableau de bord du client d'AVANT
 *   /dashboard.html?merchant=snack-rif un client créé APRÈS la bascule
 *   /kiwi-caisse.html                  la caisse (pastille Order Pro, PINs)
 *
 * Deux comptes sont amorcés au démarrage, et ils sont le contraste qui compte :
 *   · amira-boutique — compte ouvert bien avant la bascule, aucune configuration
 *     enregistrée : tout est allumé, exactement comme avant ce changement.
 *   · snack-rif — compte ouvert après : Terminaux, Conformité, Réservations,
 *     Dépenses et Order Pro coupés d'office.
 *
 * Le cookie opérateur n'est envoyé qu'aux routes /api/admin/* : le donner aussi
 * au tableau de bord ferait de chaque client un opérateur et /api/config
 * cesserait de résoudre le marchand depuis sa session.
 *
 * Nécessite node:sqlite (Node 22+). Rien à installer.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4181);
/* Tiré au sort à chaque démarrage, jamais écrit nulle part : il ne signe que les
   cookies de CE processus, contre une base en mémoire qui disparaît avec lui.
   Une valeur en dur dans le dépôt n'aurait servi à rien et aurait fini par
   ressembler à un vrai secret. */
const AUTH_SECRET = crypto.randomUUID() + crypto.randomUUID();
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
      run() { db.prepare(query).run(...args); return { success: true }; },
      _exec() { db.prepare(query).run(...args); },
    };
    return st;
  };
  return { prepare, batch(s) { s.forEach((x) => x._exec()); return s.map(() => ({ success: true })); }, _db: db };
}

const db = makeDB();
const env = { DB: db, AUTH_SECRET };

const lib = await import(path.join(ROOT, 'functions/auth/_lib.js'));
const ROUTES = {
  '/api/config': await import(path.join(ROOT, 'functions/api/config.js')),
  '/api/admin/config': await import(path.join(ROOT, 'functions/api/admin/config.js')),
  '/api/admin/audit': await import(path.join(ROOT, 'functions/api/admin/audit.js')),
  '/api/admin/pins': await import(path.join(ROOT, 'functions/api/admin/pins.js')),
  '/api/admin/clients': await import(path.join(ROOT, 'functions/api/admin/clients.js')),
  '/api/admin/operators': await import(path.join(ROOT, 'functions/api/admin/operators.js')),
};

/* ── amorce : un client d'avant, un client d'après ────────────────────────── */
// NEW_ACCOUNT_FROM dans functions/api/config.js. Lu ici pour que le banc suive
// automatiquement la constante plutôt que d'en garder une copie qui dérive.
const NEW_FROM = Number(
  (fs.readFileSync(path.join(ROOT, 'functions/api/config.js'), 'utf8')
    .match(/NEW_ACCOUNT_FROM\s*=\s*(\d+)/) || [])[1] || Date.now());

const acc = (id, email, business, createdTs) =>
  db.prepare('INSERT INTO accounts (id,email,name,business,salt,hash,created_ts) VALUES (?,?,?,?,?,?,?)')
    .bind(id, email, email.split('@')[0], business, 'ff', 'ff', createdTs).run();

acc('acc-old', 'amira@kiwi.test', 'Amira Boutique', NEW_FROM - 300 * DAY);
db.prepare('INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,updated_ts) VALUES (?,?,?,?,?,?,?)')
  .bind('amira-boutique', '{}', 'pro', 'boutique', 'acc-old', 'Amira Boutique', Date.now()).run();
['5555', '4444'].forEach((pin, i) =>
  db.prepare('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)')
    .bind('pin-' + i, 'amira-boutique', pin, i ? 'Sara' : 'Amira', i ? 'vendeur_conseil' : 'proprietaire', i).run());

acc('acc-new', 'rif@kiwi.test', 'Snack Rif', NEW_FROM + DAY);
// Un code propriétaire, sinon l'écran de verrouillage barre la route au premier
// coup d'œil et on ne voit jamais le tableau de bord qu'on venait vérifier.
db.prepare('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)')
  .bind('pin-rif', 'snack-rif', '1234', 'Youssef', 'proprietaire', 0).run();
db.prepare('INSERT INTO operators (id,label,salt,hash,created_ts) VALUES (?,?,?,?,?)')
  .bind('op-dev', 'Opérateur local', 'ff', 'ff', Date.now()).run();

const SESSIONS = {
  'amira-boutique': await lib.makeSession('acc-old', AUTH_SECRET),
  'snack-rif': await lib.makeSession('acc-new', AUTH_SECRET),
};
const OP = await lib.operatorToken(AUTH_SECRET);
const OPID = await lib.operatorIdToken(AUTH_SECRET, 'op-dev');

/* La boutique du compte neuf s'enregistre au premier chargement, comme le ferait
   le navigateur du client — ce qui déclenche les valeurs par défaut. */
await ROUTES['/api/config'].onRequestPost({
  env,
  request: new Request('https://kiwi.test/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `kiwi_sess=${SESSIONS['snack-rif']}` },
    body: JSON.stringify({ type: 'fastfood' }),
  }),
});

/* ── serveur ──────────────────────────────────────────────────────────────── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain' };

http.createServer(async (rq, rs) => {
  const url = new URL(rq.url, 'http://localhost:' + PORT);
  const p = decodeURIComponent(url.pathname);
  const mod = ROUTES[p];

  if (mod) {
    const chunks = [];
    for await (const c of rq) chunks.push(c);
    // Quelle session ? ?merchant= choisit le commerçant qu'on incarne, ce qui
    // permet d'ouvrir les deux tableaux de bord côte à côte dans deux onglets.
    const who = SESSIONS[url.searchParams.get('merchant')] || SESSIONS['amira-boutique'];
    const cookie = `kiwi_sess=${who}` + (p.startsWith('/api/admin/') ? `; kiwi_op=${OP}; kiwi_op_id=${OPID}` : '');
    const fn = mod['onRequest' + rq.method[0] + rq.method.slice(1).toLowerCase()];
    if (!fn) { rs.writeHead(405); return rs.end(); }
    try {
      const out = await fn({ env, request: new Request('https://kiwi.test' + rq.url, {
        method: rq.method,
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: (rq.method === 'GET' || rq.method === 'HEAD') ? null : Buffer.concat(chunks),
      }) });
      rs.writeHead(out.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return rs.end(Buffer.from(await out.arrayBuffer()));
    } catch (e) {
      rs.writeHead(500, { 'Content-Type': 'application/json' });
      return rs.end(JSON.stringify({ error: String((e && e.message) || e) }));
    }
  }
  if (p.startsWith('/api/')) { rs.writeHead(404, { 'Content-Type': 'application/json' }); return rs.end('{}'); }

  const file = path.join(ROOT, p === '/' ? '/dashboard.html' : p);
  if (!file.startsWith(ROOT)) { rs.writeHead(403); return rs.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { rs.writeHead(404); return rs.end('Not found'); }
    rs.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store, must-revalidate' });
    rs.end(data);
  });
}).listen(PORT, () => {
  console.log(`Kiwi · banc d'essai sur http://localhost:${PORT}`);
  console.log('  /kiwi-admin.html                    console opérateur (Live · D1)');
  console.log('  /dashboard.html                     Amira Boutique — client d’AVANT, tout allumé');
  console.log('  /dashboard.html?merchant=snack-rif  Snack Rif — client d’APRÈS, cinq modules coupés');
  console.log('\nLe service worker sert des fichiers en cache : première ouverture,');
  console.log('videz-le (DevTools › Application › Service Workers › Unregister).');
});
