// Hotel commercial accounts and accepted nightly quotes. Never a tax engine or invoice.
import { stayOptions } from './_stay-options.js';
export const FEATURE = 'hotel-commercial'; // Private route only; not in /api/store FEATURES.
export const BOARDS = ['room_only', 'bb', 'hb_lunch', 'hb_dinner', 'full_board'];
export const text = (v, n = 160) => String(v == null ? '' : v).trim().slice(0, n);
export function dateOK(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !v.startsWith('0000-') &&
    Number.isFinite(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v;
}
export function problem(code) { throw Object.assign(new Error(code), { code }); }
function integer(v, min, max) { return Number.isSafeInteger(v) && v >= min && v <= max; }
export function account(raw) {
  const a = raw || {};
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(a.id || '') || !['individual', 'agency', 'company'].includes(a.kind) || !text(a.name)) problem('invalid-account');
  if (!integer(a.paymentDays, 0, 365)) problem('invalid-payment-days');
  return { id: a.id, kind: a.kind, name: text(a.name), legalName: text(a.legalName),
    address: text(a.address, 500), city: text(a.city, 100), country: text(a.country, 100),
    ice: text(a.ice, 40), taxId: text(a.taxId, 40), rc: text(a.rc, 40),
    contact: text(a.contact), email: text(a.email), phone: text(a.phone, 40),
    paymentDays: a.paymentDays, notes: text(a.notes, 600), archived: a.archived === true };
}
export function contract(raw) {
  const r = raw || {};
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(r.id || '') || !text(r.name) || !text(r.accountId, 80) || !text(r.roomTypeId, 64)) problem('invalid-contract');
  if (!dateOK(r.from) || !dateOK(r.to) || r.to < r.from) problem('invalid-dates');
  if (!integer(r.occupancy, 1, 3) || !BOARDS.includes(r.board) || !['room', 'person'].includes(r.unit)) problem('invalid-formula');
  if (!integer(r.amountCents, 0, 100000000) || !['inclusive', 'exclusive'].includes(r.taxBasis)) problem('invalid-price');
  return { id: r.id, name: text(r.name), accountId: text(r.accountId, 80), roomTypeId: text(r.roomTypeId, 64),
    from: r.from, to: r.to, occupancy: r.occupancy, board: r.board, unit: r.unit,
    amountCents: r.amountCents, taxBasis: r.taxBasis, currency: 'MAD', archived: r.archived === true };
}
export async function readCommercial(env, merchant) {
  const row = await env.DB.prepare('SELECT data,rev FROM store_docs WHERE merchant=? AND feature=?').bind(merchant, FEATURE).first();
  if (!row) return { rev: 0, accounts: [], contracts: [] };
  // A corrupt or truncated directory must never be replaced by an empty one.
  let d; try { d = JSON.parse(row.data); } catch (_) { problem('commercial-data-invalid'); }
  if (!d || !Array.isArray(d.accounts) || !Array.isArray(d.contracts)) problem('commercial-data-invalid');
  return { rev: Number(row.rev), accounts: d.accounts.map(account), contracts: d.contracts.map(contract) };
}
export function quote(doc, input) {
  const { accountId, roomTypeId, checkIn, checkOut, occupancy, board } = input;
  if (!accountId || !String(accountId).trim()) problem('account-required');
  const a = doc.accounts.find(x => x.id === accountId);
  if (!a) problem('account-not-found');
  if (a.archived) problem('account-archived');
  if (!dateOK(checkIn) || !dateOK(checkOut) || checkOut <= checkIn) problem('invalid-dates');
  const count = (Date.parse(checkOut + 'T12:00:00Z') - Date.parse(checkIn + 'T12:00:00Z')) / 86400000;
  if (count > 365 || !integer(occupancy, 1, 3) || !BOARDS.includes(board)) problem('invalid-formula');
  const rows = [];
  for (let i = 0; i < count; i++) {
    const date = new Date(Date.parse(checkIn + 'T12:00:00Z') + i * 86400000).toISOString().slice(0, 10);
    const matches = doc.contracts.filter(r => !r.archived && r.accountId === accountId && r.roomTypeId === roomTypeId && r.occupancy === occupancy && r.board === board && r.from <= date && r.to >= date);
    if (matches.length !== 1) problem(matches.length ? 'rate-overlap' : 'rate-gap');
    const r = matches[0];
    if (r.amountCents * (r.unit === 'person' ? occupancy : 1) > 100000000) problem('price-overflow');
    rows.push({ date, contractId: r.id, label: r.name, unit: r.unit, quantity: r.unit === 'person' ? occupancy : 1,
      unitCents: r.amountCents, amountCents: r.amountCents * (r.unit === 'person' ? occupancy : 1), taxBasis: r.taxBasis });
  }
  if (new Set(rows.map(r => r.taxBasis)).size !== 1) problem('mixed-tax-basis');
  if (rows.reduce((s, r) => s + r.amountCents, 0) > 10000000000) problem('price-overflow');
  return { currency: 'MAD', taxBasis: rows[0].taxBasis, totalCents: rows.reduce((s, r) => s + r.amountCents, 0), rows };
}
export function commercialSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // Bounded preservation for revisioned reservation documents, not trust in submitted quotes.
  let billTo = null; try { if (raw.billTo) billTo = account(raw.billTo); } catch (_) { return null; }
  const q = raw.quote;
  const rows = (Array.isArray(q?.rows) ? q.rows : []).slice(0, 365).map(r => ({
    date: text(r.date, 10), contractId: text(r.contractId, 80), label: text(r.label), unit: r.unit === 'person' ? 'person' : 'room',
    quantity: Number(r.quantity) || 1, unitCents: Number(r.unitCents) || 0, amountCents: Number(r.amountCents) || 0, taxBasis: r.taxBasis === 'exclusive' ? 'exclusive' : 'inclusive',
  }));
  return { accountId: text(raw.accountId, 80), billTo, booker: text(raw.booker), voucher: text(raw.voucher, 100),
    board: BOARDS.includes(raw.board) ? raw.board : 'room_only', occupancy: Number(raw.occupancy) || 1,
    quoted: raw.quoted === true, acceptedAt: Number(raw.acceptedAt) || 0,
    quote: q ? { currency: 'MAD', taxBasis: q.taxBasis === 'exclusive' ? 'exclusive' : 'inclusive', totalCents: Number(q.totalCents) || 0, rows } : null };
}

