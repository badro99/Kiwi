// Kiwi — Routage et expédition des notifications Push
//
// Appelé par les déclencheurs d'évènements :
// - Commande OrderPro validée → Caisse & Cuisine
// - Planning / service publié → Équipe
// - Le point du matin (functions/api/push/morning.js)
//
// Résilience :
// - Si la table push_tokens n'est pas migrée → no-op gracieux, aucun 500 sur l'opération métier
// - Si les identifiants APNs/FCM ne sont pas configurés dans env → saut propre sans erreur
// - Les jetons clients et la clé APNs sont des secrets : jamais journalisés
//
// APNs : jeton fournisseur JWT ES256 signé avec la clé .p8 (PKCS8) via crypto.subtle,
// mis en cache ~50 min par isolat (Apple refuse un jeton de plus d'une heure, et
// refuse aussi qu'on en change plus d'une fois toutes les 20 min). FCM : saut inchangé.

const APNS_TOPIC = 'com.kiwios.pro';
const APNS_HOST = 'https://api.push.apple.com';
const APNS_HOST_SANDBOX = 'https://api.sandbox.push.apple.com';
const JWT_TTL_MS = 50 * 60 * 1000;
// Un jeton d'appareil APNs est de l'hexadécimal ; on refuse tout le reste avant de
// le coller dans un chemin d'URL.
const APNS_TOKEN_RE = /^[0-9a-fA-F]{32,200}$/;
// Raisons pour lesquelles Apple dit « ce jeton ne servira plus jamais ».
const DEAD_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic']);

export function apnsConfigured(env) {
  return !!(env && env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_PRIVATE_KEY);
}

export function apnsHost(env) {
  const flag = env && env.APNS_SANDBOX;
  const on = flag === true || (typeof flag === 'string' && !/^(|0|false|no|off)$/i.test(flag.trim()));
  return on ? APNS_HOST_SANDBOX : APNS_HOST;
}

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const utf8 = (s) => new TextEncoder().encode(s);

