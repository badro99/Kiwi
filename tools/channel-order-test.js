#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · la porte des canaux extérieurs.
 *
 *   node tools/channel-order-test.js
 *
 * /api/channel/order est la seule route de Kiwi qu'un tiers appelle SANS
 * session, avec une clé porteuse. Une erreur ici ne se voit pas à l'écran :
 * elle se voit quand un inconnu dépose des commandes chez un commerçant, ou
 * qu'un plat part deux fois parce que le prestataire a rejoué sa requête.
 *
 *   1. CLÉ          absente / malformée / inconnue / en pause / secret faux
 *   2. TENANCY      le magasin vient de la CLÉ, jamais du corps de la requête
 *   3. IDEMPOTENCE  rejouer la même référence n'imprime pas un second ticket
 *   4. BORNES       total, lignes, file d'attente, canal hors liste
 *   5. HUMAIN       rien n'est auto-accepté : la commande arrive `pending`
 *   6. GESTION      un commerçant ne touche pas aux clés d'un autre
 * ═══════════════════════════════════════════════════════════════════════════ */

import { makeSession, sessionCookie, SESS_COOKIE } from '../functions/auth/_lib.js';
import { onRequestPost as postOrder } from '../functions/api/channel/order.js';
import { onRequestPost as postKeys, onRequestGet as getKeys } from '../functions/api/channel/keys.js';

const SECRET = 'test-secret-not-a-real-key';
const ACC_A = 'acc-alpha', ACC_B = 'acc-beta';

let pass = 0; const fails = [];
const ok = (l, c, d) => { if (c) pass++; else fails.push(l + (d ? ' — ' + d : '')); };

/* ── D1 de poche ─────────────────────────────────────────────────────────── */
function makeDB() {
  const T = { channel_links: [], orders: [], merchant_config: [], accounts: {} };
  T.accounts[ACC_A] = { business: 'Atlas Casa' };
  T.accounts[ACC_B] = { business: 'Chez Rival' };

  const db = {
    _t: T,
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      let a = [];
      const api = {
        bind(...x) { a = x; return api; },
        async run() { return api.first(); },
        async all() {
          if (q.startsWith('SELECT id, channel, label, status, created_ts, last_ts, last_err FROM channel_links')) {
            return { results: T.channel_links.filter((r) => r.merchant === a[0]) };
          }
          throw new Error('unexpected all(): ' + q);
        },
        async first() {
          if (q.startsWith('SELECT id, merchant, channel, hash, status FROM channel_links WHERE id')) {
            return T.channel_links.find((r) => r.id === a[0]) || null;
          }
          if (q.startsWith('SELECT business FROM accounts')) return T.accounts[a[0]] || null;
          if (q.startsWith('SELECT account_id FROM merchant_config')) {
            const r = T.merchant_config.find((x) => x.merchant === a[0]);
            return r ? { account_id: r.account_id } : null;
          }
          if (q.startsWith('UPDATE channel_links SET last_ts')) {
            const r = T.channel_links.find((x) => x.id === a[1]); if (r) { r.last_ts = a[0]; r.last_err = null; }
            return r || null;
          }
          if (q.startsWith('UPDATE channel_links SET last_err')) {
            const r = T.channel_links.find((x) => x.id === a[1]); if (r) r.last_err = a[0];
            return r || null;
          }
          if (q.startsWith('UPDATE channel_links SET status')) {
            const r = T.channel_links.find((x) => x.id === a[1] && x.merchant === a[2]);
            if (!r) return null; r.status = a[0]; return { id: r.id };
          }
          if (q.startsWith('DELETE FROM channel_links')) {
            const i = T.channel_links.findIndex((x) => x.id === a[0] && x.merchant === a[1]);
            if (i < 0) return null; const r = T.channel_links[i]; T.channel_links.splice(i, 1); return { id: r.id };
          }
          if (q.startsWith('SELECT COUNT(*) AS n FROM channel_links')) {
            return { n: T.channel_links.filter((r) => r.merchant === a[0]).length };
          }
          if (q.startsWith('INSERT INTO channel_links')) {
            T.channel_links.push({ id: a[0], merchant: a[1], channel: a[2], label: a[3], hash: a[4], status: 'active', created_ts: a[5], last_ts: 0, last_err: null });
            return { id: a[0] };
          }
          if (q.startsWith('SELECT id, number FROM orders WHERE merchant = ? AND channel')) {
            return T.orders.find((o) => o.merchant === a[0] && o.channel === a[1] && o.ext_ref === a[2]) || null;
          }
          if (q.startsWith("SELECT COUNT(*) AS n FROM orders")) {
            return { n: T.orders.filter((o) => o.merchant === a[0] && o.status === 'pending').length };
          }
          if (q.startsWith('INSERT INTO orders')) {
            const [id, merchant, mode, total, lines, created, updated, channel, ref, customer] = a;
            const number = T.orders.filter((o) => o.merchant === merchant).reduce((m, o) => Math.max(m, o.number), 0) + 1;
            T.orders.push({ id, merchant, number, mode, table_no: '', total, lines, status: 'pending', created_ts: created, updated_ts: updated, channel, ext_ref: ref, customer });
            return { number };
          }
          throw new Error('unexpected first(): ' + q);
        },
      };
      return api;
    },
  };
  return db;
}

