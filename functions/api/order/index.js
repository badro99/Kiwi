// /api/order — the PUBLIC half of the order relay (a customer's phone).
//
//   POST { merchant, mode, table, session?, ref?, lines:[{id,qty,options,note}] }
//                                                → { ok, id, number, total, lines }
//   GET  ?merchant=slug&id=ord-…                 → { ok, status, number }
//
// This is the one write a device with no account is allowed to make, so it is
// deliberately narrow. Compare with queue.js, which does the reading and the
// deciding and is staff-gated behind the normal site gate.
//
// ── Why this is public ───────────────────────────────────────────────────────
// The guest tapped an NFC tag; they have no session and no passcode. The gate
// (functions/_middleware.js) carves out this EXACT path — not the /api/order/
// prefix, so /api/order/queue stays protected. The capability is the merchant
// slug in the tag's URL, the same model as /api/pair/redeem's 6-digit code.
//
// ── What a stranger with a slug can and cannot do ────────────────────────────
// CAN: place an order at that store WHILE THE COUNTER IS OPEN (a stranger can
//      also walk in and order), and read back the status of an order ID they
//      were given.
// CANNOT: list orders, see anyone else's order, see totals or items for an ID
//      they don't hold, accept anything, touch another merchant, or — and this
//      is new — decide what anything costs.
// The GET therefore returns ONLY { status, number } — never lines or totals.
//
// ── Les trois choses que ce fichier a cessé de croire ────────────────────────
// 1. LE PRIX. Le téléphone envoyait `total` et chaque `unitPrice`, et on les
//    écrivait tels quels : une requête modifiée créait une commande à 1 MAD
//    pour un plat à 250, sous le nom qu'on voulait, et le ticket cuisine
//    sortait avec le faux prix. Maintenant le téléphone n'envoie que des
//    identifiants et des quantités ; le prix vient de la carte publiée par le
//    commerçant (priceOrder dans _lib.js), et son total à lui n'est plus qu'un
//    commentaire qu'on compare.
// 2. LE MOMENT. Rien n'empêchait de commander à trois heures du matin depuis
//    chez soi. La commande exige désormais que le COMPTOIR ait donné signe de
//    vie il y a moins de cinq minutes (deskOpen) : commerce fermé, caisse
//    éteinte, plus de commande.
// 3. L'UNICITÉ. Un double-tap ou un réseau qui repasse créait deux tickets avec
//    deux numéros. Le téléphone joint maintenant une clé (`ref`) et un renvoi
//    rejoue la même commande au lieu d'en fabriquer une seconde.

import { json } from '../../auth/_lib.js';
import {
  startOfDay, orderProEnabled, normTable, priceOrder, deskOpen, SESSION_ID,
} from './_lib.js';