// Legacy whole-document sync must not erase or rewrite server-accepted terms.
// Such stays are edited exclusively through /hotel/stays, with a new quote when needed.
export async function validateCommercialSync(env, merchant, previous, next) {
  const protectedStay = b => b?.commercial || b?.hotel?.dossierId || b?.hotel?.dayUse;
  const before = new Map((previous?.bookings || []).filter(protectedStay).map(b => [b.id, b]));
  const after = new Map((next?.bookings || []).map(b => [b.id, b]));
  const ids = new Set([...before.keys(), ...[...after.values()].filter(protectedStay).map(b => b.id)]);
  if (!ids.size) return false;
  const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hotel_reservations'").first();
  const protectedValue = b => JSON.stringify({ commercial: commercialSnapshot(b?.commercial), pricing: b?.pricing && typeof b.pricing === 'object' ? b.pricing : null, options: stayOptions(b?.hotel),
    serviceId: b?.serviceId, resourceId: b?.resourceId, startAt: b?.startAt, endAt: b?.endAt,
    partySize: b?.partySize, status: b?.status, checkIn:b?.hotel?.checkIn, checkOut:b?.hotel?.checkOut,nights:b?.hotel?.nights,rate: b?.hotel?.rate, total: b?.hotel?.total });
  for (const id of ids) {
    let saved = before.get(id);
    if (table) {
      const row = await env.DB.prepare('SELECT raw_json FROM hotel_reservations WHERE merchant=? AND id=?').bind(merchant, id).first();
      if (row) { try { saved = JSON.parse(row.raw_json); } catch (_) { problem('commercial-data-invalid'); } }
    }
    if (!saved || !after.has(id) || protectedValue(saved) !== protectedValue(after.get(id))) problem('commercial-stays-use-api');
  }
  return true;
}
