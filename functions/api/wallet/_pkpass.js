// The signed .pkpass bundle: pass.json + images, a manifest of their SHA-1s,
// the manifest's detached signature, all zipped. Returns null when the Apple
// certificate is not configured, so callers fall back to the web card.
import { storeZip } from './_zip.js';
import { signDetached } from './_pkcs7.js';
import { WWDR_G4 } from './_wwdr.js';

export const appleConfigured = (env) =>
  !!(env && env.WALLET_APPLE_PASS_TYPE_ID && env.WALLET_APPLE_CERT_PEM && env.WALLET_APPLE_KEY_PEM && env.APNS_TEAM_ID);

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function buildPkpass({ pass, images = {}, env, now = Date.now() }) {
  if (!appleConfigured(env)) return null;
  const enc = new TextEncoder();
  const files = [{ name: 'pass.json', data: enc.encode(JSON.stringify(pass)) }];
  for (const [name, data] of Object.entries(images)) if (data && data.length) files.push({ name, data });
  const manifest = {};
  for (const f of files) manifest[f.name] = hex(await crypto.subtle.digest('SHA-1', f.data));
  const manifestBytes = enc.encode(JSON.stringify(manifest));
  const signature = await signDetached({
    content: manifestBytes, certPem: env.WALLET_APPLE_CERT_PEM, keyPem: env.WALLET_APPLE_KEY_PEM,
    chainPems: [env.WALLET_APPLE_WWDR_PEM || WWDR_G4], now,
  });
  return storeZip([...files, { name: 'manifest.json', data: manifestBytes }, { name: 'signature', data: signature }]);
}
