// /api/price-lists — les tarifs d'un magasin (functions/api/_price-lists.js).
//
//   GET  ?merchant=…[&archived=1]
//        → { ok, lists: [{ id, name, isMain, channels, sites, compareListId,
//             archived, sort, shared, priced, clients }] }
//        Lecture : patron, opérateur, caisse appairée (tenantFor).
//
//   POST { merchant, action, … }   patron ou gérant (canManage), magasin actif
//     create  { name, channels, sites, base: 'main'|'empty'|<listId>, pct, step, compareListId }
//             base 'main' (défaut) recopie le prix principal de chaque article,
//             ± pct, arrondi au pas (centimes : 50, 100, 500…).
//     update  { id, name?, channels?, sites?, compareListId?, sort? }
//             id 'main' : seul le nom affiché change.
//     archive { id, replacement? } · delete { id, replacement? }
//             Les fiches clients et les prix barrés qui visaient ce tarif passent
//             au remplaçant (le principal par défaut). Un tarif déjà porté par
//             une vente n'est jamais effacé : il est archivé, son nom reste lisible.
//     reorder { ids: [...] }
import { json, isOperator } from '../../auth/_lib.js';
import { sessionTierAtLeast } from '../../auth/_session-tier.js';
import { tenantFor, ownerMerchant } from '../_private.js';
import {
  MAIN_ID, MAX_LISTS, str, isId, cleanChannels, cleanSites, cleanPct, cleanStep, derivePrice,
  visibleLists, findList, mainPrices, listPrices, canManage, newListId, runBatches,
} from '../_price-lists.js';

const DEPS = { isOperator, sessionTierAtLeast, ownerMerchant };

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  let lists;
  try { lists = await visibleLists(env, merchant, { archived: url.searchParams.get('archived') === '1' }); }
  catch (_) { return json({ ok: true, lists: [], degraded: true }); }
  const priced = new Map(), clients = new Map();
  try {
    const p = ((await env.DB.prepare('SELECT list_id, COUNT(*) AS n FROM item_prices WHERE merchant = ? GROUP BY list_id').bind(merchant).all()).results) || [];
    p.forEach((r) => priced.set(r.list_id, Number(r.n)));
    const c = ((await env.DB.prepare('SELECT list_id, COUNT(*) AS n FROM price_list_clients WHERE merchant = ? GROUP BY list_id').bind(merchant).all()).results) || [];
    c.forEach((r) => clients.set(r.list_id, Number(r.n)));
  } catch (_) { /* compteurs facultatifs */ }
  return json({ ok: true, merchant, lists: lists.map((l) => ({ ...l, priced: priced.get(l.id) || 0, clients: clients.get(l.id) || 0 })) });
}

