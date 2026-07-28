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
      /* `meta.changes` n'est pas décoratif : c'est ce que D1 renvoie toujours, et
         plusieurs endpoints s'en servent pour distinguer « la ligne a été mise à
         jour » de « aucune ligne ne correspondait » (404). Sans lui, ce banc
         faisait répondre 404 à des UPDATE qui avaient parfaitement abouti — la
         base changeait, l'appelant recevait un échec, et les traitements
         suivants (notifications, journal) étaient sautés. */
      run() { const r = db.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
      _exec() { return st.run(); },
    };
    return st;
  };
  return { prepare, batch(s) { return s.map((x) => x._exec()); }, _db: db };
}

const db = makeDB();
const env = { DB: db, AUTH_SECRET };

/* La boîte d'envoi : MAIL_WEBHOOK pointe sur /__mail, ce serveur, et /__outbox
   rend ce qui en est sorti. C'est ce qui permet d'ouvrir POUR DE VRAI le lien de
   réinitialisation reçu « par le client », au lieu de s'arrêter au moment où le
   serveur affirme l'avoir envoyé. */
const outbox = [];
env.MAIL_WEBHOOK = `http://localhost:${PORT}/__mail`;

const lib = await import(path.join(ROOT, 'functions/auth/_lib.js'));
const ROUTES = {
  '/api/config': await import(path.join(ROOT, 'functions/api/config.js')),
  '/api/feed': await import(path.join(ROOT, 'functions/api/feed.js')),
  // Qui est connecté, et quels établissements il tient. Sans cette route le banc
  // renvoyait {} : identity.js repartait sur « pas de compte », donc ni God mode,
  // ni liste de magasins — les deux choses qu'on vient vérifier ici.
  '/api/me': await import(path.join(ROOT, 'functions/api/me.js')),
  '/api/admin/config': await import(path.join(ROOT, 'functions/api/admin/config.js')),
  '/api/admin/audit': await import(path.join(ROOT, 'functions/api/admin/audit.js')),
  '/api/admin/pins': await import(path.join(ROOT, 'functions/api/admin/pins.js')),
  '/api/admin/clients': await import(path.join(ROOT, 'functions/api/admin/clients.js')),
  '/api/admin/operators': await import(path.join(ROOT, 'functions/api/admin/operators.js')),
  '/api/admin/sales': await import(path.join(ROOT, 'functions/api/admin/sales.js')),
  '/api/admin/account': await import(path.join(ROOT, 'functions/api/admin/account.js')),
  '/api/admin/reset': await import(path.join(ROOT, 'functions/api/admin/reset.js')),
  '/auth/reset': await import(path.join(ROOT, 'functions/auth/reset.js')),
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

/* ── de quoi exercer les VENTES DE TEST ────────────────────────────────────
   Un deuxième établissement sur le même compte (pour vérifier que rien ne
   traverse), des ventes qui couvrent les cas difficiles, une journée déjà
   clôturée, un carnet clients et un registre d'équipe. Les cas faciles se
   testent tout seuls ; ceux-ci sont semés exprès. */
const NOW = Date.now();
db.prepare('INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,updated_ts) VALUES (?,?,?,?,?,?,?)')
  .bind('amira-cafe', '{}', 'pro', 'cafe', 'acc-old', 'Amira Café', NOW).run();

/* Un code patron déposé sous le SECOND magasin, pas sous celui d'inscription.
   C'est le cas qui cassait : le dashboard n'interrogeait que le magasin affiché
   et le magasin primaire, donc un code rangé ailleurs n'ouvrait rien. Il doit
   maintenant ouvrir le tableau de bord depuis n'importe lequel des deux. */
db.prepare('INSERT INTO staff_pins (id,merchant,pin,name,role,created_ts) VALUES (?,?,?,?,?,?)')
  .bind('pin-cafe', 'amira-cafe', '7777', 'Amira', 'proprietaire', 0).run();

const seedSale = (id, m, amount, method, label, ref, ts, lines) =>
  db.prepare('INSERT INTO sales (id,merchant,amount,method,label,ref,ts,lines) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, m, amount, method, label, ref, ts, lines ? JSON.stringify(lines) : null).run();

seedSale('s-onboard', 'amira-boutique', 1, 'cash', 'Test', 'T-001-A7', NOW - 2 * 3600000,
         [{ n: 'Test imprimante', q: 1, t: 1 }]);
seedSale('s-basket', 'amira-boutique', 640, 'card', 'Caftan +2 art.', 'T-014-A7', NOW - 3 * 3600000,
         [{ n: 'Caftan coton', q: 1, t: 520, c: 'Prêt-à-porter' }, { n: 'Ceinture brodée', q: 2, t: 120, c: 'Accessoires' }]);
seedSale('s-return', 'amira-boutique', 230, 'card', 'Retour · avoir AV-2031', 'T-031-A7', NOW - 4 * 3600000, null);
seedSale('s-plain', 'amira-boutique', 410, 'tap', 'Table 4', 'T-044-A7', NOW - 5 * 3600000, null);
seedSale('s-closed', 'amira-boutique', 300, 'cash', 'Vente', 'T-009-A7', NOW - DAY, null);
seedSale('s-cafe', 'amira-cafe', 88, 'cash', 'Café allongé', 'C-003-B2', NOW - 3600000, null);

const yUTC = new Date(NOW - DAY).toISOString().slice(0, 10);
db.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
  .bind('amira-boutique', 'dayreports', JSON.stringify({
    days: { [yUTC]: { day: yUTC, cutoff: 0, gross: 300, txns: 1, closedAt: NOW - DAY + 3600000,
                      closedBy: 'Sara', closedCount: 1, refunds: { count: 1, amount: 230 } } },
  }), 1, NOW).run();

db.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
  .bind('amira-boutique', 'team', JSON.stringify({ members: [
    { name: 'Sara Idrissi', role: 'Vendeuse', email: 'sara@amira.test' },
    { name: 'Nadia Alami', role: 'Manager', email: 'nadia@amira.test' },
  ] }), 1, NOW).run();

db.prepare('INSERT INTO clients (merchant,id,name,points,spend,deleted,updated_ts,srv_ts) VALUES (?,?,?,?,?,?,?,?)')
  .bind('amira-boutique', 'c1', 'Lalla Khadija', 1240, 1240, 0, NOW, NOW).run();

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

  /* La sortie e-mail simulée. On garde le message entier — c'est là qu'on va
     relire le lien de réinitialisation pour l'ouvrir comme le ferait le client. */
  if (p === '/__mail') {
    const chunks = [];
    for await (const c of rq) chunks.push(c);
    try { outbox.push(JSON.parse(Buffer.concat(chunks).toString())); } catch (_) {}
    rs.writeHead(200, { 'Content-Type': 'application/json' });
    return rs.end('{}');
  }
  if (p === '/__outbox') {
    rs.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return rs.end(JSON.stringify({ mail: outbox }));
  }

  const mod = ROUTES[p];

  if (mod) {
    const chunks = [];
    for await (const c of rq) chunks.push(c);
    // Quelle session ? ?merchant= choisit le commerçant qu'on incarne, ce qui
    // permet d'ouvrir les deux tableaux de bord côte à côte dans deux onglets.
    const who = SESSIONS[url.searchParams.get('merchant')] || SESSIONS['amira-boutique'];
    // Le cookie opérateur va aux routes /api/admin/*, et à TOUT appel venu d'une
    // page ouverte en God mode (?op=1 dans le Referer). En production ce cookie
    // est posé sur l'origine et part avec chaque requête ; le restreindre aux
    // seules routes admin rendait /api/me « pas opérateur » sur un dashboard
    // porté, donc intestable ici. On lit le Referer parce que le paramètre est
    // sur la PAGE, pas sur l'appel d'API que la page émet.
    const opView = /[?&]op=1(?:&|$)/.test(String(rq.headers.referer || ''));
    // KIWI_DEBUG_REF=1 pour voir qui appelle quoi, et si l'appel est reconnu comme
    // venant d'une page God mode. C'est la première chose qu'on veut savoir quand
    // une vue portée répond comme une vue ordinaire.
    if (process.env.KIWI_DEBUG_REF) {
      console.log('[ref]', rq.url, '←', JSON.stringify(rq.headers.referer || null), 'opérateur=' + opView);
    }
    const cookie = `kiwi_sess=${who}`
      + ((p.startsWith('/api/admin/') || opView) ? `; kiwi_op=${OP}; kiwi_op_id=${OPID}` : '');
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
  console.log('  /__outbox                           les e-mails « envoyés » (liens de réinitialisation)');
  console.log('\nLe service worker sert des fichiers en cache : première ouverture,');
  console.log('videz-le (DevTools › Application › Service Workers › Unregister).');
});
