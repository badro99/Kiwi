// /api/order/queue — the STAFF half of the order relay (the caisse).
//
//   GET  ?merchant=slug&since=<ts>        → { ok, orders:[…], sessions:[…], now }
//   POST { merchant, id, status, server?, paid? }   → { ok, id, status, number }
//   POST { merchant, closeSession | closeTable }    → { ok, closed }
//
// NOT public. This path is deliberately left OUT of the gate's OrderPro
// carve-out (which matches /api/order exactly, not the prefix), so reaching it
// requires the same credentials as the rest of the site — in practice the
// caisse's kiwi_gate staff cookie, exactly like /api/sale.
//
// This is where the human decision lives. An order arrives as `pending` and
// STAYS pending until staff accept it; only then is it a kitchen ticket. Nothing
// here is automatic — no auto-accept, no timeout that promotes an order. If the
// till is busy the customer sees "waiting for the till", which is the truth.
//
// Status flow:  pending → accepted → ready → served
//                   └──→ rejected                      (staff declined; terminal)
//
// ── Deux choses que ce GET fait en plus de lire ─────────────────────────────
// 1. IL POINTE. Ce sondage est la seule preuve régulière et authentifiée que le
//    comptoir est allumé. On en note l'heure (deskTouch), et c'est CETTE trace
//    qui autorise un téléphone à ouvrir une session : commerce fermé, caisse
//    éteinte, plus personne ne commande. La protection contre « je garde le
//    lien et je commande de chez moi » tient à cette ligne-là.
// 2. IL RAPPORTE QUI EST ASSIS. Les sessions vivantes voyagent avec la file,
//    dans la même réponse : la caisse allume ses tables sur le plan de salle
//    sans un deuxième sondage, et sans une deuxième horloge à désynchroniser.

import { json, entitledMerchant } from '../../auth/_lib.js';
import { startOfDay, deskTouch, normTable, SESSION_ID } from './_lib.js';

/* Les transitions LÉGALES, par état d'arrivée. Avant, l'UPDATE ne regardait pas
 * l'état de départ : on pouvait faire passer une commande de `pending`
 * directement à `ready` sans que la cuisine l'ait jamais vue, ou ramener une
 * commande servie en préparation. Le téléphone, le comptoir et la cuisine
 * pouvaient alors se contredire, et une étape franchie se défaisait en silence.
 *
 * `served` accepte aussi `accepted` : un café tendu par-dessus le comptoir n'a
 * pas de passage par « prêt ». Les états terminaux (`served`, `rejected`) ne
 * figurent dans aucune liste de départ — donc rien ne les rouvre. */
const FROM = {
  accepted: ['pending'],
  rejected: ['pending'],
  ready:    ['accepted'],
  served:   ['ready', 'accepted'],
};
const ORDER_ID = /^ord-[a-z0-9-]{6,48}$/;
const MAX_ROWS = 100;
const PENDING_TTL_MS = 30 * 60 * 1000;

/* Les colonnes se sont ajoutées par vagues : `channel/ext_ref/customer` avec la
 * livraison, `session_id/server_name/paid_ts` avec la session de table. Une base
 * où une vague n'est pas passée fait échouer le SELECT qui la nomme, et un
 * SELECT qui échoue rendrait ici une file VIDE — le comptoir ne verrait plus
 * rien, sans que rien ne le signale. On essaie donc du plus riche au plus
 * pauvre, et on s'arrête au premier qui répond. */
