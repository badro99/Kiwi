import { json } from '../../auth/_lib.js';
import { operationId, atomicStatements, statement } from './_queue-shared.js';
// Contrat : ctx, identifiant et état courant vers rappel explicite du bon ; aucune tarification convive.
export async function recallTicket(ctx, id, status) {
  const { env, b, merchant, now } = ctx;
  /* ── RAPPELER UN BON MARQUÉ PRÊT PAR ERREUR ────────────────────────────────
   * Un doigt sur « Prête » au coup de feu, et le bon quittait l'écran de la
   * cuisine pour l'historique : le plat n'était pas fait, et plus rien ne le
   * rappelait. FROM interdit volontairement `ready → accepted` (une étape ne se
   * défait pas en silence). Le rappel n'est donc pas une transition générique
   * mais un GESTE nommé, journalisé (`order-recalled`), et marqué sur chaque
   * ligne rappelée (`recalledAt`) : un sondage en retard ne peut pas le
   * contrefaire, et chaque écran sait qu'il doit remettre le bon en cuisine.
   *   · `station` : seules les lignes de ce poste ; vide = tout le bon ;
   *   · seulement depuis `ready`, ou depuis `accepted` quand ce poste avait
   *     fini sa part. Jamais depuis `served` : le plat est parti ;
   *   · le temps de préparation (order_course.ready_ts) est remis à zéro, pour
   *     que le bon compte quand il sera VRAIMENT prêt. */
  if (status === 'recall') {
    const recallStation = String((b && b.station) || '').trim().slice(0, 40);
    for (let attempt = 0; attempt < 4; attempt++) {
      let current = null;
      try {
        current = await env.DB.prepare(
          'SELECT lines, status, updated_ts, number FROM orders WHERE id = ? AND merchant = ?'
        ).bind(id, merchant).first();
      } catch (e) {
        return json({ error: 'read-failed', detail: String((e && e.message) || e) }, 500);
      }
      if (!current) return json({ error: 'not-found' }, 404);
      if (current.status !== 'ready' && current.status !== 'accepted') {
        return json({ error: 'bad-transition', status: current.status, number: current.number }, 409);
      }
      let lines = [];
      try { lines = JSON.parse(current.lines) || []; } catch (_) { lines = []; }
      const target = (line) => !!line && (!recallStation || String(line.station || '') === recallStation);
      if (!lines.some(target)) return json({ error: recallStation ? 'station-not-on-order' : 'empty-order' }, 400);
      if (current.status !== 'ready' && !lines.some((line) => target(line) && line.stationReady === true)) {
        return json({ error: 'not-ready', status: current.status, number: current.number }, 409);
      }
      const previousTs = Number(current.updated_ts) || 0;
      const nextTs = Math.max(now, previousTs + 1);
      /* Un bon passé « prêt » d'un bloc (onglet « Toutes ») n'a pas forcément
       * le drapeau par ligne. Les autres postes avaient fini : on le leur
       * écrit, pour que le bon redevienne prêt dès que le poste rappelé aura
       * refini sa part, sans faire rebumper ceux qui n'y sont pour rien. */
      const wasReady = current.status === 'ready';
      lines = lines.map((line) => {
        if (target(line)) return { ...line, stationReady: false, stationAccepted: true, recalledAt: nextTs };
        return wasReady && line ? { ...line, stationReady: true } : line;
      });
      try {
        const update = statement(env,
          `UPDATE orders SET lines = ?, status = 'accepted', updated_ts = ?
            WHERE id = ? AND merchant = ? AND status IN ('ready','accepted') AND updated_ts = ?`,
          JSON.stringify(lines), nextTs, id, merchant, previousTs);
        const audit = statement(env,
          `INSERT OR IGNORE INTO operational_events (id,command_id,merchant,event,status,detail,created_ts)
            SELECT ?, ?, ?, 'order-recalled', 'ok', ?, ?
              WHERE EXISTS (SELECT 1 FROM orders WHERE id = ? AND merchant = ? AND updated_ts = ?)`,
          operationId(id + '-' + merchant + '-' + nextTs, 'recall'), id, merchant,
          JSON.stringify({ station: recallStation, previousStatus: current.status, number: current.number }),
          nextTs, id, merchant, nextTs);
        const results = await atomicStatements(env, [update, audit]);
        if (!Number(results?.[0]?.meta?.changes || 0)) continue;
      } catch (e) {
        return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
      }
      try {
        await env.DB.prepare('UPDATE order_course SET ready_ts = NULL WHERE merchant = ? AND order_id = ?')
          .bind(merchant, id).run();
      } catch (_) { /* table absente sur une base ancienne : le rappel tient sans elle */ }
      return json({ ok: true, id, status: 'accepted', number: current.number,
                    station: recallStation, lines, recalled: true });
    }
    return json({ error: 'concurrent-update', retry: true }, 409);
  }
  return null;
}

