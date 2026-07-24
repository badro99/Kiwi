// POST /api/sale — record one real sale into Cloudflare D1.
//
// Runs behind the passcode gate (functions/_middleware.js): the caisse's
// same-origin fetch carries the kiwi_gate cookie, so unlocked devices reach it
// and outsiders don't. Free on the Cloudflare Pages + D1 tiers.
//
// Requires a D1 binding named DB (see wrangler.toml / LIVE_LINK.md). If the
// binding is missing the endpoint fails soft (503) so the app never breaks.

import { entitledMerchant } from '../auth/_lib.js';

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);

  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const amount = Math.round(Number(b && b.amount) || 0);
  if (amount <= 0) return json({ error: 'bad-amount' }, 400);

  // A sale MUST name its store. The old fallback to a literal 'default' bucket
  // meant every device whose identity had not resolved yet wrote into one shared
  // tenant — which any other unresolved device then read back as its own (see the
  // tenant-scoping note in feed.js). Refusing is strictly safer than mis-filing:
  // an unattributed sale in a shared bucket is unrecoverable, a 400 is visible.
  const asked = String((b && b.merchant) || '').slice(0, 64);
  if (!asked) return json({ error: 'no-merchant' }, 400);

  /* …and it must be a store this caller is actually entitled to. Until now the
   * slug was taken from the body and never checked, so anyone past the gate
   * could inject revenue into any merchant's books — and there is no delete
   * path to undo it. The rule is feed.js's, now shared (auth/_lib.js). A paired
   * till writes to the store it was bound to; a signed-in merchant to its own,
   * whatever the body claimed. */
  const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const method = String((b && b.method) || 'cash').slice(0, 16);
  const label = String((b && b.label) || 'Vente').slice(0, 80);
  const ref = String((b && b.ref) || '').slice(0, 40);
  const ts = Number(b && b.ts) || Date.now();

  // The row id is the caller's idempotency key. A till that loses WiFi mid-POST
  // cannot know whether the sale landed, so it retries from its offline queue —
  // and with a server-invented id every retry would have written the day's
  // takings twice. The client now sends a stable id per sale (see the queue in
  // assets/live-link.js) and INSERT OR IGNORE makes the retry a no-op. Callers
  // that send no id keep the old behaviour: a fresh row every time.
  const id = String((b && b.id) || '').slice(0, 64) || ('sale-' + ts + '-' + Math.random().toString(36).slice(2, 8));

  try {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO sales (id, merchant, amount, method, label, ref, ts) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, merchant, amount, method, label, ref, ts).run();
  } catch (e) {
    return json({ error: 'db', detail: String(e && e.message || e) }, 500);
  }
  return json({ ok: true, id });
}

// A stray GET shouldn't 405-noise the console — just report health.
export function onRequestGet({ env }) {
  return json({ ok: true, db: !!(env && env.DB) });
}
