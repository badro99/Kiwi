import { json, purgeExpired, schemaError } from './_lib.js';

export async function onRequestPost({ env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  try {
    const deleted = await purgeExpired(env);
    return json({ ok: true, deleted });
  } catch (error) {
    if (schemaError(error)) return json({ error: 'schema-not-ready' }, 503);
    return json({ error: 'cleanup-failed' }, 500);
  }
}
