// Minute retry entrypoint for the Shopify inventory outbox.
//
// Cloudflare Pages owns the Shopify OAuth secrets, while the scheduled Worker
// only owns one purpose-built shared secret. Keeping token decryption here
// avoids copying long-lived Shopify credentials into a second runtime.

import { json } from '../../auth/_lib.js';
import { flushShopifyOutbox } from './_lib.js';

function constantTimeEqual(left, right) {
  left = String(left || '');
  right = String(right || '');
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function authorized(request, env) {
  const secret = String(env && env.SHOPIFY_CRON_SECRET || '').trim();
  if (secret.length < 32) return false;
  return constantTimeEqual(request.headers.get('Authorization'), `Bearer ${secret}`);
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  const result = await flushShopifyOutbox(env, '', 50);
  return json({ ok: true, processed: result.processed || 0, failed: result.failed || 0 });
}

export const __test = { authorized, constantTimeEqual };
