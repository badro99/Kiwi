// /api/price-lists/clients — le tarif par défaut d'une fiche client.
//
//   GET  ?merchant=…[&list=<id>][&client=<id>] → { ok, clients: [{ clientId, listId }] }
//        Lecture : patron, opérateur, caisse appairée (tenantFor).
//   POST { merchant, clientId, listId }         listId null ou 'main' = plus de défaut
//   POST { merchant, assign: [{ clientId, listId }] }   en masse (≤ 2 000)
//        Écriture : patron ou gérant (canManage). Le tarif doit être visible
//        par le magasin ; la fiche n'a pas à exister encore côté serveur (une
//        fiche créée hors ligne à la caisse se synchronise après).
import { json, isOperator } from '../../auth/_lib.js';
import { sessionTierAtLeast } from '../../auth/_session-tier.js';
import { tenantFor, ownerMerchant } from '../_private.js';
import { MAIN_ID, str, isId, findList, canManage, runBatches } from '../_price-lists.js';

const DEPS = { isOperator, sessionTierAtLeast, ownerMerchant };
const CLIENT_RE = /^[^\u0000-\u001f]{1,64}$/;

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const list = str(url.searchParams.get('list'), 64), client = str(url.searchParams.get('client'), 64);
  let sql = 'SELECT client_id, list_id FROM price_list_clients WHERE merchant = ?';
  const args = [merchant];
  if (list) { sql += ' AND list_id = ?'; args.push(list); }
  if (client) { sql += ' AND client_id = ?'; args.push(client); }
  try {
    const rs = ((await env.DB.prepare(sql + ' LIMIT 20000').bind(...args).all()).results) || [];
    return json({ ok: true, clients: rs.map((r) => ({ clientId: r.client_id, listId: r.list_id })) });
  } catch (_) { return json({ ok: true, clients: [], degraded: true }); }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'bad-json' }, 400);
  const merchant = str(b.merchant, 64);
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!(await canManage(request, env, merchant, DEPS))) return json({ error: 'forbidden' }, 403);
  const rows = Array.isArray(b.assign) ? b.assign : [{ clientId: b.clientId, listId: b.listId }];
  if (!rows.length || rows.length > 2000) return json({ error: 'bad-rows' }, 400);
  const lists = new Map(), now = Date.now(), stmts = [];
  for (const r of rows) {
    const clientId = typeof (r && r.clientId) === 'string' ? r.clientId.trim() : '';
    if (!CLIENT_RE.test(clientId)) return json({ error: 'bad-client' }, 400);
    const listId = r.listId == null || r.listId === '' ? MAIN_ID : str(r.listId, 64);
    if (listId === MAIN_ID) {
      stmts.push(env.DB.prepare('DELETE FROM price_list_clients WHERE merchant = ? AND client_id = ?').bind(merchant, clientId));
      continue;
    }
    if (!lists.has(listId)) lists.set(listId, isId(listId) ? !!(await findList(env, merchant, listId)) : false);
    if (!lists.get(listId)) return json({ error: 'unknown-list' }, 404);
    stmts.push(env.DB.prepare(`INSERT INTO price_list_clients (merchant, client_id, list_id, updated_ts) VALUES (?, ?, ?, ?)
      ON CONFLICT(merchant, client_id) DO UPDATE SET list_id = excluded.list_id, updated_ts = excluded.updated_ts`).bind(merchant, clientId, listId, now));
  }
  await runBatches(env.DB, stmts);
  return json({ ok: true, written: stmts.length });
}
