// « Client prévenu » on a pressing ticket is custody evidence: who told the
// customer, by which channel, when. The till writes it into the generic
// `pressing-orders` snapshot (assets/pressing-ops.js markNotified), so until now
// the server took its word for all of it, and a later snapshot from another
// device could simply send the order back without it and clear it.
//
// On every accepted snapshot the server now
//   - keeps a notification it already holds exactly as recorded (a later
//     snapshot cannot clear, rewrite or replace it);
//   - validates a new one: a known channel, a named author, and a time that is
//     a real instant no more than five minutes ahead of the server's clock
//     (otherwise the server's own time is used);
//   - stamps `receivedAt`, the server's time of first sight, beside the device's.
// What it cannot do is prove WHO the author is: the snapshot carries no staff
// proof, so `by` stays what the till says. Binding it to a verified staff code
// needs the same per-command capability the refund uses (owner decision).

const CHANNELS = ['call', 'sms', 'whatsapp', 'in-person'];
const AHEAD_MS = 5 * 60000;

const text = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

function validNotification(n, now) {
  if (!n || typeof n !== 'object' || !CHANNELS.includes(n.channel)) return null;
  const by = n.by && typeof n.by === 'object' ? { id: text(n.by.id, 80), name: text(n.by.name, 100) } : null;
  if (!by || !(by.id || by.name)) return null;
  const asked = Date.parse(n.at);
  const at = Number.isFinite(asked) && asked <= now + AHEAD_MS ? new Date(asked).toISOString() : new Date(now).toISOString();
  return { at, by, channel: n.channel, receivedAt: new Date(now).toISOString() };
}

export function freezePressingNotifications(current, incoming, now = Date.now()) {
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.orders)) return incoming;
  const known = new Map();
  (current && Array.isArray(current.orders) ? current.orders : []).forEach((o) => {
    if (o && o.id) known.set(String(o.id), o);
  });
  incoming.orders.forEach((order) => {
    if (!order || !order.id) return;
    const old = known.get(String(order.id));
    if (old && old.notification && old.notification.channel) {
      order.notification = old.notification;
      order.notified = true;
      order.notifiedAt = old.notifiedAt || old.notification.at;
      return;
    }
    if (old && old.notified === true) order.notified = true; // legacy flag: never cleared
    if (order.notification !== undefined) {
      const fresh = validNotification(order.notification, now);
      if (fresh) {
        order.notification = fresh;
        order.notified = true;
        order.notifiedAt = fresh.at;
      } else {
        delete order.notification;
        if (!(old && old.notified === true)) { order.notified = false; delete order.notifiedAt; }
      }
    }
  });
  return incoming;
}
