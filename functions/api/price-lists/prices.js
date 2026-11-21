// /api/price-lists/prices — les prix d'un tarif, et tous les prix d'un article.
//
//   GET ?merchant=…&list=<id>   → { ok, list, prices: [{ itemKey, variantKey, cents }] }
//   GET ?merchant=…&item=<key>  → { ok, item: { itemKey, name, mainCents },
//                                   lists: [{ id, name, isMain, cents, source }] }
//       source 'list' = un prix posé dans ce tarif ; 'main' = repli sur le principal.
//   Lecture : patron, opérateur, caisse appairée (tenantFor).
//
//   POST { merchant, rows: [{ listId, itemKey, price, free? }] }
//       Écriture en masse, un seul appel. `price` en centimes entiers ; null
//       retire le prix (l'article retombe sur le principal). 0 n'est accepté
//       qu'avec `free: true` (offert exprès) : sinon zero-price. Un prix par
//       article, comme le catalogue : une ligne de déclinaison (variantKey) est
//       refusée (variant-not-supported). Tout est vérifié avant la première
//       écriture : une ligne fausse refuse l'appel entier. Le tarif principal
//       s'écrit dans le catalogue, jamais ici (main-is-catalogue).
//   POST { merchant, action: 'derive', listId, pct, step, items?, preview? }
//       « + x % depuis le principal, arrondi au pas » sur tout le tarif, ou sur
//       les articles nommés. Avec `preview: true`, rien n'est écrit : la réponse
//       dit combien d'articles changeraient et combien passeraient sous leur
//       prix d'achat ({ total, changed, belowCost, samples }).
//   Écriture : patron ou gérant (canManage), et seulement sur un tarif du magasin.
import { json, isOperator } from '../../auth/_lib.js';
import { sessionTierAtLeast } from '../../auth/_session-tier.js';
import { tenantFor, ownerMerchant } from '../_private.js';
import {
  MAIN_ID, MAX_ROWS, str, isId, isKey, cleanPct, cleanStep, cleanPrice, derivePrice,
  visibleLists, findList, mainPrices, listPrices, priceOf, canManage, runBatches, tablesReady } from '../_price-lists.js';

const DEPS = { isOperator, sessionTierAtLeast, ownerMerchant };

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  const item = str(url.searchParams.get('item'), 80);
  if (item) {
    const main = await mainPrices(env, merchant);
    const base = main.get(item);
    const lists = await visibleLists(env, merchant);
    const out = [];
    for (const l of lists) {
      const p = priceOf(main, await listPrices(env, l), item);
      out.push({ id: l.id, name: l.name, isMain: l.isMain, channels: l.channels, cents: p.cents, source: l.isMain ? 'main' : p.source });
    }
    return json({ ok: true, item: { itemKey: item, name: base ? base.name : '', mainCents: base ? base.cents : null, costCents: base ? base.costCents : null }, lists: out });
  }
  const listId = str(url.searchParams.get('list'), 64);
  if (listId === MAIN_ID) {
    const main = await mainPrices(env, merchant);
    return json({ ok: true, list: { id: MAIN_ID, isMain: true }, prices: [...main].filter(([, p]) => !p.archived).map(([itemKey, p]) => ({ itemKey, variantKey: '', cents: p.cents, costCents: p.costCents })) });
  }
  const list = await findList(env, merchant, listId, { archived: true });
  if (!list) return json({ error: 'not-found' }, 404);
  const prices = await listPrices(env, list);
  const main = await mainPrices(env, merchant);
  return json({ ok: true, list: { id: list.id, name: list.name, isMain: false, shared: list.shared },
    prices: [...prices].map(([k, cents]) => {
      const itemKey = k.slice(0, -1), base = main.get(itemKey);
      return { itemKey, variantKey: '', cents, free: prices.free.has(itemKey), mainCents: base ? base.cents : null, costCents: base ? base.costCents : null };
    }) });
}

