/* /api/channel/glovo/menu — la carte Kiwi chez Glovo, pour le patron.
 *
 * GET  ?merchant=   l'état de chaque adresse (dernier envoi de la carte, dernier
 *                   lot, envois du jour), relu chez Glovo quand un envoi ou un
 *                   lot est encore « PROCESSING » ; l'aperçu de ce qui partirait
 *                   (produits, articles écartés et pourquoi).
 * POST { merchant, action: 'push', storeId }   envoyer la carte entière (≤ 5/jour)
 * POST { merchant, action: 'sync' }            pousser dispo et prix changés
 *
 * Le patron ou un responsable connecté au tableau de bord seulement : la
 * caisse n'envoie pas de carte (ses ruptures partent seules, voir
 * functions/api/menu/availability.js). */
import { entitledMerchant, json } from '../../../auth/_lib.js';
import { buildGlovoMenu, MENU_UPLOADS_PER_DAY, pushGlovoMenu, readKiwiMenu, syncGlovoItems, verifyGlovoBulk, verifyGlovoMenu } from './_glovo-menu.js';
import { storesOf } from './_glovo-ops.js';

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const owner = async (request, env, asked) => SLUG.test(asked) && (await entitledMerchant(request, env, asked)) === asked;
const parse = (t) => { try { return JSON.parse(t || 'null'); } catch (_) { return null; } };

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const merchant = String(url.searchParams.get('merchant') || '').slice(0, 64);
  if (!(await owner(request, env, merchant))) return json({ error: 'unauthorized' }, 401);
  let { migrated, stores } = await storesOf(env, merchant);
  if (migrated && env.GLOVO_TOKEN) {
    for (const s of stores) {
      if (s.menu_status === 'PROCESSING') await verifyGlovoMenu(env, merchant, s.store_id);
      if (s.bulk_status === 'PROCESSING') await verifyGlovoBulk(env, merchant, s.store_id);
    }
    ({ stores } = await storesOf(env, merchant));
  }
  const kiwi = await readKiwiMenu(env, merchant);
  const built = kiwi ? buildGlovoMenu(kiwi) : null;
  const today = new Date().toISOString().slice(0, 10);
  return json({
    ok: true, migrated, configured: !!env.GLOVO_TOKEN, limitPerDay: MENU_UPLOADS_PER_DAY,
    preview: built ? { products: built.menu.products.length, attributes: built.menu.attributes.length,
      unavailable: built.menu.products.filter((p) => !p.available).length, skipped: built.skipped.slice(0, 30) } : null,
    stores: stores.map((s) => ({
      storeId: String(s.store_id), status: String(s.status || 'active'),
      menu: s.menu_status ? { status: String(s.menu_status), ts: Number(s.menu_ts) || null, detail: parse(s.menu_detail) } : null,
      bulk: s.bulk_status ? { status: String(s.bulk_status), ts: Number(s.bulk_ts) || null, detail: parse(s.bulk_detail) } : null,
      uploadsToday: s.menu_day === today ? Number(s.menu_count) || 0 : 0,
      apiError: s.api_err ? String(s.api_err) : null,
    })),
  });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = String((b && b.merchant) || '').slice(0, 64);
  if (!(await owner(request, env, merchant))) return json({ error: 'unauthorized' }, 401);
  if (!env.GLOVO_TOKEN) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  /* L'adresse que Glovo lira : celle du site, en https (jamais un en-tête Host). */
  const origin = String(env.PUBLIC_ORIGIN || (url.protocol === 'https:' ? url.origin : '')).replace(/\/+$/, '');
  if (b.action === 'push') {
    const r = await pushGlovoMenu(env, merchant, String(b.storeId || ''), origin);
    return r.ok ? json(r) : json({ error: r.error, errors: r.errors, skipped: r.skipped, used: r.used }, r.status || 400);
  }
  if (b.action === 'sync') return json(await syncGlovoItems(env, merchant));
  return json({ error: 'bad-action' }, 400);
}