function pemToDer(pem) {
  // Les variables d'environnement stockent souvent le PEM avec des « \n » littéraux.
  const body = String(pem).replace(/\\n/g, '\n')
    .replace(/-----BEGIN [A-Z ]+-----/, '').replace(/-----END [A-Z ]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(body);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

let jwtCache = null; // { jwt, exp, id } — par isolat, jamais exposé

export function resetApnsJwtCache() { jwtCache = null; }

/* Jeton fournisseur. `now` est injectable pour les bancs d'essai. */
export async function apnsJwt(env, now = Date.now()) {
  const id = `${env.APNS_KEY_ID}|${env.APNS_TEAM_ID}`;
  if (jwtCache && jwtCache.id === id && jwtCache.exp > now) return jwtCache.jwt;
  const key = await crypto.subtle.importKey(
    'pkcs8', pemToDer(env.APNS_PRIVATE_KEY),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const header = b64url(utf8(JSON.stringify({ alg: 'ES256', kid: String(env.APNS_KEY_ID) })));
  const claims = b64url(utf8(JSON.stringify({ iss: String(env.APNS_TEAM_ID), iat: Math.floor(now / 1000) })));
  const signingInput = `${header}.${claims}`;
  // WebCrypto rend déjà la signature ECDSA au format r||s attendu par JWS.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(signingInput)));
  const jwt = `${signingInput}.${b64url(sig)}`;
  jwtCache = { jwt, id, exp: now + JWT_TTL_MS };
  return jwt;
}

/* Un envoi APNs. Renvoie { ok, status, reason, dead } sans jamais lever ni
   journaliser le jeton. `dead` = le jeton doit être supprimé de push_tokens. */
export async function sendApns(env, token, message = {}) {
  if (!apnsConfigured(env)) return { ok: false, skipped: 'gateway-unconfigured' };
  if (typeof token !== 'string' || !APNS_TOKEN_RE.test(token)) {
    // Un jeton qui n'est pas de l'hexadécimal ne vient pas d'APNs : inutilisable.
    return { ok: false, status: 0, reason: 'BadDeviceToken', dead: true };
  }
  try {
    const jwt = await apnsJwt(env);
    const payload = { aps: { alert: { title: String(message.title || 'Kiwi Pro'), body: String(message.body || '') }, sound: 'default' } };
    if (message.data && typeof message.data === 'object') Object.assign(payload, message.data, { aps: payload.aps });
    const res = await fetch(`${apnsHost(env)}/3/device/${token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': APNS_TOPIC,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (res.status === 200) return { ok: true, status: 200 };
    let reason = '';
    try { reason = String((await res.json()).reason || ''); } catch (_) { /* corps vide */ }
    if (res.status === 403 && /ProviderToken/.test(reason)) resetApnsJwtCache();
    const dead = res.status === 410 || (res.status === 400 && DEAD_REASONS.has(reason));
    return { ok: false, status: res.status, reason, dead };
  } catch (_) {
    // Erreur réseau ou clé illisible : échec doux, sans détail (la clé ne fuit pas).
    return { ok: false, status: 0, reason: 'transport-error' };
  }
}

async function dropToken(env, merchant, token) {
  try {
    await env.DB.prepare('DELETE FROM push_tokens WHERE merchant = ? AND token = ?').bind(merchant, token).run();
  } catch (_) { /* table absente ou erreur D1 : le prochain envoi réessaiera */ }
}

/* Envoie à une liste de jetons iOS et supprime ceux qu'Apple déclare morts.
   Par lots de 10 pour ne pas ouvrir une rafale de connexions. `byToken` rend
   l'issue de chaque jeton ('sent' | 'removed' | 'failed') à qui doit savoir
   lequel réessayer. */
export async function sendApnsToTokens(env, merchant, tokens, message) {
  let sent = 0, removed = 0, failed = 0;
  const byToken = new Map();
  for (let i = 0; i < tokens.length; i += 10) {
    const batch = tokens.slice(i, i + 10);
    const results = await Promise.all(batch.map((t) => sendApns(env, t.token, typeof message === 'function' ? message(t) : message)));
    results.forEach((r, k) => {
      const outcome = r.ok ? 'sent' : r.dead ? 'removed' : 'failed';
      if (outcome === 'sent') sent++;
      else if (outcome === 'removed') removed++;
      else failed++;
      byToken.set(batch[k].token, outcome);
    });
    for (let k = 0; k < batch.length; k++) {
      if (results[k].dead) await dropToken(env, merchant, batch[k].token);
    }
  }
  return { sent, removed, failed, byToken };
}

export async function dispatchPushEvent(env, merchant, options = {}) {
  if (!env || !env.DB || !merchant) {
    return { ok: false, sent: 0, skipped: 'unconfigured-env' };
  }

  const role = options.role || 'caisse';
  const title = options.title || 'Kiwi Pro';
  const body = options.body || '';
  const data = options.data || {};

  let tokens = [];
  try {
    const query = (role === 'all')
      ? 'SELECT token, platform FROM push_tokens WHERE merchant = ?'
      : "SELECT token, platform FROM push_tokens WHERE merchant = ? AND (role = ? OR role = 'all')";
    const params = (role === 'all') ? [merchant] : [merchant, role];
    const rs = await env.DB.prepare(query).bind(...params).all();
    tokens = rs.results || [];
  } catch (err) {
    // Si la table n'existe pas encore en production, ne pas bloquer l'encaissement ou la commande
    return { ok: false, sent: 0, skipped: 'table-unavailable' };
  }

  if (!tokens.length) {
    return { ok: true, sent: 0, reason: 'no-registered-devices' };
  }

  // Vérification de la présence des identifiants APNs / FCM (configurés par l'exploitant hors dépôt)
  const hasApns = apnsConfigured(env);
  const hasFcm = !!(env.FCM_PROJECT_ID && env.FCM_SERVICE_ACCOUNT);

  if (!hasApns && !hasFcm) {
    // Les clés de passerelle sont gérées par le propriétaire hors repo
    return { ok: true, sent: 0, skipped: 'gateway-unconfigured', targetCount: tokens.length };
  }

  // Expédition APNs pour les appareils iOS. FCM (Android/Web) reste un saut propre.
  if (!hasApns) {
    return { ok: true, sent: 0, skipped: 'fcm-not-implemented', targetCount: tokens.length };
  }
  const ios = tokens.filter((t) => t.platform === 'ios');
  const result = await sendApnsToTokens(env, merchant, ios, { title, body, data });
  return { ok: true, sent: result.sent, removed: result.removed, failed: result.failed, delivered: result.sent > 0, targetCount: tokens.length };
}