async function readBody(request) {
  try { const b = await request.json(); return b && typeof b === 'object' ? b : null; } catch (_) { return null; }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const b = await readBody(request);
  if (!b) return json({ error: 'bad-json' }, 400);
  const asked = str(b.merchant, 64);
  if (!asked) return json({ error: 'merchant-required' }, 400);
  if (!(await canManage(request, env, asked, DEPS))) return json({ error: 'forbidden' }, 403);
  const merchant = asked;
  const now = Date.now();
  const action = str(b.action, 16);

  if (action === 'create') {
    const name = str(b.name, 60);
    if (!name) return json({ error: 'name-required' }, 400);
    const own = ((await env.DB.prepare('SELECT id, name FROM price_lists WHERE merchant = ? AND is_main = 0 AND archived = 0').bind(merchant).all()).results) || [];
    if (own.length >= MAX_LISTS) return json({ error: 'too-many-lists' }, 409);
    if (own.some((r) => String(r.name).toLowerCase() === name.toLowerCase())) return json({ error: 'name-taken' }, 409);
    const pct = b.pct == null ? 0 : cleanPct(b.pct);
    const step = b.step == null ? 0 : cleanStep(b.step);
    if (pct == null) return json({ error: 'bad-pct' }, 400);
    if (step == null) return json({ error: 'bad-step' }, 400);
    const base = b.base == null ? MAIN_ID : str(b.base, 64);
    let source = null;
    if (base !== 'empty' && base !== MAIN_ID) {
      source = await findList(env, merchant, base);
      if (!source) return json({ error: 'unknown-base' }, 400);
    }
    const compare = b.compareListId == null || b.compareListId === '' ? null : str(b.compareListId, 64);
    if (compare && compare !== MAIN_ID && !(await findList(env, merchant, compare))) return json({ error: 'unknown-compare' }, 400);
    const id = newListId();
    await env.DB.prepare(`INSERT INTO price_lists (merchant, id, name, is_main, channels, sites, compare_list_id, archived, sort, created_ts, updated_ts)
      VALUES (?, ?, ?, 0, ?, ?, ?, 0, ?, ?, ?)`)
      .bind(merchant, id, name, JSON.stringify(cleanChannels(b.channels)), JSON.stringify(cleanSites(b.sites, merchant)),
        compare, own.length + 1, now, now).run();
    let seeded = 0;
    if (base !== 'empty') {
      const main = await mainPrices(env, merchant);
      const from = source && !source.isMain ? await listPrices(env, source) : null;
      const rows = [];
      for (const [key, p] of main) {
        if (p.archived) continue;
        const start = from ? (from.get(key + '|') ?? p.cents) : p.cents;
        rows.push(env.DB.prepare('INSERT OR REPLACE INTO item_prices (merchant, list_id, item_key, variant_key, price_cents, updated_ts) VALUES (?, ?, ?, \'\', ?, ?)')
          .bind(merchant, id, key, derivePrice(start, pct, step), now));
      }
      await runBatches(env.DB, rows);
      seeded = rows.length;
    }
    return json({ ok: true, id, seeded });
  }

  if (action === 'update') {
    const id = str(b.id, 64);
    if (id === MAIN_ID) {
      const name = str(b.name, 60);
      if (!name) return json({ error: 'name-required' }, 400);
      await env.DB.prepare(`INSERT INTO price_lists (merchant, id, name, is_main, channels, sites, archived, sort, created_ts, updated_ts)
        VALUES (?, 'main', ?, 1, '[]', '[]', 0, 0, ?, ?)
        ON CONFLICT(merchant, id) DO UPDATE SET name = excluded.name, updated_ts = excluded.updated_ts`)
        .bind(merchant, name, now, now).run();
      return json({ ok: true, id });
    }
    const row = isId(id) ? await env.DB.prepare('SELECT * FROM price_lists WHERE merchant = ? AND id = ? AND is_main = 0').bind(merchant, id).first() : null;
    if (!row) return json({ error: 'not-found' }, 404);
    const sets = [], vals = [];
    if (b.name != null) {
      const name = str(b.name, 60);
      if (!name) return json({ error: 'name-required' }, 400);
      const clash = await env.DB.prepare('SELECT id FROM price_lists WHERE merchant = ? AND id != ? AND archived = 0 AND lower(name) = lower(?)').bind(merchant, id, name).first();
      if (clash) return json({ error: 'name-taken' }, 409);
      sets.push('name = ?'); vals.push(name);
    }
    if (b.channels != null) { sets.push('channels = ?'); vals.push(JSON.stringify(cleanChannels(b.channels))); }
    if (b.sites != null) { sets.push('sites = ?'); vals.push(JSON.stringify(cleanSites(b.sites, merchant))); }
    if (b.compareListId !== undefined) {
      const compare = b.compareListId == null || b.compareListId === '' ? null : str(b.compareListId, 64);
      if (compare === id) return json({ error: 'bad-compare' }, 400);
      if (compare && compare !== MAIN_ID && !(await findList(env, merchant, compare))) return json({ error: 'unknown-compare' }, 400);
      sets.push('compare_list_id = ?'); vals.push(compare);
    }
    if (b.sort != null) { sets.push('sort = ?'); vals.push(Math.max(0, Math.min(999, Math.round(Number(b.sort) || 0)))); }
    if (b.archived === false) { sets.push('archived = 0'); }
    if (!sets.length) return json({ error: 'nothing-to-change' }, 400);
    sets.push('updated_ts = ?'); vals.push(now);
    await env.DB.prepare(`UPDATE price_lists SET ${sets.join(', ')} WHERE merchant = ? AND id = ?`).bind(...vals, merchant, id).run();
    return json({ ok: true, id });
  }

  if (action === 'archive' || action === 'delete') {
    const id = str(b.id, 64);
    if (id === MAIN_ID) return json({ error: 'main-is-permanent' }, 400);
    const row = isId(id) ? await env.DB.prepare('SELECT id FROM price_lists WHERE merchant = ? AND id = ? AND is_main = 0').bind(merchant, id).first() : null;
    if (!row) return json({ error: 'not-found' }, 404);
    const replacement = b.replacement == null || b.replacement === '' ? MAIN_ID : str(b.replacement, 64);
    if (replacement === id) return json({ error: 'bad-replacement' }, 400);
    if (replacement !== MAIN_ID && !(await findList(env, merchant, replacement))) return json({ error: 'unknown-replacement' }, 400);
    const stmts = [
      replacement === MAIN_ID
        ? env.DB.prepare('DELETE FROM price_list_clients WHERE merchant = ? AND list_id = ?').bind(merchant, id)
        : env.DB.prepare('UPDATE price_list_clients SET list_id = ?, updated_ts = ? WHERE merchant = ? AND list_id = ?').bind(replacement, now, merchant, id),
      env.DB.prepare('UPDATE price_lists SET compare_list_id = ?, updated_ts = ? WHERE merchant = ? AND compare_list_id = ?')
        .bind(replacement === MAIN_ID ? MAIN_ID : replacement, now, merchant, id),
    ];
    let used = null;
    try { used = await env.DB.prepare('SELECT 1 AS x FROM sales WHERE merchant = ? AND price_list_id = ? LIMIT 1').bind(merchant, id).first(); } catch (_) { used = { x: 1 }; }
    const hard = action === 'delete' && !used;
    if (hard) {
      stmts.push(env.DB.prepare('DELETE FROM item_prices WHERE merchant = ? AND list_id = ?').bind(merchant, id));
      stmts.push(env.DB.prepare('DELETE FROM price_lists WHERE merchant = ? AND id = ?').bind(merchant, id));
    } else {
      stmts.push(env.DB.prepare('UPDATE price_lists SET archived = 1, updated_ts = ? WHERE merchant = ? AND id = ?').bind(now, merchant, id));
    }
    await runBatches(env.DB, stmts);
    return json({ ok: true, id, replacement, deleted: hard, archived: !hard });
  }

  if (action === 'reorder') {
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter(isId).slice(0, 80);
    await runBatches(env.DB, ids.map((id, i) => env.DB.prepare('UPDATE price_lists SET sort = ?, updated_ts = ? WHERE merchant = ? AND id = ? AND is_main = 0').bind(i + 1, now, merchant, id)));
    return json({ ok: true });
  }

  return json({ error: 'bad-action' }, 400);
}
