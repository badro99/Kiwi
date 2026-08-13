// /api/order/session — le téléphone s'assoit, et demande s'il est encore le bienvenu.
//
//   POST { merchant, mode, table }        → { ok, session, mode, table, status }
//   GET  ?merchant=slug&session=tsx-…     → { ok, status, table, mode, closedBy }
//
// PUBLIC, aux mêmes conditions que /api/order : le client a posé son téléphone
// sur un tag, il n'a ni compte ni cookie. La porte du site laisse passer ces
// deux chemins EXACTS (functions/_middleware.js) — jamais le préfixe, sans quoi
// /api/order/queue, la vue du personnel, s'ouvrirait avec.
//
// ── Ce que la session ajoute au relais ──────────────────────────────────────
// Avant elle, connaître le slug suffisait à commander, pour toujours, de
// n'importe où. Le personnel acceptait chaque commande à la main — donc rien
// n'était jamais préparé sans un humain — mais le lien n'avait pas de fin :
// quelqu'un pouvait garder l'adresse et occuper la file à deux heures du matin.
//
// Trois verrous, dans cet ordre :
//   1. Order Pro doit être ouvert chez ce commerçant.
//   2. Le COMPTOIR doit avoir donné signe de vie il y a moins de cinq minutes.
//      Commerce fermé ⇒ caisse éteinte ⇒ aucune session ne s'ouvre. C'est la
//      protection contre la commande passée de chez soi, et elle ne dépend
//      d'aucun horaire saisi à la main (voir deskOpen dans _lib.js).
//   3. Encaisser l'addition FERME la session. Le téléphone bascule alors sur un
//      remerciement et ne peut plus commander tant qu'il n'a pas retouché le tag.
//
// ── Ce que ça n'est pas ─────────────────────────────────────────────────────
// Pas une identité. On ne stocke ni nom, ni téléphone, ni appareil : une session
// dit « un téléphone commande à la table 7 », rien de plus. Le GET ne révèle
// jamais autre chose que l'état de LA session dont on présente déjà
// l'identifiant — ni les commandes, ni les totaux, ni les autres tables.

import { json } from '../../auth/_lib.js';
import {
  orderProEnabled, normTable, newSessionId, SESSION_ID, deskOpen,
} from './_lib.js';
import { publishGuestServiceRequest } from '../service/events.js';

/* Une session oubliée (le client est parti sans qu'on encaisse, la caisse a
 * planté) ne doit pas garder la table prise pour l'éternité : au-delà de ça
 * elle est traitée comme close, et la table redevient disponible pour le
 * client suivant. Six heures — plus long que n'importe quel service, plus
 * court qu'une nuit. */
const SESSION_MAX_MS = 6 * 60 * 60 * 1000;

