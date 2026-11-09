/* /api/directory/listing · la fiche premium d'un client Kiwi, tenue par lui.
 *   GET  ?merchant=<slug>                 → { listing|null, suggested, url }
 *   POST { merchant, on, name, trade, city, address, description,
 *          website, phone, showPhone, whatsapp } → { ok, listing, url }
 *
 * Session PROPRIÉTAIRE seulement (ni caisse appairée, ni employé, ni
 * laissez-passer d'équipe) : apparaître dans un annuaire public est un geste
 * de patron. Éteinte par défaut ; « on » publie tout de suite (le client est
 * connu, payant, et sa fiche se retire en un appui), « off » la cache sans
 * l'effacer. Une fiche retirée par l'équipe Kiwi (status `removed`) ne se
 * rallume pas d'ici. Rien de privé n'est publié : le téléphone ne l'est que
 * si `showPhone`, et l'enrichissement (horaires, carte, réservation) est lu
 * au moment de l'affichage, jamais recopié. */
import { activeAccountSession, entitledMerchant, json } from '../../auth/_lib.js';
import { normalizePhone } from '../_phone.js';
import { sanitizeListing, baseSlug, uniqueSlug, dedupeKey, missingTable, tradeById, TRADES, CITIES } from '../_directory.js';
import { BASE } from '../_directory-page.js';

const MERCHANT_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const OWN = 'id, slug, status, name, trade, city, address, description, website, show_phone, whatsapp, contact_phone, updated_ts';

async function ownerOf(request, env, asked) {
  const merchant = String(asked || '').slice(0, 64);
  if (!MERCHANT_RE.test(merchant)) return '';
  try {
    if (!(await activeAccountSession(request, env))) return '';
    return (await entitledMerchant(request, env, merchant)) === merchant ? merchant : '';
  } catch (_) { return ''; }
}

const view = (r) => r && {
  slug: r.slug, on: r.status === 'approved', removed: r.status === 'removed', name: r.name, trade: r.trade, city: r.city,
  address: r.address, description: r.description, website: r.website, phone: r.contact_phone,
  showPhone: Number(r.show_phone) === 1, whatsapp: Number(r.whatsapp) === 1, updated: Number(r.updated_ts) || 0,
};

export async function onRequest({ request, env }) {
  const method = request.method;
  if (method !== 'GET' && method !== 'POST') return json({ error: 'method-not-allowed' }, 405, { Allow: 'GET, POST' });
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  let body = {};
  if (method === 'POST') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'cross-origin' }, 403);
    try { body = (await request.json()) || {}; } catch (_) { return json({ error: 'bad-json' }, 400); }
  }
  const merchant = await ownerOf(request, env, method === 'POST' ? body.merchant : url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);

  let row = null, cfg = null;
  try {
    cfg = await env.DB.prepare('SELECT name, type, city FROM merchant_config WHERE merchant = ?').bind(merchant).first();
    row = await env.DB.prepare(`SELECT ${OWN} FROM directory_listings WHERE merchant = ?`).bind(merchant).first();
  } catch (e) {
    return json({ error: missingTable(e) ? 'directory-not-ready' : 'unavailable' }, 503);
  }
  const link = (r) => (r && r.status === 'approved' ? 'https://kiwi-os.com' + BASE.fr + r.slug + '/' : '');

  if (method === 'GET') {
    return json({
      listing: view(row), url: link(row),
      suggested: { name: (cfg && cfg.name) || '', trade: tradeById(cfg && cfg.type) ? cfg.type : '', city: '' },
      /* Les listes du formulaire viennent d'ici, pour qu'il n'en existe qu'une. */
      options: { trades: TRADES.map((t) => ({ id: t.id, label: t.label })), cities: CITIES.map((c) => ({ id: c.slug, label: c.label })) },
    });
  }

  if (row && row.status === 'removed') return json({ error: 'removed-by-kiwi' }, 409);
  const now = Date.now();
  if (body.on !== true) {
    if (row) await env.DB.prepare("UPDATE directory_listings SET status = 'off', updated_ts = ? WHERE id = ?").bind(now, row.id).run();
    const after = row ? await env.DB.prepare(`SELECT ${OWN} FROM directory_listings WHERE id = ?`).bind(row.id).first() : null;
    return json({ ok: true, listing: view(after), url: '' });
  }
  const clean = sanitizeListing({ ...body, lang: 'fr' }, normalizePhone);
  if (!clean.ok) return json({ error: 'invalid', field: clean.field }, 400);
  const v = clean.value;
  try {
    if (row) {
      const slug = row.city === v.city && row.name === v.name ? row.slug : await uniqueSlug(env, baseSlug(v.name, v.trade, v.city), row.id);
      await env.DB.prepare(
        `UPDATE directory_listings SET slug = ?, status = 'approved', name = ?, trade = ?, city = ?, address = ?, description = ?,
           website = ?, show_phone = ?, whatsapp = ?, contact_phone = ?, dedupe_key = ?, updated_ts = ? WHERE id = ?`
      ).bind(slug, v.name, v.trade, v.city, v.address, v.description, v.website, v.show_phone, v.whatsapp, v.contact_phone,
        dedupeKey(v.name, v.city), now, row.id).run();
    } else {
      const slug = await uniqueSlug(env, baseSlug(v.name, v.trade, v.city));
      await env.DB.prepare(
        `INSERT INTO directory_listings (id, slug, kind, merchant, status, name, trade, city, address, description, website,
           show_phone, whatsapp, contact_name, contact_email, contact_phone, dedupe_key, lang, created_ts, updated_ts, reviewed_ts, reviewed_by)
         VALUES (?, ?, 'client', ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, 'fr', ?, ?, ?, 'owner')`
      ).bind('dl-' + crypto.randomUUID(), slug, merchant, v.name, v.trade, v.city, v.address, v.description, v.website,
        v.show_phone, v.whatsapp, v.contact_phone, dedupeKey(v.name, v.city), now, now, now).run();
    }
    const after = await env.DB.prepare(`SELECT ${OWN} FROM directory_listings WHERE merchant = ?`).bind(merchant).first();
    return json({ ok: true, listing: view(after), url: link(after) });
  } catch (e) {
    return json({ error: missingTable(e) ? 'directory-not-ready' : 'unavailable' }, 503);
  }
}
