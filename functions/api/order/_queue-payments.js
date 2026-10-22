// Fermer une visite et ce qu'elle laisse dû, côté file (/api/order/queue) :
// closeSession (le règlement de la caisse) et closeTable (le geste de salle).
// Déplacé tel quel depuis queue.js, qui garde la répartition. Le gestionnaire
// rend null quand le corps ne le concerne pas.

import { json } from '../../auth/_lib.js';
import { normTable, SESSION_ID } from './_lib.js';
import { closeOrderCourses } from './_course.js';
import { settleCoveredOrders } from '../_visit-cover.js';
import { deferCourse, employeeName } from './_queue-shared.js';

export async function closeVisit(ctx) {
  const { context, env, b, merchant, now, employee, pinActor } = ctx;
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
    const expectedSession = closeTable ? String((b && (b.expectedSession || b.expectedSessionId)) || '').trim() : '';
    const expectedRevision = closeTable && b && b.expectedRevision != null
      ? Number(b.expectedRevision) : null;
    if (closeTable && !SESSION_ID.test(expectedSession)) {
      return json({ error: 'session-required', retry: true }, 409);
    }
    /* ── QUI A FERMÉ, ET CE QUI RESTAIT DÛ ─────────────────────────────────
     * N'importe quel serveur en service peut fermer n'importe quelle table de
     * la salle, et c'est VOULU : la couverture entre collègues est le
     * fonctionnement normal d'un service — celui qui passe débarrasse la table
     * de celui qui est en pause. Restreindre casserait le métier.
     *
     * Mais fermer ne solde pas (voir l'asymétrie plus bas), donc fermer la
     * table d'un collègue par erreur laissait une addition impayée derrière
     * soi, sans trace de l'auteur ni signal à l'écran. La couverture reste
     * libre ; elle cesse d'être anonyme et silencieuse. On note QUI ferme, et
     * on RÉPOND ce qui restait impayé pour que l'app puisse le dire tout de
     * suite — au moment où quelqu'un peut encore rattraper. */
    const closer = employee
      ? ('service:' + String(employee.member.id || employee.session.staffId || '')).slice(0, 48)
      : String((b && b.closedBy) || 'settle').slice(0, 48);
    const why = closer;
    let closed = 0;
    /* Compté AVANT la fermeture : après, les sessions ne sont plus ouvertes et
     * la question ne peut plus être posée. */
    let unpaid = 0;
    let targetSession = null;
    try {
      if (closeTable) {
        targetSession = await env.DB.prepare(
          `SELECT id, seen_ts FROM table_sessions
             WHERE id = ? AND merchant = ? AND table_no = ? AND mode = 'table' AND status = 'open'`
        ).bind(expectedSession, merchant, closeTable).first();
        if (!targetSession) return json({ error: 'stale-table-visit', retry: true }, 409);
        if (expectedRevision != null && Number(targetSession.seen_ts) !== expectedRevision) {
          return json({ error: 'stale-table-visit', retry: true, sessionId: targetSession.id,
            revision: Number(targetSession.seen_ts) || 0 }, 409);
        }
      }
      const pending = closeSession
        ? await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM orders
              WHERE merchant = ? AND session_id = ? AND paid_ts IS NULL`
          ).bind(merchant, closeSession).first()
        : await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM orders
              WHERE merchant = ? AND session_id = ? AND paid_ts IS NULL`
          ).bind(merchant, expectedSession).first();
      unpaid = Number((pending && pending.n) || 0);
    } catch (_) { unpaid = 0; }   // colonnes absentes ⇒ on ne prétend pas savoir
    /* ── LIBÉRER UNE TABLE QUI DOIT ENCORE DE L'ARGENT SE CONFIRME ──────────
     * `closeTable` ne solde rien (voir l'asymétrie plus bas) : une visite
     * fermée avec un reste dû laisse une dette que plus aucun plan de salle ne
     * montre. Un geste accidentel suffisait, et la réponse `unpaid` n'arrivait
     * qu'après coup. Le serveur exige donc `force: true`, que seul un appelant
     * ayant fait confirmer l'abandon envoie ; sans lui, rien n'est fermé et la
     * réponse chiffre le reste pour que l'écran pose la question.
     *
     * « Doit » se juge à l'argent, pas au seul drapeau `paid_ts` : un
     * encaissement déjà enregistré sur la visite (vente complète dont la
     * clôture est restée en attente, acomptes d'une addition partagée) compte.
     * Une lecture impossible ne vaut pas preuve de solde : sans `force`, on
     * refuse aussi. */
    if (closeTable && b.force !== true) {
      try {
        const bill = await env.DB.prepare(
          `SELECT COALESCE(SUM(CASE WHEN paid_ts IS NULL THEN 1 ELSE 0 END), 0) AS open_n,
                  COALESCE(SUM(CAST(ROUND(total * 100) AS INTEGER)), 0) AS bill
             FROM orders WHERE merchant = ? AND session_id = ? AND status <> 'rejected'`
        ).bind(merchant, expectedSession).first();
        const openOrders = Number((bill && bill.open_n) || 0);
        if (openOrders > 0) {
          let paid = 0;
          try {
            const money = await env.DB.prepare(
              `SELECT COALESCE(SUM(COALESCE(gross_amount_cents, amount_cents)), 0) AS paid FROM sales
                WHERE merchant = ? AND session_id = ? AND void_ts IS NULL`
            ).bind(merchant, expectedSession).first();
            paid = Number((money && money.paid) || 0);
          } catch (_) { paid = 0; }   // pas de lien vente → visite : rien n'est prouvé payé
          const owedCents = (Number((bill && bill.bill) || 0)) - paid;
          if (owedCents > 1) return json({ error: 'visit-unpaid', confirm: 'force', unpaid: openOrders,
            owedCents, sessionId: expectedSession }, 409);
        }
      } catch (_) {
        return json({ error: 'visit-unpaid-unverified', confirm: 'force' }, 409);
      }
    }
    try {
      const res = closeSession
        ? await env.DB.prepare(
            `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = ?, closed_actor_id = ?, closed_actor_name = ?
              WHERE id = ? AND merchant = ? AND status = 'open'`
          ).bind(now, why, pinActor?.id || '', pinActor?.name || '', closeSession, merchant).run()
        : await env.DB.prepare(
            `UPDATE table_sessions SET status = 'closed', closed_ts = ?, closed_by = ?, closed_actor_id = ?, closed_actor_name = ?
              WHERE id = ? AND merchant = ? AND table_no = ? AND status = 'open'${expectedRevision != null ? ' AND seen_ts = ?' : ''}`
          ).bind(now, why, pinActor?.id || employee?.member?.id || '', pinActor?.name || (employee ? employeeName(employee.member) : ''),
            expectedSession, merchant, closeTable, ...(expectedRevision != null ? [expectedRevision] : [])).run();
      closed = (res && res.meta && res.meta.changes) || 0;
    } catch (_) { return json({ error: 'closure-write-failed' }, 503); }
    if (!closeSession && !closed) return json({ error: 'stale-table-visit', retry: true }, 409);

    /* Les commandes de cette session sont soldées avec elle. `paid_ts` n'est pas
     * un état : une commande peut être servie et payée, ou payée puis servie
     * (le retrait au comptoir), et confondre les deux aurait obligé la cuisine
     * à connaître la caisse.
     *
     * ── L'ASYMÉTRIE AVEC `closeTable` EST VOULUE ────────────────────────────
     * Seul `closeSession` avec `closedBy: settle` vient du règlement.
     * Une remise à zéro (`caisse`, `prune-stale`) peut aussi porter un ID de
     * session : elle ne prouve jamais un paiement. `closeTable` dit « cette table est
     * libre » — un départ sans payer, une table nettoyée à la main, une remise
     * à zéro. Y ajouter `paid_ts` INVENTERAIT une recette : le rapport Z
     * compterait une addition que personne n'a réglée.
     *
     * Ce qui rendait l'asymétrie dangereuse a été corrigé ailleurs : le
     * règlement de /api/sale ne balaie plus « toutes les impayées de cette
     * table depuis minuit », il ne solde que la visite en cours. Une commande
     * laissée impayée par un `closeTable` reste donc impayée — visible comme
     * telle — au lieu d'être ramassée par le paiement de la tablée suivante. */
    /* Mais « réglée » ne vaut que pour ce que les tickets de la visite ont
     * payé. Une commande arrivée après l'addition (un QR, un serveur qui
     * envoie le dessert pendant l'encaissement) était estampillée payée ici
     * et partait gratuite sans que personne le voie. Quand les tickets paient
     * exactement les plus anciennes commandes, seules celles-ci passent
     * payées ; le reste demeure dû, et la réponse le chiffre pour que la
     * caisse le dise. Sans ticket encore arrivé (la fermeture a doublé le
     * paiement), ou avec un écart qui ne tombe sur aucune commande, rien ne
     * change : tout est soldé comme avant. */
    let owed = null;
    try {
      if (closeSession && why === 'settle') {
        owed = await settleCoveredOrders(env, merchant, closeSession, now);
        if (!owed) {
          await env.DB.prepare(
            `UPDATE orders SET paid_ts = ?, updated_ts = ?
              WHERE merchant = ? AND session_id = ? AND paid_ts IS NULL AND status <> 'rejected'`
          ).bind(now, now, merchant, closeSession).run();
        }
      }
    } catch (_) {}
    deferCourse(context, closeOrderCourses(env, {
      merchant, sessionId: closeSession, table: closeTable, closedAt: now,
    }));
    return json({ ok: true, closed, sessionId: closeSession || expectedSession,
      revision: targetSession ? Number(targetSession.seen_ts) || 0 : undefined,
      unpaid: unpaid || undefined,
      owedCents: owed ? owed.remainingCents : undefined,
      owedOrders: owed ? owed.owedOrders : undefined });
  }
  return null;
}