function slug(v) {
  return String(v == null ? '' : v).trim().toLowerCase().slice(0, 64);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = slug(b && b.merchant);
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!(await orderProEnabled(env, merchant))) return json({ error: 'orderpro-off' }, 403);

  /* Service buttons reuse the opaque table session already held by this
   * phone. The table is read from that session, never trusted from the body. */
  if (b && b.action) {
    const action = String(b.action || '');
    const session = String(b.session || '').trim();
    if (!SESSION_ID.test(session)) return json({ error: 'session-required' }, 400);
    let live = null;
    try {
      live = await env.DB.prepare(
        `SELECT table_no, opened_ts FROM table_sessions
          WHERE id = ? AND merchant = ? AND mode = 'table' AND status = 'open'`
      ).bind(session, merchant).first();
    } catch (_) {}
    if (!live || (Date.now() - Number(live.opened_ts || 0)) >= SESSION_MAX_MS) {
      return json({ error: 'session-closed' }, 409);
    }
    if (!(await deskOpen(env, merchant))) return json({ error: 'service-closed' }, 409);
    const result = await publishGuestServiceRequest(env, merchant, live.table_no, action);
    return result.ok ? json(result) : json({ error: result.error || 'service-request-failed' }, 503);
  }

  const mode = (b && b.mode) === 'takeout' ? 'takeout' : 'table';
  const table = mode === 'table' ? normTable(b && b.table) : '';
  /* Une commande en salle sans table ne peut pas être servie : le ticket sort
   * « Table ? » et personne ne sait où l'apporter. On refuse plutôt que de
   * fabriquer une commande orpheline. */
  if (mode === 'table' && !table) return json({ error: 'table-required' }, 400);

  // Verrou 2 — le comptoir est-il allumé ?
  if (!(await deskOpen(env, merchant))) return json({ error: 'service-closed' }, 409);

  const now = Date.now();

  /* Reprise. Le client verrouille son téléphone, revient dix minutes plus tard,
   * ou son voisin de table tape le même tag : c'est la MÊME tablée, donc la
   * même session et la même addition. On ne rouvre rien, on rafraîchit. */
  if (mode === 'table') {
    let live = null;
    try {
      live = await env.DB.prepare(
        `SELECT id, opened_ts FROM table_sessions
          WHERE merchant = ? AND table_no = ? AND status = 'open'`
      ).bind(merchant, table).first();
    } catch (_) { /* table pas encore migrée → on tentera l'insertion, qui dira la vérité */ }

    if (live && (now - (live.opened_ts || 0)) < SESSION_MAX_MS) {
      try {
        await env.DB.prepare('UPDATE table_sessions SET seen_ts = ? WHERE id = ?')
          .bind(now, live.id).run();
      } catch (_) {}
      return json({ ok: true, session: live.id, mode, table, status: 'open', resumed: true });
    }
    /* Session vivante mais périmée : on la ferme d'abord, sinon l'index unique
     * partiel refuserait la nouvelle et la table resterait inutilisable. */
    if (live) {
      try {
        await env.DB.prepare(
          `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = 'expiry'
            WHERE id = ? AND status = 'open'`
        ).bind(now, live.id).run();
      } catch (_) {}
    }
  }

  const id = newSessionId();
  try {
    await env.DB.prepare(
      `INSERT INTO table_sessions (id, merchant, mode, table_no, status, opened_ts, seen_ts)
       VALUES (?, ?, ?, ?, 'open', ?, ?)`
    ).bind(id, merchant, mode, table, now, now).run();
  } catch (e) {
    /* Course perdue contre un autre téléphone de la même tablée : l'index
     * unique a tranché, on lit sa session et on la partage. */
    if (mode === 'table') {
      try {
        const other = await env.DB.prepare(
          `SELECT id FROM table_sessions
            WHERE merchant = ? AND table_no = ? AND status = 'open'`
        ).bind(merchant, table).first();
        if (other) return json({ ok: true, session: other.id, mode, table, status: 'open', resumed: true });
      } catch (_) {}
    }
    return json({ error: 'write-failed' }, 500);
  }

  return json({ ok: true, session: id, mode, table, status: 'open' });
}

/* L'état de LA session dont l'appelant présente déjà l'identifiant, et le
 * battement de cœur qui allume sa table sur le plan de salle. C'est aussi le
 * canal par lequel le téléphone apprend qu'on a encaissé : `status !== 'open'`
 * est le signal de révocation, et l'app bascule sur le remerciement. */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const merchant = slug(url.searchParams.get('merchant'));
  const id = (url.searchParams.get('session') || '').trim();
  if (!merchant || !SESSION_ID.test(id)) return json({ error: 'bad-request' }, 400);
  if (!env.DB) return json({ error: 'not-configured' }, 503);

  let row = null;
  try {
    // merchant dans le WHERE : une session devinée chez A ne se lit pas via B.
    row = await env.DB.prepare(
      `SELECT status, table_no, mode, closed_by, opened_ts
         FROM table_sessions WHERE id = ? AND merchant = ?`
    ).bind(id, merchant).first();
  } catch (_) { /* table absente → traitée comme close ci-dessous */ }

  /* Session inconnue ⇒ close, et non une erreur : le téléphone sonde cette
   * route en boucle, et un 404 l'obligerait à distinguer « révoquée » de
   * « réseau tombé » — deux choses qu'il doit justement traiter autrement. */
  if (!row) return json({ ok: true, status: 'closed', closedBy: 'unknown' });

  const now = Date.now();
  const stale = (now - (row.opened_ts || 0)) >= SESSION_MAX_MS;
  if (row.status === 'open' && !stale) {
    try {
      await env.DB.prepare('UPDATE table_sessions SET seen_ts = ? WHERE id = ?').bind(now, id).run();
    } catch (_) {}
  }

  return json({
    ok: true,
    status: (row.status === 'open' && !stale) ? 'open' : 'closed',
    closedBy: stale && row.status === 'open' ? 'expiry' : (row.closed_by || ''),
    table: row.table_no || '',
    mode: row.mode || 'table',
  });
}
