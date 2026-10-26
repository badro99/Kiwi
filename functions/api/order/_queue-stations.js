import { json } from '../../auth/_lib.js';
import { recordOrderCourse } from './_course.js';
import { deferCourse } from './_queue-shared.js';
// Contrat : ctx, identifiant et état courant vers avancement des postes ; aucune tarification convive.
export async function stationCooking(ctx, id, status) {
  const { context, env, b, merchant, now } = ctx;
  /* "Accepter" is preparation progress, not an order-state transition: the
   * order already reached KDS as accepted. Store the progress on each line so
   * Bar accepting its drinks does not move Kitchen, and so every KDS device
   * sees the same result. An empty station is the deliberate "Toutes" action. */
  const acceptedStation = String((b && b.station) || '').trim().slice(0, 40);
  if (status === 'cooking') {
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
      if (current.status !== 'accepted') {
        return json({ error: 'bad-transition', status: current.status, number: current.number }, 409);
      }
      let lines = [];
      try { lines = JSON.parse(current.lines) || []; } catch (_) { lines = []; }
      let matched = false;
      lines = lines.map((line) => {
        if (acceptedStation && String((line && line.station) || '') !== acceptedStation) return line;
        matched = true;
        return { ...line, stationAccepted: true };
      });
      if (!matched) return json({ error: acceptedStation ? 'station-not-on-order' : 'empty-order' }, 400);
      const previousTs = Number(current.updated_ts) || 0;
      const nextTs = Math.max(now, previousTs + 1);
      let changed = null;
      try {
        changed = await env.DB.prepare(
          `UPDATE orders SET lines = ?, updated_ts = ?
            WHERE id = ? AND merchant = ? AND status = 'accepted' AND updated_ts = ?
            RETURNING id, status, number`
        ).bind(JSON.stringify(lines), nextTs, id, merchant, previousTs).first();
      } catch (e) {
        return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
      }
      if (changed) {
        if (changed.status === 'ready') {
          deferCourse(context, recordOrderCourse(env, {
            merchant, orderId: changed.id, orderNumber: changed.number, readyAt: nextTs,
          }));
        }
        return json({ ok: true, id: changed.id, status: changed.status,
                      number: changed.number, station: acceptedStation, lines });
      }
    }
    return json({ error: 'concurrent-update', retry: true }, 409);
  }
  return null;
}

export async function stationReady(ctx, id, status) {
  const { context, env, b, merchant, now } = ctx;
  /* A station completes only its own lines. The ready bits live inside the
   * existing lines JSON, so this works on every deployed database without a
   * schema change. Optimistic compare-and-swap prevents bar + kitchen taps at
   * the same instant from overwriting each other. `station` absent means the
   * "Toutes" tab and deliberately completes the whole order below. */
  const readyStation = String((b && b.station) || '').trim().slice(0, 40);
  if (status === 'ready' && readyStation) {
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
      if (current.status !== 'accepted' && current.status !== 'ready') {
        return json({ error: 'bad-transition', status: current.status, number: current.number }, 409);
      }
      let lines = [];
      try { lines = JSON.parse(current.lines) || []; } catch (_) { lines = []; }
      let matched = false;
      lines = lines.map((line) => {
        if (String((line && line.station) || '') !== readyStation) return line;
        matched = true;
        return { ...line, stationReady: true };
      });
      if (!matched) return json({ error: 'station-not-on-order' }, 400);
      const allReady = lines.length > 0 && lines.every((line) => line && line.stationReady === true);
      // Un bon déjà prêt (« Toutes ») le reste : un appui de poste rejoué en retard
      // ne le fait jamais reculer en préparation.
      const nextStatus = allReady || current.status === 'ready' ? 'ready' : 'accepted';
      const previousTs = Number(current.updated_ts) || 0;
      const nextTs = Math.max(now, previousTs + 1);
      let changed = null;
      try {
        changed = await env.DB.prepare(
          `UPDATE orders SET lines = ?, status = ?, updated_ts = ?
            WHERE id = ? AND merchant = ? AND updated_ts = ?
            RETURNING id, status, number`
        ).bind(JSON.stringify(lines), nextStatus, nextTs, id, merchant, previousTs).first();
      } catch (e) {
        return json({ error: 'write-failed', detail: String((e && e.message) || e) }, 500);
      }
      if (changed) {
        // Le dernier poste prêt pose le jalon « prêt » du bon (temps de préparation).
        if (changed.status === 'ready' && current.status !== 'ready') {
          deferCourse(context, recordOrderCourse(env, {
            merchant, orderId: changed.id, orderNumber: changed.number, readyAt: nextTs,
          }));
        }
        return json({ ok: true, id: changed.id, status: changed.status,
                      number: changed.number, station: readyStation, lines });
      }
    }
    return json({ error: 'concurrent-update', retry: true }, 409);
  }
  return null;
}