const MAX_LINES = 60;              // one order, generously
const MAX_TOTAL = 200000;          // 200 000 MAD — a sanity ceiling, not a rule
const MAX_PENDING = 60;            // per merchant: a queue no staff could ever work through
const ORDER_ID = /^ord-[a-z0-9-]{6,48}$/;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = String((b && b.merchant) || '').trim().toLowerCase().slice(0, 64);
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!(await orderProEnabled(env, merchant))) return json({ error: 'orderpro-off' }, 403);

  /* Verrou d'ouverture. Il s'applique aussi à kiwi-order.html (le QR), qui ne
   * connaît pas les sessions : c'est la seule protection qui couvre les deux
   * pages, et elle ne coûte rien au client attablé pendant le service. */
  if (!(await deskOpen(env, merchant))) return json({ error: 'service-closed' }, 409);

  const mode = b.mode === 'takeout' ? 'takeout' : 'table';
  const table = mode === 'table' ? normTable(b.table) : '';
  if (mode === 'table' && !table) return json({ error: 'table-required' }, 400);

  /* La session, quand le téléphone en a une. OrderPro en ouvre toujours une ;
   * le QR historique n'en a pas, et reste accepté — sa commande porte alors
   * `session_id` NULL et ne bénéficie pas de la révocation à l'encaissement.
   * Quand elle EST fournie, elle doit être vivante et désigner la même table :
   * c'est ce qui fait qu'une addition encaissée coupe vraiment le robinet. */
  const sessionId = String((b && b.session) || '').trim();
  let session = null;
  if (sessionId) {
    if (!SESSION_ID.test(sessionId)) return json({ error: 'bad-session' }, 400);
    try {
      session = await env.DB.prepare(
        `SELECT id, status, table_no, mode FROM table_sessions WHERE id = ? AND merchant = ?`
      ).bind(sessionId, merchant).first();
    } catch (_) { session = null; }
    if (!session || session.status !== 'open') return json({ error: 'session-closed' }, 409);
    if (session.mode === 'table' && normTable(session.table_no) !== table) {
      return json({ error: 'session-table-mismatch' }, 409);
    }
  }

  const rawLines = Array.isArray(b.lines) ? b.lines : [];
  if (!rawLines.length) return json({ error: 'empty-order' }, 400);
  if (rawLines.length > MAX_LINES) return json({ error: 'too-many-lines' }, 400);

  /* Le prix est décidé ici, contre la carte publiée. Un identifiant inconnu ou
   * un plat marqué épuisé fait échouer la commande AVEC la raison : le
   * téléphone peut alors retirer la ligne et redemander, plutôt que de laisser
   * partir en cuisine un plat qui n'existe plus. */
  const priced = await priceOrder(env, merchant, rawLines);
  if (priced.unknown.length || priced.unavailable.length) {
    return json({
      error: 'menu-changed',
      unknown: priced.unknown,
      unavailable: priced.unavailable,
    }, 409);
  }
  if (!priced.lines.length) return json({ error: 'empty-order' }, 400);
  const total = priced.total;
  if (total <= 0 || total > MAX_TOTAL) return json({ error: 'bad-total' }, 400);

  const now = Date.now();
  const today = startOfDay(now);

  /* Idempotence. Le téléphone tire une clé par commande ; un renvoi (double
   * tap, réseau qui repasse, onglet rechargé) doit retrouver SA commande, pas
   * en créer une deuxième avec un deuxième numéro. */
  const clientRef = String((b && b.ref) || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || null;
  if (clientRef) {
    try {
      const dup = await env.DB.prepare(
        `SELECT id, number, total FROM orders WHERE merchant = ? AND client_ref = ?`
      ).bind(merchant, clientRef).first();
      if (dup) {
        return json({ ok: true, id: dup.id, number: dup.number, total: dup.total,
                      lines: priced.lines, replayed: true });
      }
    } catch (_) { /* colonne pas encore migrée → pas d'idempotence, comme avant */ }
  }

  /* Une file que personne ne pourrait écouler est une attaque, pas un coup de
   * feu. Bornée AU JOUR : le compte portait sur toute l'histoire de la table,
   * si bien que soixante commandes jamais traitées la semaine dernière
   * condamnaient la boutique à répondre « queue-full » pour toujours. */
  try {
    const pending = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM orders WHERE merchant = ? AND status = 'pending' AND created_ts >= ?"
    ).bind(merchant, today).first();
    if (pending && pending.n >= MAX_PENDING) return json({ error: 'queue-full' }, 429);
  } catch (_) { /* table not migrated yet → the insert below reports it */ }

  const id = 'ord-' + now.toString(36) + '-' + crypto.randomUUID().slice(0, 8);
  const linesJson = JSON.stringify(priced.lines);

  /* Le numéro de ticket est attribué DANS l'insertion : un seul énoncé, donc
   * deux téléphones qui commandent la même seconde ne peuvent pas recevoir le
   * même numéro.
   *
   * Deux écritures, une seule idée : les colonnes de session (session_id,
   * menu_rev, priced_ts, client_ref) sont additives, et une base où la
   * migration n'est pas passée fait échouer l'INSERT qui les nomme. Sans ce
   * repli, livrer la session aurait ÉTEINT la commande client partout où le
   * partenaire n'a pas encore migré — casser ce qui marche pour livrer ce qui
   * n'existe pas encore. Même discipline que le SELECT de queue.js. */
  const NUMBER = `COALESCE(MAX(number), 0) + 1`;
  let row = null;
  try {
    row = await env.DB.prepare(
      `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
                           created_ts, updated_ts, session_id, menu_rev, priced_ts, client_ref)
       SELECT ?, ?, ${NUMBER}, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?
         FROM orders WHERE merchant = ? AND created_ts >= ?
       RETURNING number`
    ).bind(
      id, merchant, mode, table, total, linesJson, now, now,
      session ? session.id : null, priced.menuRev, priced.priced ? now : null, clientRef,
      merchant, today
    ).first();
  } catch (_) {
    try {
      row = await env.DB.prepare(
        `INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status,
                             created_ts, updated_ts)
         SELECT ?, ?, ${NUMBER}, ?, ?, ?, ?, 'pending', ?, ?
           FROM orders WHERE merchant = ? AND created_ts >= ?
         RETURNING number`
      ).bind(id, merchant, mode, table, total, linesJson, now, now, merchant, today).first();
    } catch (e) {
      return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
    }
  }

  return json({
    ok: true, id, number: (row && row.number) || 1,
    total, lines: priced.lines,
  });
}

// Status of ONE order the caller already holds the id for. Intentionally the
// thinnest possible answer: no items, no total, no other order.
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const merchant = (url.searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  const id = (url.searchParams.get('id') || '').trim();
  if (!merchant || !id) return json({ error: 'bad-request' }, 400);
  if (!ORDER_ID.test(id)) return json({ error: 'bad-request' }, 400);
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  let row = null;
  try {
    // merchant is part of the WHERE, so an id guessed for store A can't be read
    // through store B's slug.
    row = await env.DB.prepare(
      'SELECT status, number FROM orders WHERE id = ? AND merchant = ?'
    ).bind(id, merchant).first();
  } catch (_) { /* table missing → not found */ }

  if (!row) return json({ error: 'not-found' }, 404);
  return json({ ok: true, status: row.status, number: row.number });
}
