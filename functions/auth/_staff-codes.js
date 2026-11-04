// Versioned staff credentials. No schema change; legacy plaintext is read during transition.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const un64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const derivedKeys = new Map();
async function key(env, info, algorithm, usages) {
  const secret = typeof env === 'string' ? env : staffKeys(env)[0];
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
    if (derivedKeys.size > 32) derivedKeys.delete(derivedKeys.keys().next().value);
    pending.catch(() => { if (derivedKeys.get(cacheId) === pending) derivedKeys.delete(cacheId); });
  }
  return pending;
}
export function staffKeys(env) {
  return [...new Set([env.PIN_PEPPER || env.AUTH_SECRET, env.PIN_PEPPER_PREVIOUS,
    env.AUTH_SECRET_PREVIOUS, env.PIN_PEPPER && env.AUTH_SECRET].filter(Boolean))];
}
const valid = (code) => typeof code === 'string' && /^\d{4}$/.test(code);
export async function staffMac(secret, info, text) {
  return b64(await crypto.subtle.sign('HMAC', await key(secret, info,
    { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign']), enc.encode(text)));
}
export async function pinHashes(env, merchant, code) {
  if (!valid(code)) throw new Error('invalid-staff-code');
  const values = [];
  for (const secret of staffKeys(env)) {
    values.push(await currentHash(secret, merchant, code));
  }
  return values;
}
async function keyTag(secret) { return (await staffMac(secret, 'kiwi staff key id v2', 'key')).slice(0, 12); }
async function currentHash(secret, merchant, code) { return 'k2$' + await keyTag(secret) + '$' + await staffMac(secret, 'kiwi staff pin v2', merchant + ':' + code); }
export async function hashStaffCode(env, merchant, code) {
  if (!valid(code)) throw new Error('invalid-staff-code');
  return currentHash(staffKeys(env)[0], merchant, code);
}
export async function needsStaffRecovery(env, pin) {
  return /^k2\$/.test(pin) && !pin.startsWith('k2$' + await keyTag(staffKeys(env)[0]) + '$');
}
// Exhaustive recovery belongs only to the bounded operator backfill, never login.
export async function rotateStaffRow(env, row, start = 0, budget = 250) {
  if (valid(row.pin)) return hashStaffCode(env, row.merchant, row.pin);
  if (!/^k2\$/.test(row.pin)) throw new Error('invalid-staff-code');
  if (!await needsStaffRecovery(env, row.pin)) return row.pin;
  const signers = [];
  for (const secret of staffKeys(env)) {
    if (row.pin.startsWith('k2$')) {
      const prefix = 'k2$' + await keyTag(secret) + '$';
      if (row.pin.startsWith(prefix)) signers.push([prefix, await key(secret, 'kiwi staff pin v2', { name: 'HMAC', hash: 'SHA-256' }, ['sign'])]);
    }
  }
  for (let n = start; n < Math.min(10000, start + budget); n++) {
    const code = String(n).padStart(4, '0');
    for (const [prefix, signer] of signers) {
      if (prefix + b64(await crypto.subtle.sign('HMAC', signer, enc.encode(row.merchant + ':' + code))) === row.pin) return hashStaffCode(env, row.merchant, code);
    }
  }
  if (start + budget < 10000 && signers.length) return null;
  throw new Error('staff-code-key-unavailable');
}
export async function codeDocument(env, merchant, feature, doc, seal = false, memberId = null) {
  if (!doc || !['team', 'employee-access'].includes(feature)) return doc;
  const copy = structuredClone(doc);
  const keys = await Promise.all(staffKeys(env).map((secret) => key(secret, 'kiwi staff code enc v1', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt'])));
  const k = keys[0];
  for (const member of Array.isArray(copy.members) ? copy.members : []) {
    if (!member || typeof member !== 'object') continue;
    if (memberId !== null && String(member.id || '') !== String(memberId)) continue;
    let unreadable = false;
    for (const field of ['pinCode', 'password']) {
      try {
      const raw = member[field];
      if (raw == null || raw === '') continue;
      if (typeof raw !== 'string' && typeof raw !== 'number') throw new Error('invalid-staff-code');
      let value = String(raw);
      const aad = enc.encode(JSON.stringify([merchant, feature, String(member.id || ''), field]));
      if (value.startsWith('e1$')) {
        const parts = value.split('$');
        if (parts.length !== 3 || un64(parts[1]).length !== 12) throw new Error('invalid-staff-code');
        let plain, used;
        for (const candidate of keys) {
          try { plain = dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: un64(parts[1]), additionalData: aad }, candidate, un64(parts[2]))); used = candidate; break; } catch (_) {}
        }
        if (plain === undefined) throw new Error('staff-code-key-unavailable');
        if (!seal) { member[field] = plain; continue; }
        if (used === k) continue;
        value = plain;
      }
      if (seal) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        member[field] = 'e1$' + b64(iv) + '$' + b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, k, enc.encode(value)));
      }
      } catch (_) { unreadable = true; }
    }
    if (unreadable && !seal) {
      member.codeUnreadable = true;
      if (!seal) { member.pinCode = ''; member.password = ''; }
    } else delete member.codeUnreadable;
  }
  return copy;
}
async function lookup(env, merchants, code) {
  if (!valid(code) || !merchants.length) return [];
  const candidates = [];
  for (const merchant of merchants) for (const pin of [...await pinHashes(env, merchant, code), code]) candidates.push({ merchant, pin });
  const rows = (await env.DB.prepare(`SELECT DISTINCT p.id, p.name, p.role, p.merchant, p.pin, p.created_ts FROM json_each(?) c
    JOIN staff_pins p ON p.merchant = json_extract(c.value, '$.merchant')
      AND p.pin = json_extract(c.value, '$.pin') ORDER BY p.created_ts LIMIT 10`).bind(JSON.stringify(candidates)).all()).results || [];
  for (const row of rows) {
    const current = await hashStaffCode(env, row.merchant, code);
    if (row.pin !== current) {
      try { await env.DB.prepare('UPDATE staff_pins SET pin = ? WHERE id = ? AND pin = ?').bind(current, row.id, row.pin).run(); } catch (_) { /* Verification already succeeded; retry the upgrade later. */ }
    }
    delete row.pin;
  }
  return rows;
}
export async function matchingStaffCodes(env, merchant, code) {
  return lookup(env, [merchant], code);
}
export async function accountStaffCodes(env, account, slug, code, exclude = '') {
  if (!valid(code)) return [];
  const r = await env.DB.prepare('SELECT merchant FROM merchant_config WHERE account_id = ?').bind(account).all();
  const merchants = [...new Set([...(r.results || []).map((r) => r.merchant), ...(slug ? [slug] : [])])];
  return lookup(env, merchants.filter((m) => m !== exclude), code);
}
export async function sealMerchantStaff(env, merchant) {
  const rows = (await env.DB.prepare('SELECT id, pin FROM staff_pins WHERE merchant = ?').bind(merchant).all()).results || [];
  for (const row of rows) {
    if (valid(row.pin)) await env.DB.prepare('UPDATE staff_pins SET pin = ? WHERE id = ? AND pin = ?').bind(await hashStaffCode(env, merchant, row.pin), row.id, row.pin).run();
  }
}
// Resolve a pre-canonical employee session by its signed staff row, without exposing a hash.
export async function staffMemberId(env, merchant, team, row) {
  for (const member of team?.members || []) {
    const code = String(member?.pinCode || member?.password || '').trim();
    if (!valid(code)) continue;
    if (row.pin === code || (await pinHashes(env, merchant, code)).includes(row.pin)) return String(member.id || '');
  }
  return '';
}
