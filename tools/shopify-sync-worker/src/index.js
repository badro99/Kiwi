// Durable retry loop for Shopify inventory writes. Normal catalogue requests
// attempt the outbox immediately through waitUntil(); this minute cron catches
// outages, expired requests and devices that went offline after checkout.

import { flushShopifyOutbox } from '../../../functions/api/shopify/_lib.js';

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(flushShopifyOutbox(env, '', 50).then((result) => {
      if (result.processed || result.failed) console.log(JSON.stringify({ event: 'shopify-sync', ...result }));
    }));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/health') return new Response('Not found', { status: 404 });
    const pending = env.DB ? await env.DB.prepare(
      `SELECT status, COUNT(*) AS n FROM shopify_sync_outbox GROUP BY status`
    ).all().catch(() => ({ results: [] })) : { results: [] };
    return Response.json({ ok: true, queue: pending.results || [] }, { headers: { 'Cache-Control': 'no-store' } });
  },
};
