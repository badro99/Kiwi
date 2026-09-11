// Durable retry loop for Shopify inventory writes. Pages owns the OAuth token
// encryption key; this Worker owns only a dedicated bearer secret and asks the
// narrow Pages endpoint to drain the queue once per minute.

async function run(env) {
  const target = String(env && env.SYNC_URL || 'https://kiwi-os.com/api/shopify/cron');
  const secret = String(env && env.SHOPIFY_CRON_SECRET || '');
  if (secret.length < 32) throw new Error('SHOPIFY_CRON_SECRET is not configured');
  const response = await fetch(target, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'User-Agent': 'kiwi-shopify-sync/1' },
  });
  if (!response.ok) throw new Error(`Shopify retry endpoint returned ${response.status}`);
  return response.json();
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(run(env).then((result) => {
      if (result.processed || result.failed) console.log(JSON.stringify({ event: 'shopify-sync', ...result }));
    }));
  },

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/health') return new Response('Not found', { status: 404 });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  },
};

export const __test = { run };
