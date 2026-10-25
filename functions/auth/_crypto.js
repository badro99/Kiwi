// Isolate-local, bounded cache. Never cache authorization or derived passwords.
const keys = new Map();
const encoder = new TextEncoder();
export function hmacKey(secret) {
  let pending = keys.get(secret);
  if (!pending) {
    pending = crypto.subtle.importKey('raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keys.set(secret, pending);
    if (keys.size > 4) keys.delete(keys.keys().next().value);
    pending.catch(() => { if (keys.get(secret) === pending) keys.delete(secret); });
  }
  return pending;
}
