// Google Wallet loyalty cards over the REST API, signed with a service account
// (RS256 via WebCrypto, no SDK). Free: Google charges nothing for passes.
// Secrets: WALLET_GOOGLE_ISSUER_ID, WALLET_GOOGLE_SA_EMAIL, WALLET_GOOGLE_SA_KEY.
import { pemToDer } from './_pkcs7.js';

const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
export const googleConfigured = (env) => !!(env && env.WALLET_GOOGLE_ISSUER_ID && env.WALLET_GOOGLE_SA_EMAIL && env.WALLET_GOOGLE_SA_KEY);

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function signJwt(env, claims) {
  const pem = String(env.WALLET_GOOGLE_SA_KEY).replace(/\\n/g, '\n');
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const head = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc(claims);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head)));
  return head + '.' + b64url(sig);
}

let token = { value: '', exp: 0 };
export async function accessToken(env, now = Date.now()) {
  if (token.value && token.exp > now + 60_000) return token.value;
  const iat = Math.floor(now / 1000);
  const assertion = await signJwt(env, { iss: env.WALLET_GOOGLE_SA_EMAIL, scope: 'https://www.googleapis.com/auth/wallet_object.issuer', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + assertion });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('google-token-' + r.status);
  token = { value: j.access_token, exp: now + (Number(j.expires_in) || 3600) * 1000 };
  return token.value;
}
export const _resetGoogleToken = () => { token = { value: '', exp: 0 }; };

export const classId = (env, slug) => `${env.WALLET_GOOGLE_ISSUER_ID}.kiwi-${slug}`;
export const objectId = (env, serial) => `${env.WALLET_GOOGLE_ISSUER_ID}.${serial}`;

export function loyaltyClass(env, { merchant, baseUrl }) {
  const c = {
    id: classId(env, merchant.slug), issuerName: merchant.name, programName: 'Carte fidélité',
    programLogo: { sourceUri: { uri: `${baseUrl}/assets/wallet/kiwi-icon@3x.png` } },
    hexBackgroundColor: '#053B2C', reviewStatus: 'UNDER_REVIEW', countryCode: 'MA',
  };
  if (merchant.lat != null && merchant.lng != null) c.locations = [{ latitude: merchant.lat, longitude: merchant.lng }];
  return c;
}

export function loyaltyObject(env, { serial, clientId, view, stripUrl, state = 'ACTIVE' }) {
  return {
    id: objectId(env, serial), classId: undefined, state,
    accountId: String(clientId).slice(0, 60), accountName: view.firstName || 'Client',
    loyaltyPoints: { label: view.model === 'amount' ? 'Points' : 'Tampons', balance: { string: view.text } },
    barcode: { type: 'QR_CODE', value: 'KIWI-C:' + clientId, alternateText: 'Carte fidélité' },
    heroImage: { sourceUri: { uri: stripUrl } },
    textModulesData: [{ id: 'reward', header: 'Récompense', body: view.ready ? `Prête : ${view.rewardLabel || 'offerte'}` : `${view.rewardLabel || 'Offerte'} · encore ${view.remaining}` }],
  };
}

async function call(env, method, path, body) {
  const r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + await accessToken(env), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.status;
}

/* Insert the class and the object; a 409 means they exist, then the object is patched. */
export async function ensureGoogleCard(env, { merchant, baseUrl, object }) {
  const cls = loyaltyClass(env, { merchant, baseUrl });
  const st = await call(env, 'POST', '/loyaltyClass', cls);
  if (st === 409) await call(env, 'PATCH', '/loyaltyClass/' + encodeURIComponent(cls.id), cls);
  const obj = { ...object, classId: cls.id };
  const s = await call(env, 'POST', '/loyaltyObject', obj);
  if (s === 409) return call(env, 'PATCH', '/loyaltyObject/' + encodeURIComponent(obj.id), obj);
  return s;
}

export const patchGoogleObject = (env, id, patch) => call(env, 'PATCH', '/loyaltyObject/' + encodeURIComponent(id), patch);

export async function googleSaveUrl(env, { id, origin }) {
  const iat = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(env, { iss: env.WALLET_GOOGLE_SA_EMAIL, aud: 'google', typ: 'savetowallet', iat, origins: [origin], payload: { loyaltyObjects: [{ id }] } });
  return 'https://pay.google.com/gp/v/save/' + jwt;
}
