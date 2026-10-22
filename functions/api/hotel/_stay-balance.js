// Only explicitly linked folios count. Room number alone can identify a later
// guest. Paid lodging lines settle the accepted stay price; never add it twice.
// `linked` says whether a dashboard folio belongs to this stay. Without one the
// server does not know what was paid: the hotel till keeps its own payments, so
// an absent folio is not an unpaid stay, and the checkout guard stays silent.
export function stayBalance(stay, folios = [], charges = []) {
  const cents = value => {
    const n = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(n)) throw new Error('invalid-stay-money');
    return n;
  };
  let total = cents(stay.hotel.total), paid = 0;
  const own = folios.filter(f => f.stayId === stay.id);
  for (const f of own) {
    for (const line of f.lines || []) {
      const amount = cents(line.amt);
      if (line.src !== 'room') total += amount;
      if (line.paid === true) paid += amount;
    }
  }
  const reversed = new Set(charges.filter(c => c.kind === 'room-charge-reversal').map(c => c.reversal_of));
  for (const c of charges) {
    if (c.kind === 'room-charge' && !reversed.has(c.id)) total += Number(c.amount_cents);
  }
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(paid) || !Number.isSafeInteger(total - paid)) throw new Error('invalid-stay-money');
  return { totalCents: total, paidCents: paid, owedCents: total - paid, linked: own.length > 0 };
}
export const chargeBalanceSQL = 'SELECT id,kind,amount_cents,reversal_of FROM hotel_room_charge_events WHERE merchant=? AND stay_id=? ORDER BY id';
export async function checkoutBalance(env, merchant, stay, roomsData, ledger) {
  const rooms = typeof roomsData === 'string' ? JSON.parse(roomsData) : roomsData;
  const charges = ledger ? (await env.DB.prepare(
    chargeBalanceSQL
  ).bind(merchant, stay.id).all()).results || [] : [];
  const balance = stayBalance(stay, Array.isArray(rooms?.folios) ? rooms.folios : [], charges);
  Object.defineProperty(balance, 'guard', { value: { roomsData: roomsData ?? null, ledger, stayId: stay.id, charges: JSON.stringify(charges) } });
  return balance;
}
