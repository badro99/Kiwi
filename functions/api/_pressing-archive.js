// functions/api/_pressing-archive.js
//
// pressing-orders est UN document (1,5 Mo au plus). Les bons remis au client
// s'y empilaient sans fin, car validatePressingSnapshot refuse de laisser partir
// un bon non annulé : le document finissait par un 413 et la synchronisation
// s'arrêtait. Un bon entièrement remis depuis plus de 90 jours passe donc dans
// des documents d'archive, une ligne store_docs par semaine
// (`pressing-orders-archive:w<semaine>`), hors de la liste des documents que
// l'API générique sert : conservés, jamais effacés, lus par l'opérateur.
//
// Garanties :
//   - un bon n'est retiré du document vivant qu'APRÈS que son archive est écrite
//     (compare-and-swap sur la révision de la ligne) ; si l'écriture échoue, il
//     reste dans le document vivant ;
//   - un bon encore ouvert (pièce non remise), annulé (preuve de garde, voir
//     preservePressingCancellations), remboursable ou sans date n'est jamais
//     archivé ;
//   - rejouer un bon déjà archivé (une caisse qui le garde en local) est sans
//     effet : l'archive garde la première copie.
const DAY = 86400000;
export const ARCHIVE_AFTER_MS = 90 * DAY;
export const ARCHIVE_PREFIX = 'pressing-orders-archive:';
// Une ligne D1 tient 2 Mo : on s'arrête avant, le surplus reste dans le document vivant.
export const ARCHIVE_ROW_MAX = 1800000;

function stamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : 0;
}
/* Le dernier instant connu du bon : tout ce qui le touche le repousse. */
export function orderStamp(order) {
  return Math.max(stamp(order?.collectedAt), stamp(order?.updatedAt), stamp(order?.readyAt), stamp(order?.droppedAt));
}
export function isArchivable(order, now = Date.now()) {
  if (!order || typeof order !== 'object' || !order.id || order.cancelledAt) return false;
  if (!Array.isArray(order.pieces) || !order.pieces.length || !order.pieces.every((p) => p && p.status === 'livre')) return false;
  if (!order.collectedAt || Number(order.refundDue) > 0 || order.refundEntry) return false;
  const last = orderStamp(order);
  return last > 0 && last <= now && now - last >= ARCHIVE_AFTER_MS;
}
export function archiveFeature(order) {
  return ARCHIVE_PREFIX + 'w' + Math.floor(orderStamp(order) / (7 * DAY));
}
/* Un bon n'est archivé que si la copie du SERVEUR est déjà remise et ancienne : un
   appareil ne peut pas faire sortir un bon ouvert du document vivant en envoyant un
   état « remis il y a 90 jours » inventé. C'est la copie serveur qui part en archive. */
export function archivableOrders(doc, now = Date.now(), serverDoc = null) {
  const server = new Map((serverDoc && Array.isArray(serverDoc.orders) ? serverDoc.orders : [])
    .filter((o) => isArchivable(o, now)).map((o) => [String(o.id), o]));
  return (doc && Array.isArray(doc.orders) ? doc.orders : [])
    .filter((o) => isArchivable(o, now) && server.has(String(o.id)))
    .map((o) => server.get(String(o.id)));
}
/* Bons qu'une caisse en retard renvoie alors que le serveur les a déjà sortis du
   vivant : ils ne sont retirés que si leur copie d'archive existe DÉJÀ (confirmOnly). */
export function replayedOrders(doc, now = Date.now(), serverDoc = null) {
  const live = new Set((serverDoc && Array.isArray(serverDoc.orders) ? serverDoc.orders : []).map((o) => String(o && o.id)));
  return (doc && Array.isArray(doc.orders) ? doc.orders : []).filter((o) => isArchivable(o, now) && !live.has(String(o.id)));
}

/* Écrit les bons dans leurs lignes d'archive et rend l'ensemble des ids dont la
   copie d'archive est CONFIRMÉE (nouvelle ou déjà là). Ne lève jamais : toute
   panne laisse simplement le bon dans le document vivant. */
export async function archivePressingOrders(env, merchant, orders, now = Date.now(), { confirmOnly = false } = {}) {
  const confirmed = new Set();
  const shards = new Map();
  for (const order of orders) {
    const key = archiveFeature(order);
    if (!shards.has(key)) shards.set(key, []);
    shards.get(key).push(order);
  }
  for (const [feature, rows] of shards) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const row = await env.DB.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?').bind(merchant, feature).first();
        let doc = { v: 1, orders: [] };
        if (row && row.data) { const parsed = JSON.parse(row.data); if (parsed && Array.isArray(parsed.orders)) doc = parsed; else throw new Error('corrupt-archive'); }
        const have = new Set(doc.orders.map((o) => String(o && o.id)));
        const add = rows.filter((o) => !have.has(String(o.id)));
        rows.filter((o) => have.has(String(o.id))).forEach((o) => confirmed.add(String(o.id)));
        if (!add.length || confirmOnly) break;
        const next = { v: 1, orders: doc.orders.concat(add) };
        const text = JSON.stringify(next);
        if (text.length > ARCHIVE_ROW_MAX) break;
        const result = row
          ? await env.DB.prepare('UPDATE store_docs SET data=?, rev=?, updated_ts=? WHERE merchant=? AND feature=? AND rev=?')
            .bind(text, (+row.rev || 0) + 1, now, merchant, feature, row.rev).run()
          : await env.DB.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,?,?,?,?) ON CONFLICT(merchant, feature) DO NOTHING')
            .bind(merchant, feature, text, 1, now).run();
        if (result?.meta?.changes === 1) { add.forEach((o) => confirmed.add(String(o.id))); break; }
      } catch (_) { break; }
    }
  }
  return confirmed;
}

/* Ce que /api/store appelle : archive les copies serveur éligibles, confirme les
   bons rejoués déjà archivés, et rend les ids qui peuvent quitter le vivant. */
export async function archiveFromSnapshot(env, merchant, doc, serverDoc, now = Date.now()) {
  const aged = archivableOrders(doc, now, serverDoc), replays = replayedOrders(doc, now, serverDoc);
  const kept = aged.length ? await archivePressingOrders(env, merchant, aged, now) : new Set();
  if (replays.length) for (const id of await archivePressingOrders(env, merchant, replays, now, { confirmOnly: true })) kept.add(id);
  return kept;
}