const BASE = 'id, number, mode, table_no, total, lines, status, created_ts, updated_ts';
const COL_SETS = [
  BASE + ', channel, ext_ref, customer, session_id, server_name, paid_ts',
  BASE + ', channel, ext_ref, customer',
  BASE + ', session_id, server_name, paid_ts',
  BASE,
];

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const asked = (url.searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  if (!asked) return json({ error: 'merchant-required' }, 400);
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  /* The gate admits every signed-in merchant plus a shared staff passcode, so
   * "reached this endpoint" never meant "owns this store". Reading the slug from
   * the query let any caller pull another restaurant's live queue — items,
   * notes, totals, table numbers. Server decides now. */
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);

  // Le pointage du comptoir. Volontairement AVANT toute lecture qui peut
  // échouer : une base sans la table `orders` doit quand même compter comme
  // « caisse allumée », sinon activer Order Pro sur une base pas encore migrée
  // fermerait la porte au lieu de l'ouvrir.
  await deskTouch(env, merchant);

  // `since` est le curseur de la caisse : elle demande ce qui a changé depuis la
  // dernière réponse, donc un long service coûte une petite réponse par tour.
  const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
  const now = Date.now();
  const today = startOfDay(now);

  /* A phone order nobody accepted is not a kitchen ticket forever. Test taps,
   * abandoned carts and customers who walked away used to return after every
   * caisse refresh because `pending` had no terminal condition. */
  try {
    await env.DB.prepare(
      `UPDATE orders SET status = 'rejected', updated_ts = ?
        WHERE merchant = ? AND status = 'pending' AND created_ts < ?`
    ).bind(now, merchant, now - PENDING_TTL_MS).run();
  } catch (_) { /* older schema / unavailable table: the read below stays fail-soft */ }

  /* `served` entre dans la file pour que le comptoir puisse ranger la commande
   * dans son historique — mais seulement celles DU JOUR. Sans cette borne, un
   * premier chargement (since=0) trierait par ancienneté et remplirait ses cent
   * lignes avec les commandes servies des semaines passées, en repoussant hors
   * de la réponse les commandes en attente d'aujourd'hui : la file aurait
   * paru vide un jour de coup de feu. */
  const WHERE = `FROM orders
        WHERE merchant = ? AND updated_ts > ?
          AND status IN ('pending','accepted','ready','served')
          AND (status <> 'served' OR created_ts >= ?)
        ORDER BY created_ts
        LIMIT ?`;

  let rows = null;
  for (const cols of COL_SETS) {
    try {
      rows = await env.DB.prepare(`SELECT ${cols} ${WHERE}`)
        .bind(merchant, since, today, MAX_ROWS).all();
      break;
    } catch (_) { rows = null; }
  }
  // Table pas migrée du tout → une file vide, jamais une erreur que la caisse
  // aurait à gérer. Elle continue d'interroger et s'allume au déploiement.
  if (!rows) return json({ ok: true, orders: [], sessions: [], now, ordersAvailable: false });

  const orders = (rows.results || []).map((r) => {
    let lines = [];
    try { lines = JSON.parse(r.lines) || []; } catch (_) { lines = []; }
    let customer = null;
    try { customer = r.customer ? JSON.parse(r.customer) : null; } catch (_) { customer = null; }
    return {
      id: r.id, number: r.number, mode: r.mode, table: r.table_no || '',
      total: r.total, lines, status: r.status,
      // Absent (base pas encore migrée) ⇒ 'kiwi' : une commande sans canal est
      // une commande du relais d'origine, c'est ce qu'elle a toujours été.
      channel: r.channel || 'kiwi',
      ref: r.ext_ref || '',
      customer,
      session: r.session_id || '',
      server: r.server_name || '',
      paid: !!r.paid_ts,
      created_ts: r.created_ts, updated_ts: r.updated_ts,
    };
  });

  /* Qui est assis en ce moment. Ce n'est pas la file : une table peut avoir un
   * téléphone posé dessus et zéro commande — c'est même l'état normal pendant
   * qu'on lit la carte, et c'est précisément ce que le plan de salle doit
   * montrer.
   *
   * Ce qui termine une session, c'est l'ADDITION, pas le silence du téléphone.
   * Une fenêtre courte (deux minutes de battement) éteignait la table dès que
   * le client verrouillait son écran pour parler à ses voisins — et le serveur
   * voyait une table se vider alors que les clients étaient toujours devant
   * leur plat. Deux heures : assez pour un repas entier téléphone en poche,
   * assez court pour qu'une session oubliée ne hante pas la salle toute la
   * journée. Le vrai ménage reste la fermeture à l'encaissement, et le garde-fou
   * des six heures dans session.js. */
  const PRESENCE_MS = 2 * 60 * 60 * 1000;
  let sessions = [];
  try {
    const live = await env.DB.prepare(
      `SELECT id, mode, table_no, opened_ts, seen_ts FROM table_sessions
        WHERE merchant = ? AND status = 'open' AND seen_ts > ?
        ORDER BY opened_ts LIMIT 200`
    ).bind(merchant, now - PRESENCE_MS).all();
    sessions = (live.results || []).map((s) => ({
      id: s.id, mode: s.mode || 'table', table: s.table_no || '',
      opened_ts: s.opened_ts, seen_ts: s.seen_ts,
    }));
  } catch (_) { sessions = []; }

  return json({ ok: true, orders, sessions, now, ordersAvailable: true });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const asked = String((b && b.merchant) || '').trim().toLowerCase().slice(0, 64);
  if (!asked) return json({ error: 'bad-request' }, 400);

  /* Same hole on the write side: accepting or rejecting another store's tickets
   * only ever required knowing its slug. */
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);

  const now = Date.now();

  /* ── Fermer une session ────────────────────────────────────────────────────
   * C'est le geste qui coupe le robinet : l'addition est réglée, le téléphone
   * du client cesse de pouvoir commander et bascule sur le remerciement. La
   * caisse l'appelle depuis markPaid(), donc par la même porte gardée que le
   * reste — un client ne peut pas fermer sa propre session, et surtout pas
   * celle d'une autre table. */
  const closeSession = String((b && b.closeSession) || '').trim();
  const closeTable = (b && b.closeTable) != null ? normTable(b.closeTable) : '';
  if (closeSession || closeTable) {
    if (closeSession && !SESSION_ID.test(closeSession)) return json({ error: 'bad-session' }, 400);
    const why = String((b && b.closedBy) || 'settle').slice(0, 16);
    let closed = 0;
    try {
      const res = closeSession
        ? await env.DB.prepare(
            `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = ?
              WHERE id = ? AND merchant = ? AND status = 'open'`
          ).bind(now, why, closeSession, merchant).run()
        : await env.DB.prepare(
            `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = ?
              WHERE merchant = ? AND table_no = ? AND status = 'open'`
          ).bind(now, why, merchant, closeTable).run();
      closed = (res && res.meta && res.meta.changes) || 0;
    } catch (_) { /* table pas migrée → rien à fermer, et surtout pas d'échec de vente */ }

    /* Les commandes de cette session sont soldées avec elle. `paid_ts` n'est pas
     * un état : une commande peut être servie et payée, ou payée puis servie
     * (le retrait au comptoir), et confondre les deux aurait obligé la cuisine
     * à connaître la caisse. */
    try {
      if (closeSession) {
        await env.DB.prepare(
          `UPDATE orders SET paid_ts = ?, updated_ts = ?
            WHERE merchant = ? AND session_id = ? AND paid_ts IS NULL`
        ).bind(now, now, merchant, closeSession).run();
      }
    } catch (_) {}
    return json({ ok: true, closed });
  }

  /* ── Faire avancer une commande ───────────────────────────────────────── */
  const id = String((b && b.id) || '').trim();
  const status = String((b && b.status) || '').trim();
  if (!ORDER_ID.test(id)) return json({ error: 'bad-request' }, 400);
  /* hasOwnProperty, et non `FROM[status]`. Un objet littéral hérite d'Object
   * .prototype, donc `FROM['constructor']`, `FROM['toString']`, `FROM['valueOf']`
   * — et toute autre clé du prototype — répondaient une FONCTION, qui est
   * « truthy » : la garde `if (!from)` les laissait passer, puis `from.map()`
   * quelques lignes plus bas levait un TypeError NON rattrapé (il est hors du
   * try). Résultat : `{"status":"constructor"}` ne recevait pas le 400
   * « bad-status » prévu, mais faisait tomber la Function en 500. Rien ne
   * s'écrivait en base — l'état des commandes n'a jamais été en jeu — mais un
   * corps malformé pouvait faire crier la caisse au lieu de se faire refuser
   * proprement, et c'est ce qu'un scanner trouve en premier. */
  const from = Object.prototype.hasOwnProperty.call(FROM, status) ? FROM[status] : null;
  if (!from) return json({ error: 'bad-status' }, 400);

  // Le serveur affecté à la table, posé au moment de l'acceptation : le ticket
  // cuisine porte alors un nom, au lieu d'obliger la brigade à demander « c'est
  // pour qui, la 7 ? ». Chaîne bornée — elle vient déjà d'une porte gardée.
  const server = String((b && b.server) || '').trim().slice(0, 40);
  const paid = b && b.paid === true;

  const marks = from.map(() => '?').join(',');
  let row;
  try {
    /* Un seul énoncé, donc deux caisses qui acceptent la même commande au même
     * instant ne peuvent pas la faire avancer deux fois : la seconde ne trouve
     * plus l'état de départ et RETURNING revient vide.
     *
     * merchant dans le WHERE garde un magasin d'agir sur les tickets d'un autre
     * — ce qui n'est vrai que depuis que `merchant` est dérivé du serveur. */
    row = await env.DB.prepare(
      `UPDATE orders
          SET status = ?, updated_ts = ?,
              server_name = COALESCE(NULLIF(?, ''), server_name),
              paid_ts = CASE WHEN ? = 1 AND paid_ts IS NULL THEN ? ELSE paid_ts END
        WHERE id = ? AND merchant = ? AND status IN (${marks})
        RETURNING id, status, number`
    ).bind(status, now, server, paid ? 1 : 0, now, id, merchant, ...from).first();
  } catch (_) {
    // Colonnes de session pas encore migrées : on fait avancer l'état seul.
    try {
      row = await env.DB.prepare(
        `UPDATE orders SET status = ?, updated_ts = ?
          WHERE id = ? AND merchant = ? AND status IN (${marks})
          RETURNING id, status, number`
      ).bind(status, now, id, merchant, ...from).first();
    } catch (e) {
      return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
    }
  }

  /* Rien mis à jour : soit la commande n'existe pas chez ce commerçant, soit
   * elle n'était pas dans un état d'où ce pas est permis. Les deux méritent des
   * réponses différentes — un 404 ferait croire à une commande disparue alors
   * qu'un collègue vient simplement de l'accepter avant nous. */
  if (!row) {
    let cur = null;
    try {
      cur = await env.DB.prepare('SELECT status, number FROM orders WHERE id = ? AND merchant = ?')
        .bind(id, merchant).first();
    } catch (_) {}
    if (!cur) return json({ error: 'not-found' }, 404);
    return json({ error: 'bad-transition', status: cur.status, number: cur.number }, 409);
  }

  /* ── La remise en main propre CLÔT la session du comptoir ─────────────────
   * Un retrait au comptoir n'a pas d'addition à encaisser plus tard : si rien
   * ne fermait sa session ici, le client repartait avec son sac ET un lien
   * toujours actif, et pouvait continuer à commander depuis le trottoir. La
   * commande servie était bien terminale, la SESSION ne l'était pas — et c'est
   * elle qui autorise la suivante.
   *
   * En salle, au contraire, « servie » veut dire que le plat est arrivé sur la
   * table : les convives mangent, ils commanderont peut-être un dessert. Leur
   * session ne se ferme qu'à l'addition (closeSession, plus haut). D'où le
   * test sur le mode, et non sur le seul statut. */
  if (status === 'served') {
    try {
      const own = await env.DB.prepare(
        `SELECT s.id AS sid FROM orders o
           JOIN table_sessions s ON s.id = o.session_id
          WHERE o.id = ? AND o.merchant = ? AND s.mode = 'takeout' AND s.status = 'open'`
      ).bind(id, merchant).first();
      if (own && own.sid) {
        await env.DB.prepare(
          `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = 'served'
            WHERE id = ? AND status = 'open'`
        ).bind(now, own.sid).run();
      }
    } catch (_) { /* colonnes/table absentes → rien à fermer, la vente reste faite */ }
  }

  return json({ ok: true, id: row.id, status: row.status, number: row.number });
}