let DB = makeDB();
const env = () => ({ AUTH_SECRET: SECRET, DB });

const post = async (fn, body, headers) => {
  const res = await fn({
    request: new Request('https://kiwi.test/api/channel/order', {
      method: 'POST', body: JSON.stringify(body), headers: headers || {},
    }),
    env: env(),
  });
  let j = null; try { j = await res.json(); } catch (_) {}
  return { status: res.status, body: j };
};

const ORDER = {
  ref: 'GLV-4712', total: 240,
  customer: { name: 'Karim B.', phone: '0661234567', address: '12 rue Tarik, Maarif' },
  lines: [{ id: 'x', name: 'Tajine kefta', qty: 2, unitPrice: 120 }],
};

(async function run() {
  const sessA = sessionCookie(await makeSession(ACC_A, SECRET)).split(';')[0];
  const sessB = sessionCookie(await makeSession(ACC_B, SECRET)).split(';')[0];
  DB._t.merchant_config.push({ merchant: 'atlas-casa', account_id: ACC_A });
  DB._t.merchant_config.push({ merchant: 'chez-rival', account_id: ACC_B });

  /* ── création de clé ─────────────────────────────────────────────────── */
  let r = await post(postKeys, { channel: 'glovo', label: 'Glovo Maarif' }, { Cookie: sessA });
  ok('le commerçant crée une clé', r.status === 200 && !!r.body.token, JSON.stringify(r.body));
  const token = r.body.token;
  const keyId = r.body.key.id;
  ok('le jeton a la forme attendue', /^kwc\.chl-[0-9a-f-]{36}\.[A-Za-z0-9_-]{40,}$/.test(token || ''), token);

  r = await post(postKeys, { channel: 'pizzahut' }, { Cookie: sessA });
  ok('un canal hors liste est refusé', r.status === 400);

  r = await getKeys({ request: new Request('https://kiwi.test/api/channel/keys', { headers: { Cookie: sessA } }), env: env() });
  const listed = (await r.json()).keys;
  ok('la clé est listée', listed.length === 1 && listed[0].id === keyId);
  ok('le secret ne réapparaît JAMAIS dans la liste',
    !JSON.stringify(listed).includes(token.split('.')[2]),
    'un écran qui réaffiche le jeton en fait un secret volable');

  /* ── 1 · CLÉ ─────────────────────────────────────────────────────────── */
  r = await post(postOrder, ORDER, {});
  ok('sans clé → 401', r.status === 401);

  r = await post(postOrder, ORDER, { Authorization: 'Bearer pas-un-jeton' });
  ok('jeton malformé → 401', r.status === 401);

  r = await post(postOrder, ORDER, { Authorization: 'Bearer kwc.chl-inconnu.' + 'a'.repeat(43) });
  ok('identifiant de clé inconnu → 401', r.status === 401);

  r = await post(postOrder, ORDER, { Authorization: 'Bearer kwc.' + keyId + '.' + 'z'.repeat(43) });
  ok('bon identifiant, mauvais secret → 401', r.status === 401,
    'le secret doit être vérifié, pas seulement l\'identifiant');

  ok('aucune commande n\'a été créée par ces tentatives', DB._t.orders.length === 0);

  /* ── 2 · TENANCY ─────────────────────────────────────────────────────── */
  r = await post(postOrder, { ...ORDER, merchant: 'chez-rival' }, { Authorization: 'Bearer ' + token });
  ok('une commande valide est acceptée', r.status === 200 && r.body.ok, JSON.stringify(r.body));
  const o = DB._t.orders[0];
  ok('le magasin vient de la CLÉ, pas du corps de la requête', o && o.merchant === 'atlas-casa',
    'reçu ' + (o && o.merchant) + ' — un canal pourrait déposer chez le voisin');
  ok('le canal est celui de la clé', o && o.channel === 'glovo');
  ok('la référence du prestataire est conservée', o && o.ext_ref === 'GLV-4712');
  ok('le client de livraison est conservé', o && JSON.parse(o.customer).phone === '0661234567');
  ok('le mode est livraison', o && o.mode === 'delivery');

  /* ── 5 · HUMAIN ──────────────────────────────────────────────────────── */
  ok('rien n\'est auto-accepté', o && o.status === 'pending',
    'un canal qui pousse en cuisine fait travailler la brigade sans décision humaine');

  /* ── 3 · IDEMPOTENCE ─────────────────────────────────────────────────── */
  const before = DB._t.orders.length;
  r = await post(postOrder, ORDER, { Authorization: 'Bearer ' + token });
  ok('rejouer la même référence ne crée pas un second ticket', DB._t.orders.length === before,
    'les prestataires repoussent sur timeout : deux tickets = un plat fait deux fois');
  ok('…et rend la commande d\'origine', r.status === 200 && r.body.duplicate === true && r.body.number === o.number);

  r = await post(postOrder, { ...ORDER, ref: 'GLV-4713' }, { Authorization: 'Bearer ' + token });
  ok('une référence différente crée bien un ticket', DB._t.orders.length === before + 1);
  ok('le numéro de ticket s\'incrémente', r.body.number === o.number + 1);

  /* ── 4 · BORNES ──────────────────────────────────────────────────────── */
  r = await post(postOrder, { ...ORDER, ref: 'a1', total: 0 }, { Authorization: 'Bearer ' + token });
  ok('total nul refusé', r.status === 400);
  r = await post(postOrder, { ...ORDER, ref: 'a2', total: 999999 }, { Authorization: 'Bearer ' + token });
  ok('total absurde refusé', r.status === 400);
  r = await post(postOrder, { ...ORDER, ref: 'a3', lines: [] }, { Authorization: 'Bearer ' + token });
  ok('commande sans ligne refusée', r.status === 400);
  r = await post(postOrder, { ...ORDER, ref: 'a4', lines: new Array(61).fill({ name: 'x', qty: 1 }) }, { Authorization: 'Bearer ' + token });
  ok('trop de lignes refusé', r.status === 400);

  const err = DB._t.channel_links[0].last_err;
  ok('un refus laisse une trace lisible sur la clé', !!err,
    'sans elle, un connecteur muet ne se diagnostique qu\'en lisant les logs Cloudflare');

  /* ── pause ───────────────────────────────────────────────────────────── */
  r = await post(postKeys, { id: keyId, status: 'paused' }, { Cookie: sessA });
  ok('le commerçant met sa clé en pause', r.status === 200);
  r = await post(postOrder, { ...ORDER, ref: 'a5' }, { Authorization: 'Bearer ' + token });
  ok('une clé en pause n\'accepte plus rien', r.status === 401);

  r = await post(postKeys, { id: keyId, status: 'active' }, { Cookie: sessA });
  ok('…et se réactive', r.status === 200);

  /* ── 6 · GESTION ─────────────────────────────────────────────────────── */
  r = await post(postKeys, { id: keyId, revoke: true }, { Cookie: sessB });
  ok('un autre commerçant ne peut pas supprimer cette clé', r.status === 404,
    'connaître l\'identifiant d\'une clé ne doit pas suffire à la révoquer');
  ok('…et la clé est toujours là', DB._t.channel_links.length === 1);

  r = await post(postKeys, { id: keyId, status: 'paused' }, { Cookie: sessB });
  ok('…ni la mettre en pause', r.status === 404);

  r = await post(postKeys, { id: keyId, revoke: true }, { Cookie: sessA });
  ok('le propriétaire, lui, la révoque', r.status === 200 && DB._t.channel_links.length === 0);

  r = await post(postOrder, { ...ORDER, ref: 'a6' }, { Authorization: 'Bearer ' + token });
  ok('une clé révoquée n\'ouvre plus rien', r.status === 401);

  r = await post(postKeys, { channel: 'glovo' }, {});
  ok('sans session, on ne crée pas de clé', r.status === 401);

  console.log('');
  if (fails.length) {
    fails.forEach((f) => console.log('  ✗ ' + f));
    console.log(`\n✗ channel-order: ${pass} ok, ${fails.length} échec(s)\n`);
    process.exit(1);
  }
  console.log(`  ✓ canaux extérieurs (${pass} contrôles : clé, tenancy, idempotence, bornes, décision humaine)\n`);
})().catch((e) => { console.log('  ✗ ' + (e && e.stack || e)); process.exit(1); });
