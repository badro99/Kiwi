// functions/api/_pressing-snapshot.js
// Gardes d'instantané du document pressing-orders (déplacées de store.js, qui est plafonné par
// le cliquet de taille). Comportement inchangé.

/* A pressing cancellation is custody evidence, not an optional field in a
 * last-writer-wins snapshot. Older clients do not know `cancellations`, and a
 * full document from one of them must therefore never erase a tombstone that
 * another terminal already recorded. There is deliberately no implicit
 * restoration path here: an authorized restore would be a separate action. */
export function preservePressingCancellations(current, incoming) {
  if (!current || !incoming || typeof current !== 'object' || typeof incoming !== 'object') return incoming;
  const oldCancellations = Array.isArray(current.cancellations) ? current.cancellations : [];
  const oldOrders = Array.isArray(current.orders) ? current.orders : [];
  const oldConflicts = Array.isArray(current.rackConflicts) ? current.rackConflicts : [];
  if (!oldCancellations.length && !oldConflicts.length && !oldOrders.some((o) => o && o.cancelledAt)) return incoming;
  const cancellations = Array.isArray(incoming.cancellations) ? incoming.cancellations.slice() : [];
  const byId = new Map(cancellations.filter((c) => c && c.id).map((c) => [String(c.id), c]));
  oldCancellations.forEach((c) => {
    if (!c || !c.id) return;
    const existing = byId.get(String(c.id));
    if (existing) Object.assign(existing, c);
    else { byId.set(String(c.id), c); cancellations.push(c); }
  });
  oldOrders.filter((o) => o && o.id && o.cancelledAt).forEach((o) => {
    const id = String(o.id);
    if (!byId.has(id)) {
      const tombstone = { id, cancelledAt: o.cancelledAt, cancelledBy: o.cancelledBy || null };
      byId.set(id, tombstone);
      cancellations.push(tombstone);
    }
  });
  const orders = Array.isArray(incoming.orders) ? incoming.orders.slice() : [];
  const orderById = new Map(orders.filter((o) => o && o.id).map((o) => [String(o.id), o]));
  oldOrders.filter((o) => o && o.id && o.cancelledAt).forEach((old) => {
    const id = String(old.id);
    const row = orderById.get(id);
    if (!row) orders.push(old);
    else Object.assign(row, {
      cancelledAt: old.cancelledAt,
      cancelledBy: old.cancelledBy || null,
      refundDue: old.refundDue || 0, refundEntry: old.refundEntry || null,
      rack: null,
      updatedAt: Math.max(Number(row.updatedAt) || 0, Number(old.updatedAt) || 0),
    });
  });
  const conflicts = Array.isArray(incoming.rackConflicts) ? incoming.rackConflicts.slice() : [];
  const conflictKeys = new Set(conflicts.map((c) => `${c && c.slot}|${c && c.loserId}`));
  oldConflicts.forEach((c) => {
    const key = `${c && c.slot}|${c && c.loserId}`;
    if (c && !conflictKeys.has(key)) { conflictKeys.add(key); conflicts.push(c); }
  });
  return { ...incoming, orders, cancellations, rackConflicts: conflicts.slice(-100) };
}

function pressingCancellationActor(actor) {
  if (!actor || typeof actor !== 'object') return null;
  return {
    id: String(actor.id || '').slice(0, 80),
    name: String(actor.name || '').slice(0, 100),
    role: String(actor.role || '').slice(0, 40),
  };
}

function samePressingCancellation(a, b) {
  if (!a || !b) return false;
  return String(a.cancelledAt || '') === String(b.cancelledAt || '')
    && JSON.stringify(pressingCancellationActor(a.cancelledBy)) === JSON.stringify(pressingCancellationActor(b.cancelledBy));
}

/* Generic document sync is not an authorization boundary. In particular, a
 * till must not be able to invent a cancelledAt/cancelledBy pair merely by
 * posting a full snapshot. Only /api/pressing/cancel may create that evidence;
 * this check accepts an already-known tombstone exactly as recorded and rejects
 * both forged/re-written tombstones and removal of live orders. */
export function validatePressingSnapshot(current, incoming) {
  if (!incoming || typeof incoming !== 'object') return null;
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    const forged = (Array.isArray(incoming.cancellations) && incoming.cancellations.find((c) => c && c.id))
      || (Array.isArray(incoming.orders) && incoming.orders.find((o) => o && o.id && o.cancelledAt));
    return forged ? { error: 'pressing-cancellation-route-required', id: String(forged.id) } : null;
  }
  const oldOrders = Array.isArray(current.orders) ? current.orders : [];
  const oldTombstones = new Map();
  (Array.isArray(current.cancellations) ? current.cancellations : []).forEach((c) => {
    if (c && c.id) oldTombstones.set(String(c.id), c);
  });
  oldOrders.forEach((o) => {
    if (o && o.id && o.cancelledAt && !oldTombstones.has(String(o.id))) {
      oldTombstones.set(String(o.id), { id: String(o.id), cancelledAt: o.cancelledAt, cancelledBy: o.cancelledBy || null });
    }
  });
  const incomingOrders = Array.isArray(incoming.orders) ? incoming.orders : [];
  const incomingById = new Map(incomingOrders.filter((o) => o && o.id).map((o) => [String(o.id), o]));
  const incomingCancellations = Array.isArray(incoming.cancellations) ? incoming.cancellations : [];

  for (const old of oldOrders) {
    if (!old || !old.id || old.cancelledAt) continue;
    if (!incomingById.has(String(old.id))) return { error: 'pressing-order-retention-conflict', id: String(old.id) };
  }
  for (const cancellation of incomingCancellations) {
    if (!cancellation || !cancellation.id) continue;
    const id = String(cancellation.id);
    const old = oldTombstones.get(id);
    if (!old) return { error: 'pressing-cancellation-route-required', id };
    if (!samePressingCancellation(old, cancellation)) return { error: 'pressing-cancellation-immutable', id };
  }
  for (const [id, incomingOrder] of incomingById) {
    if (!incomingOrder || !incomingOrder.cancelledAt) continue;
    const old = oldTombstones.get(id);
    if (!old) return { error: 'pressing-cancellation-route-required', id };
    if (!samePressingCancellation(old, incomingOrder)) return { error: 'pressing-cancellation-immutable', id };
  }
  for (const [id, old] of oldTombstones) {
    const incomingOrder = incomingById.get(id);
    if (incomingOrder && (!incomingOrder.cancelledAt || !samePressingCancellation(old, incomingOrder))) {
      return { error: 'pressing-cancellation-immutable', id };
    }
  }
  return null;
}
