/* A channel key, kwc.<id>.<secret>: who sent this, and is it still allowed.
 * Shared by the channels that deposit orders without a session
 * (/api/channel/order, /api/shop/orders). The merchant comes from the key's
 * row, never from the request. */
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const TOKEN_RE = /^kwc\.([A-Za-z0-9-]{6,64})\.([A-Za-z0-9_-]{20,120})$/;

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Comparaison à temps constant : comparer deux hex avec === laisse fuir, par le
 * temps de réponse, combien de caractères de tête sont bons. */
function sameHex(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* À qui appartient cette clé ? Renvoie la ligne, ou null. */
export async function linkFor(env, token) {
  const m = TOKEN_RE.exec(String(token || ''));
  if (!m) return null;
  let row;
  try {
    row = await env.DB.prepare(
      'SELECT id, merchant, channel, hash, status FROM channel_links WHERE id = ?'
    ).bind(m[1]).first();
  } catch (_) { return null; }        // table pas encore migrée
  if (!row || row.status !== 'active') return null;
  if (!sameHex(row.hash, await sha256Hex(m[2]))) return null;
  return row;
}

/* Trace ce qui vient de se passer sur la ligne du canal. C'est là que le
 * commerçant lira « ça marche » ou « ça a été refusé, et pourquoi » — sans quoi
 * un connecteur muet ne se diagnostique qu'en lisant les logs Cloudflare, ce
 * qu'aucun commerçant ne fera. Jamais bloquant : une commande n'est pas perdue
 * parce que sa trace n'a pas pu s'écrire. */
export async function mark(env, id, ok, err) {
  try {
    await env.DB.prepare(
      ok ? 'UPDATE channel_links SET last_ts = ?, last_err = NULL WHERE id = ?'
         : 'UPDATE channel_links SET last_err = ? WHERE id = ?'
    ).bind(ok ? Date.now() : str(err, 120), id).run();
  } catch (_) {}
}

