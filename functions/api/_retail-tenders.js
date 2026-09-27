// Retail receipts remain one sale/idempotency key. Tender parts are immutable
// payment attribution within that receipt, not extra sales or extra stock moves.
const METHODS = new Set(['cash', 'card', 'transfer', 'cheque', 'credit', 'delivery']);

export function validateRetailTenders(raw, amountCents, ticketAmountCents, consignedCents = 0) {
  if (raw == null) return null; // legacy tills did not send tender detail
  if (!Array.isArray(raw) || !raw.length || raw.length > 8 || !Number.isSafeInteger(ticketAmountCents)
      || ticketAmountCents <= 0 || !Number.isSafeInteger(consignedCents) || consignedCents < 0) return false;
  const parts = [];
  let full = 0, received = 0;
  for (const part of raw) {
    const method = String(part && part.method || '');
    const cents = Number(part && part.amountCents);
    if (!METHODS.has(method) || !Number.isSafeInteger(cents) || cents <= 0) return false;
    full += cents;
    if (method !== 'credit' && method !== 'delivery') received += cents;
    parts.push({ method, amountCents: cents });
  }
  // The ticket is fully allocated, while the owner revenue excludes consigned
  // liability. A voucher or unpaid delivery is not money received today.
  if (full !== ticketAmountCents || Math.max(0, received - consignedCents) !== amountCents) return false;
  return parts;
}

export function retailTenderMethod(parts) {
  const money = parts.filter(p => p.method !== 'credit' && p.method !== 'delivery');
  if (money.length === 1 && parts.length === 1) return money[0].method;
  if (money.length) return 'split';
  return parts.some(p => p.method === 'delivery') ? 'delivery' : 'credit';
}
