// POST /api/menu/availability — a paired cashier changes one menu item's
// operational availability without republishing (and potentially overwriting)
// the whole menu document.
//
// Body: { merchant, itemId, available }
// Auth: the normal owner/operator session or the paired till cookie for that
// exact merchant. The merchant is always resolved by tenantFor.

import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { sanitizeMenu } from '../menu.js';

const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const asked = clean(body && body.merchant, 64);
  const itemId = clean(body && body.itemId, 40);
  if (!asked || !itemId || typeof (body && body.available) !== 'boolean') {
    return json({ error: 'invalid-availability' }, 400);
  }

  const merchant = await tenantFor(request, env, asked, { strict: true });
  if (!merchant || merchant !== asked) return json({ error: 'unauthorized' }, 401);

  // Optimistic compare-and-swap keeps a simultaneous dashboard menu edit from
  // being lost. A conflict is reread and retried; only `avail` is changed.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let row;
    try {
      row = await env.DB.prepare(
        'SELECT type, data, updated_ts FROM menus WHERE merchant = ?'
      ).bind(merchant).first();
    } catch (_) { return json({ error: 'read-failed' }, 500); }
    if (!row || !row.data) return json({ error: 'menu-not-published' }, 404);
    if (String(row.type || '').toLowerCase() === 'boutique') {
      return json({ error: 'restaurant-menu-required' }, 409);
    }

    let data;
    try { data = sanitizeMenu(JSON.parse(row.data)); }
    catch (_) { return json({ error: 'menu-invalid' }, 409); }
    const item = data.items.find((entry) => entry.id === itemId);
    if (!item || item.archived) return json({ error: 'item-not-found' }, 404);
    item.avail = body.available;

    const updatedTs = Math.max(Date.now(), (+row.updated_ts || 0) + 1);
    let result;
    try {
      result = await env.DB.prepare(
        'UPDATE menus SET data = ?, updated_ts = ? WHERE merchant = ? AND updated_ts = ?'
      ).bind(JSON.stringify(data), updatedTs, merchant, +row.updated_ts || 0).run();
    } catch (_) { return json({ error: 'write-failed' }, 500); }
    if (result && result.meta && result.meta.changes === 1) {
      return json({ ok: true, merchant, itemId, available: body.available, updatedTs });
    }
  }

  return json({ error: 'menu-busy' }, 409);
}
