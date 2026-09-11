import { json, entitledMerchant } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { FEATURE, account, contract, readCommercial, quote, text, problem } from './_commercial.js';

export async function authorize(request, env, merchant) {
  if (!env.DB || !env.AUTH_SECRET) return '';
  // An owner session or a named operator, not an anonymous paired counter.
  const allowed = await entitledMerchant(request, env, merchant);
  if (!allowed || allowed !== merchant || await tenantFor(request, env, merchant, { strict: true }) !== merchant) return '';
  const row = await env.DB.prepare('SELECT type FROM merchant_config WHERE merchant=?').bind(allowed).first();
  return /hotel|hôtel|riad/i.test(row?.type || '') ? allowed : '';
}
const reply = (body, status = 200) => json(body, status, { 'Cache-Control': 'no-store' });
export async function onRequestGet({ request, env }) {
  try {
    const merchant = await authorize(request, env, new URL(request.url).searchParams.get('merchant'));
    if (!merchant) return reply({ error: 'unauthorized' }, 401);
    return reply({ ok: true, ...await readCommercial(env, merchant) });
  } catch (_) { return reply({ error: 'unavailable' }, 503); }
}
export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch (_) { return reply({ error: 'bad-json' }, 400); }
  try {
    const merchant = await authorize(request, env, b?.merchant);
    if (!merchant) return reply({ error: 'unauthorized' }, 401);
    const d = await readCommercial(env, merchant);
    if (b.action === 'quote') return reply({ ok: true, rev: d.rev, quote: quote(d, b) });
    if (!['account', 'contract'].includes(b.action)) problem('bad-action');
    if (!Number.isSafeInteger(b.rev) || b.rev !== d.rev) return reply({ error: 'stale', rev: d.rev }, 409);
    const item = b.action === 'account' ? account(b.item) : contract(b.item);
    const key = b.action === 'account' ? 'accounts' : 'contracts';
    if (b.action === 'contract') {
      if (!d.accounts.some(a => a.id === item.accountId && (!a.archived || item.archived))) problem('account-unavailable');
      const row = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='rooms'").bind(merchant).first();
      let rooms; try { rooms = JSON.parse(row?.data || '{}'); } catch (_) { problem('rooms-invalid'); }
      if (!rooms.roomTypes?.some(t => t.id === item.roomTypeId && !t.deletedAt)) problem('room-type-not-found');
      if (!item.archived && d.contracts.some(r => r.id !== item.id && !r.archived && r.accountId === item.accountId && r.roomTypeId === item.roomTypeId && r.occupancy === item.occupancy && r.board === item.board && r.from <= item.to && item.from <= r.to)) problem('rate-overlap');
    }
    const i = d[key].findIndex(x => x.id === item.id);
    if (i < 0) d[key].push(item); else d[key][i] = item;
    if (d.accounts.length > 2000 || d.contracts.length > 5000) problem('directory-limit');
    const data = JSON.stringify({ v: 1, accounts: d.accounts, contracts: d.contracts });
    if (new TextEncoder().encode(data).length > 1000000) problem('directory-limit');
    // Atomic compare-and-swap: another operator's edits cannot be silently lost.
    const result = d.rev === 0
      ? await env.DB.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,1,?) ON CONFLICT(merchant,feature) DO NOTHING').bind(merchant, FEATURE, data, Date.now()).run()
      : await env.DB.prepare('UPDATE store_docs SET data=?,rev=rev+1,updated_ts=? WHERE merchant=? AND feature=? AND rev=?').bind(data, Date.now(), merchant, FEATURE, d.rev).run();
    if (Number(result.meta?.changes) !== 1) return reply({ error: 'stale' }, 409);
    return reply({ ok: true, rev: d.rev + 1, accounts: d.accounts, contracts: d.contracts });
  } catch (e) {
    const code = text(e?.code, 80);
    return reply({ error: code || 'unavailable' }, code && code !== 'commercial-data-invalid' ? 400 : 503);
  }
}