async function ownList(env, merchant, id) {
  if (!isId(id) || id === MAIN_ID) return null;
  return env.DB.prepare('SELECT id FROM price_lists WHERE merchant = ? AND id = ? AND is_main = 0').bind(merchant, id).first();
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'bad-json' }, 400);
  const merchant = str(b.merchant, 64);
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!(await canManage(request, env, merchant, DEPS))) return json({ error: 'forbidden' }, 403);
  if (!(await tablesReady(env))) return json({ error: 'pending-migration' }, 503);
  const now = Date.now();

  if (b.action === 'derive') {
    const listId = str(b.listId, 64);
    if (!(await ownList(env, merchant, listId))) return json({ error: listId === MAIN_ID ? 'main-is-catalogue' : 'not-found' }, listId === MAIN_ID ? 400 : 404);
    const pct = cleanPct(b.pct), step = b.step == null ? 0 : cleanStep(b.step);
    if (pct == null) return json({ error: 'bad-pct' }, 400);
    if (step == null) return json({ error: 'bad-step' }, 400);
    const only = Array.isArray(b.items) ? new Set(b.items.filter(isKey).slice(0, MAX_ROWS)) : null;
    const main = await mainPrices(env, merchant);
    const stmts = [];
    const current = b.preview ? await listPrices(env, { id: listId, owner: merchant }) : null;
    const plan = { total: 0, changed: 0, belowCost: 0, samples: [] };
    for (const [key, p] of main) {
      if (p.archived || (only && !only.has(key)) || !(p.cents > 0)) continue;   // un article à 0 au principal reste hors tarif
      const cents = derivePrice(p.cents, pct, step);
      if (current) {
        plan.total++;
        const before = current.has(key + '|') ? current.get(key + '|') : p.cents;
        if (before !== cents) plan.changed++;
        const under = p.costCents != null && cents < p.costCents;
        if (under) plan.belowCost++;
        if ((under || before !== cents) && plan.samples.length < 8) plan.samples.push({ itemKey: key, name: p.name, before, cents, costCents: p.costCents, belowCost: under });
        continue;
      }
      stmts.push(env.DB.prepare('INSERT OR REPLACE INTO item_prices (merchant, list_id, item_key, variant_key, price_cents, free, updated_ts) VALUES (?, ?, ?, \'\', ?, 0, ?)')
        .bind(merchant, listId, key, cents, now));
    }
    if (current) return json({ ok: true, preview: true, ...plan });
    await runBatches(env.DB, stmts);
    await env.DB.prepare('UPDATE price_lists SET updated_ts = ? WHERE merchant = ? AND id = ?').bind(now, merchant, listId).run();
    return json({ ok: true, written: stmts.length });
  }

  const rows = Array.isArray(b.rows) ? b.rows : null;
  if (!rows || !rows.length) return json({ error: 'no-rows' }, 400);
  if (rows.length > MAX_ROWS) return json({ error: 'too-many-rows', max: MAX_ROWS }, 413);
  const known = new Map();
  const clean = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const listId = str(r.listId, 64);
    if (listId === MAIN_ID) return json({ error: 'main-is-catalogue', row: i }, 400);
    if (!known.has(listId)) known.set(listId, !!(await ownList(env, merchant, listId)));
    if (!known.get(listId)) return json({ error: 'unknown-list', row: i }, 404);
    if (!isKey(r.itemKey)) return json({ error: 'bad-item', row: i }, 400);
    if (r.variantKey != null && r.variantKey !== '') return json({ error: 'variant-not-supported', row: i }, 400);
    const price = cleanPrice(r.price);
    if (price === undefined) return json({ error: 'bad-price', row: i }, 400);
    if (price === 0 && r.free !== true) return json({ error: 'zero-price', row: i }, 400);
    clean.push({ listId, itemKey: r.itemKey, price, free: price === 0 ? 1 : 0 });
  }
  const stmts = clean.map((r) => (r.price === null
    ? env.DB.prepare("DELETE FROM item_prices WHERE merchant = ? AND list_id = ? AND item_key = ?").bind(merchant, r.listId, r.itemKey)
    : env.DB.prepare("INSERT OR REPLACE INTO item_prices (merchant, list_id, item_key, variant_key, price_cents, free, updated_ts) VALUES (?, ?, ?, '', ?, ?, ?)")
      .bind(merchant, r.listId, r.itemKey, r.price, r.free, now)));
  await runBatches(env.DB, stmts);
  await runBatches(env.DB, [...known.keys()].map((id) => env.DB.prepare('UPDATE price_lists SET updated_ts = ? WHERE merchant = ? AND id = ?').bind(now, merchant, id)));
  return json({ ok: true, written: clean.filter((r) => r.price !== null).length, removed: clean.filter((r) => r.price === null).length });
}
