import { hmacKey } from './_crypto.js';
// Versioned staff credentials. No schema change; legacy plaintext is read during transition.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const un64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const derivedKeys = new Map();
async function key(env, info, algorithm, usages) {
  const secret = env.PIN_PEPPER || env.AUTH_SECRET;
  if (!secret) throw new Error('staff-code-key-unavailable');
  const cacheId = JSON.stringify([secret, info]);
  let pending = derivedKeys.get(cacheId);
  if (!pending) {
    pending = (async () => {
      // RFC 5869 HKDF-SHA-256, empty salt, exactly one 32-byte expand block.
      // These are server keys, never expensive password derivations on a poller.
      const salt = await crypto.subtle.importKey('raw', new Uint8Array(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const prk = await crypto.subtle.sign('HMAC', salt, enc.encode(secret));
      const expandKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const context = enc.encode(info), block = new Uint8Array(context.length + 1);
      block.set(context); block[context.length] = 1;
      const bits = await crypto.subtle.sign('HMAC', expandKey, block);
      return crypto.subtle.importKey('raw', bits, algorithm, false, usages);
    })();
    derivedKeys.set(cacheId, pending);
    if (derivedKeys.size > 4) derivedKeys.delete(derivedKeys.keys().next().value);
    pending.catch(() => { if (derivedKeys.get(cacheId) === pending) derivedKeys.delete(cacheId); });
  }
  return pending;
}
export async function hashStaffCode(env, merchant, code) {
  const k = env.PIN_PEPPER
    ? await hmacKey(env.PIN_PEPPER)
    : await key(env, 'kiwi staff pin v1', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign']);
  return 'k1$' + b64(await crypto.subtle.sign('HMAC', k, enc.encode(merchant + ':' + code)));
}
export async function codeDocument(env, merchant, feature, doc, seal = false) {
  if (!doc || !['team', 'employee-access'].includes(feature)) return doc;
  const copy = structuredClone(doc);
  const k = await key(env, 'kiwi staff code enc v1', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']);
  for (const member of Array.isArray(copy.members) ? copy.members : []) {
    if (!member || typeof member !== 'object') continue;
    for (const field of ['pinCode', 'password']) {
      const raw = member[field];
      if (raw == null || raw === '') continue;
      if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error('invalid-staff-code');
      const value = String(raw);
      const aad = enc.encode(JSON.stringify([merchant, feature, String(member.id || ''), field]));
      if (value.startsWith('e1$')) {
        const parts = value.split('$');
        if (parts.length !== 3 || un64(parts[1]).length !== 12) throw new Error('invalid-staff-code');
        const plain = dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: un64(parts[1]), additionalData: aad }, k, un64(parts[2])));
        if (!seal) member[field] = plain;
      } else if (seal) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        member[field] = 'e1$' + b64(iv) + '$' + b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, k, enc.encode(value)));
      }
    }
  }
  return copy;
}
export async function matchingStaffCodes(env, merchant, code) {
  const hash = await hashStaffCode(env, merchant, code);
  const r = await env.DB.prepare('SELECT id, name, role, merchant, pin, created_ts FROM staff_pins WHERE merchant = ? AND pin IN (?, ?) ORDER BY created_ts LIMIT 10').bind(merchant, hash, code).all();
  for (const row of r.results || []) {
    if (row.pin === code) await env.DB.prepare('UPDATE staff_pins SET pin = ? WHERE id = ? AND pin = ?').bind(hash, row.id, code).run();
    delete row.pin;
  }
  return r.results || [];
}
export async function accountStaffCodes(env, account, slug, code) {
  let merchants;
  try {
    const r = await env.DB.prepare('SELECT merchant FROM merchant_config WHERE account_id = ?').bind(account).all();
    merchants = (r.results || []).map((r) => r.merchant);
  } catch (_) { merchants = []; }
  if (slug) merchants.push(slug);
  const rows = [];
  for (const merchant of new Set(merchants)) rows.push(...await matchingStaffCodes(env, merchant, code));
  return rows.sort((a, b) => a.created_ts - b.created_ts).slice(0, 10);
}
export async function sealMerchantStaff(env, merchant) {
  const rows = (await env.DB.prepare('SELECT id, pin FROM staff_pins WHERE merchant = ?').bind(merchant).all()).results || [];
  for (const row of rows) {
    if (!String(row.pin).startsWith('k1$')) await env.DB.prepare('UPDATE staff_pins SET pin = ? WHERE id = ? AND pin = ?').bind(await hashStaffCode(env, merchant, row.pin), row.id, row.pin).run();
  }
}
// Resolve a pre-canonical employee session by its signed staff row, without exposing a hash.
export async function staffMemberId(env, merchant, team, row) {
  for (const member of team?.members || []) {
    const code = String(member?.pinCode || member?.password || '').trim();
    if (!code) continue;
    if (row.pin === code || row.pin === await hashStaffCode(env, merchant, code)) return String(member.id || '');
  }
  return '';
}
