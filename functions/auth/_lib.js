// Kiwi — shared auth helpers for the account gate (Cloudflare Pages Functions).
//
// Runs on the Workers runtime and uses only Web Crypto + platform globals
// (crypto.subtle, crypto.getRandomValues, crypto.randomUUID, btoa/atob,
// TextEncoder/Decoder) — all of which Node 18+ also exposes, so the same logic
// is verifiable locally. Passwords are PBKDF2-SHA256 with a per-user salt;
// sessions are stateless HMAC-signed tokens. Nothing here is stored in the repo.
//
// A `_`-prefixed file is excluded from routing but importable by the route
// handlers (signup/login/logout) and by _middleware.js.

const ITER = 100000;            // PBKDF2 rounds
export const PASSWORD_MAX = 1024;
export const SESS_COOKIE = 'kiwi_sess';
const SESS_DAYS = 30;

const encoder = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function bytesToB64url(buf) {
  const arr = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(b64u) {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Constant-time-ish compare over two equal-length hex strings.
function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password, saltBytes) {
  const km = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: ITER, hash: 'SHA-256' },
    km, 256
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  password = String(password || '');
  if (password.length > PASSWORD_MAX) throw new RangeError('password-too-long');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return { salt: toHex(salt), hash: toHex(hash) };
}

export async function verifyPassword(password, saltHex, hashHex) {
  password = String(password || '');
  if (password.length > PASSWORD_MAX) return false;
  if (!saltHex || !hashHex) return false;
  const hash = await pbkdf2(password, fromHex(saltHex));
  return timingSafeEqualHex(toHex(hash), hashHex);
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toHex(sig);
}

// ── Gate tokens (staff bypass + operator console) ───────────────────────────
// Both are unforgeable HMACs. The staff token is keyed by the shared SITE_PASSWORD
// (so it matches the "Accès équipe" cookie in _middleware.js). The legacy operator
// token is intentionally NOT sufficient by itself: every named operator session
// must also carry kiwi_op_id, and that signed id is checked against the live
// `operators` table on every privileged request. Deleting an operator therefore
// revokes every browser that was using that code immediately.
export const GATE_COOKIE = 'kiwi_gate';
export const OP_COOKIE = 'kiwi_op';

export async function staffToken(sitePassword) {
  return hmacHex(sitePassword, 'kiwi-gate-v1');
}

// ── Till token ──────────────────────────────────────────────────────────────
// Proof that THIS device redeemed a pairing code for THIS merchant. A till has
// no account login, so before this the only way /api/config could answer a
// session-less caisse was to trust ?merchant= on the client's word — which meant
// anyone who knew a slug could read that store's staff PINs. The token is a
// per-merchant HMAC handed out by /api/pair/redeem and returned as an httpOnly
// cookie, so a page script cannot read it and a different merchant's token does
// not verify. Unforgeable without AUTH_SECRET; carries no expiry because a
// pairing is meant to last until the merchant unpairs.
export const TILL_COOKIE = 'kiwi_till';

export async function tillToken(authSecret, merchant) {
  return hmacHex(authSecret, 'kiwi-till-v1:' + String(merchant || ''));
}
export function tillCookie(value) {
  return `${TILL_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${365 * 86400}`;
}
// True when the request proves it is the till of `merchant`.
export async function isTillFor(request, env, merchant) {
  const secret = env && env.AUTH_SECRET;
  if (!secret || !merchant) return false;
  const got = readCookie(request, TILL_COOKIE);
  if (!got) return false;
  return timingSafeEqualHex(got, await tillToken(secret, merchant));
}

// ── Employee app session ─────────────────────────────────────────────────────
// A staff PIN is checked once by /api/employee. The browser then receives a
// short-lived, httpOnly session scoped to exactly one employee and one store.
// Keeping the PIN out of the token means it is never replayed by page script or
// stored in localStorage; deleting the staff_pins row still revokes the session
// because every employee API call re-checks that row.
export const EMPLOYEE_COOKIE = 'kiwi_employee';
const EMPLOYEE_SESSION_MS = 12 * 60 * 60 * 1000;

export async function employeeToken(authSecret, employee) {
  const payload = {
    merchant: String(employee && employee.merchant || '').slice(0, 64),
    staffId: String(employee && employee.staffId || '').slice(0, 96),
    exp: Date.now() + EMPLOYEE_SESSION_MS,
  };
  const body = bytesToB64url(encoder.encode(JSON.stringify(payload)));
  return body + '.' + await hmacHex(authSecret, 'kiwi-employee-v1:' + body);
}

export async function readEmployee(request, env) {
  const secret = env && env.AUTH_SECRET;
  const raw = readCookie(request, EMPLOYEE_COOKIE);
  if (!secret || !raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = raw.slice(0, dot);
  const want = await hmacHex(secret, 'kiwi-employee-v1:' + body);
  if (!timingSafeEqualHex(raw.slice(dot + 1), want)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
    if (!payload || !payload.merchant || !payload.staffId || Number(payload.exp) <= Date.now()) return null;
    return payload;
  } catch (_) { return null; }
}

export function employeeCookie(value) {
  return `${EMPLOYEE_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(EMPLOYEE_SESSION_MS / 1000)}`;
}

// Resolve the credentials the owner records on Dashboard → Équipe. Email is
// read from the private access mirror written with the cashier PIN roster. Old
// stores without that mirror still fall back to their Team document.
export async function findEmployeeCredential(env, emailValue, pinValue) {
  const email = String(emailValue || '').trim().toLocaleLowerCase('en').slice(0, 254);
  const pin = String(pinValue || '').trim();
  if (!env || !env.DB || !/^\S+@\S+\.\S+$/.test(email) || !/^\d{4}$/.test(pin)) return null;

  let docs;
  try {
    docs = await env.DB.prepare(
      "SELECT merchant, feature, data, updated_ts FROM store_docs WHERE feature IN ('employee-access', 'team')"
    ).all();
  } catch (_) { return null; }

  const rows = (docs && docs.results) || [];
  const byMerchant = new Map();
  rows.forEach((row) => {
    const merchant = String(row.merchant || '');
    if (!merchant) return;
    const pair = byMerchant.get(merchant) || {};
    pair[row.feature === 'employee-access' ? 'access' : 'team'] = row;
    byMerchant.set(merchant, pair);
  });
  const matches = [];
  const seen = new Set();
  for (const [merchant, pair] of byMerchant) {
    let accessDoc = null, teamDoc = null;
    try { accessDoc = pair.access ? JSON.parse(pair.access.data || '{}') : null; } catch (_) {}
    try { teamDoc = pair.team ? JSON.parse(pair.team.data || '{}') : null; } catch (_) {}
    const accessMembers = Array.isArray(accessDoc && accessDoc.members) ? accessDoc.members : [];
    const teamMembers = Array.isArray(teamDoc && teamDoc.members) ? teamDoc.members : [];
    const accessIdentity = accessMembers.find((member) =>
      String((member && member.email) || '').trim().toLocaleLowerCase('en') === email);
    // The mirror wins for an identity it knows (including a changed PIN). If it
    // does not know the employee, a NEWER Team document is a newly saved hire,
    // not a deleted account resurrected from stale data.
    const teamIsNewer = !pair.access
      || Number((pair.team && pair.team.updated_ts) || 0) > Number(pair.access.updated_ts || 0);
    const members = accessIdentity ? [accessIdentity] : (teamIsNewer ? teamMembers : []);
    for (const member of members) {
      const memberEmail = String((member && member.email) || '').trim().toLocaleLowerCase('en');
      const memberPin = String((member && (member.pinCode || member.password)) || '').trim();
      const venue = String((member && member.venueSlug) || '').trim();
      if (venue && venue !== merchant) continue;
      const key = `${merchant}:${String((member && member.id) || '')}`;
      if (memberEmail === email && memberPin === pin && !seen.has(key)) {
        seen.add(key);
        matches.push({ merchant, member });
      }
    }
  }
  // Never guess which workplace the person meant. The owner can resolve a rare
  // duplicate by giving that employee a different PIN in one of the stores.
  if (matches.length !== 1) return matches.length > 1 ? { ambiguous: true } : null;

  const match = matches[0];
  const memberId = String((match.member && match.member.id) || '').trim().slice(0, 96);
  if (!memberId) return null;
  try {
    const cfg = await env.DB.prepare(
      'SELECT status, type FROM merchant_config WHERE merchant = ? LIMIT 1'
    ).bind(match.merchant).first();
    if (!cfg) return null;
    return {
      id: memberId,
      merchant: match.merchant,
      pin,
      name: [match.member.firstName, match.member.lastName].filter(Boolean).join(' ').trim(),
      role: String(match.member.function || match.member.department || 'staff'),
      status: cfg.status,
      type: cfg.type,
      member: match.member,
    };
  } catch (_) { return null; }
}

export function clearEmployeeCookie() {
  return `${EMPLOYEE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
export async function operatorToken(authSecret) {
  return hmacHex(authSecret, 'kiwi-operator-v1');
}

/* QUI est l'opérateur, et pas seulement « c'en est un ».
 *
 * kiwi_op est le même cookie pour tout le monde — HMAC du secret, sans identité
 * dedans — parce qu'il ne sert qu'à dire « ce code était bon ». Le journal des
 * modules (config_audit) doit pouvoir écrire un nom en face d'un geste, alors le
 * middleware pose EN PLUS ce cookie-ci au moment où un code est vérifié.
 *
 * Signé, sinon il suffirait de le réécrire pour attribuer une coupure à un
 * collègue : la valeur est "<operators.id>.<HMAC(secret, id)>" et lire l'id sans
 * revérifier la signature reviendrait à croire le navigateur sur parole.
 * Absent ⇒ null, et l'appelant écrit une identité générique plutôt qu'un faux
 * nom (laissez-passer équipe, ou session ouverte avant cette version). */
export const OPID_COOKIE = 'kiwi_op_id';
export async function operatorIdToken(authSecret, opId) {
  return String(opId) + '.' + (await hmacHex(authSecret, 'kiwi-operator-id-v1:' + String(opId)));
}
export async function readOperatorId(request, env) {
  const secret = env && env.AUTH_SECRET;
  const raw = readCookie(request, OPID_COOKIE);
  if (!secret || !raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const want = await hmacHex(secret, 'kiwi-operator-id-v1:' + id);
  return timingSafeEqualHex(raw.slice(dot + 1), want) ? id : null;
}

/* A live, named operator session.
 *
 * The old kiwi_op cookie is the same HMAC for every operator and survives after
 * the corresponding database row is deleted. Requiring the signed identity
 * cookie AND the current row turns revocation into a real server-side decision.
 * Fail closed on DB errors: God Mode can be unavailable during an incident; it
 * must never become unauditable. */
export async function namedOperatorId(request, env) {
  const authSecret = env && env.AUTH_SECRET;
  if (!authSecret || !env || !env.DB) return null;
  const want = await operatorToken(authSecret);
  if (!timingSafeEqualHex(readCookie(request, OP_COOKIE) || '', want)) return null;
  const id = await readOperatorId(request, env);
  if (!id) return null;
  try {
    const row = await env.DB.prepare('SELECT id FROM operators WHERE id = ?').bind(id).first();
    return row && row.id === id ? id : null;
  } catch (_) { return null; }
}

/* ── QUI EST OPÉRATEUR ────────────────────────────────────────────────────────
 * UN CODE NOMMÉ, et rien d'autre. Ni une session commerçant — la console est
 * transversale — ni, surtout, le laissez-passer d'équipe.
 *
 * Ce dernier point est un correctif, pas un choix d'origine. Cette fonction a
 * longtemps admis AUSSI le cookie kiwi_gate, c'est-à-dire SITE_PASSWORD : le
 * code court que l'on tape à « Accès équipe », celui que l'on donne à un
 * partenaire, celui que voit passer toute personne à qui l'on montre le produit.
 * Comme entitledMerchant() consulte isOperator() AVANT la session du compte,
 * n'importe quel navigateur ayant franchi cette porte-là devenait lecteur de
 * TOUS les locataires : il suffisait d'ajouter ?merchant=<slug> à une URL du
 * tableau de bord. Vérifié en production le 28/07/2026 depuis une simple session
 * commerçant munie du cookie d'équipe — ventes d'un autre commerce, sa carte,
 * sa file de commandes, et ses PIN de caisse en clair, noms et rôles compris.
 *
 * La ligne juste dessous en dit la raison de fond, écrite ici bien avant la
 * fuite : un secret partagé ne porte aucun nom. « Tapé par quelqu'un qui
 * connaissait le code d'équipe » n'est pas une responsabilité, c'est une liste
 * de suspects. Cette règle était appliquée aux ÉCRITURES (isSeniorOperator) et
 * pas aux LECTURES ; or lire les PIN d'un commerçant est le geste le plus grave
 * du lot, puisqu'il ouvre sa caisse.
 *
 * Le laissez-passer d'équipe garde exactement le rôle qu'il n'aurait jamais dû
 * quitter : ouvrir le SITE (_middleware.js, étape 2). Il n'ouvre plus personne
 * d'autre que soi-même.
 *
 * Amorçage : la première fois, la table `operators` est vide et personne ne peut
 * entrer. Le code se sème hors ligne (tools/, ou un INSERT dans D1) — c'est déjà
 * le chemin documenté, et la production en compte deux au moment de ce
 * changement, donc aucun accès n'est perdu ici. */
export async function isOperator(request, env) {
  return !!(await namedOperatorId(request, env));
}

/* ── LE DEUXIÈME NIVEAU : un code opérateur NOMMÉ ─────────────────────────────
 * Ce niveau existait parce qu'isOperator() admettait deux choses très
 * différentes sous un seul nom : un code de la table `operators`, qui appartient
 * à quelqu'un, et SITE_PASSWORD, le laissez-passer d'équipe. Pour LIRE la
 * console on tolérait les deux ; pour sortir une vente des livres d'un
 * commerçant, changer l'adresse d'un compte ou lancer une réinitialisation, on
 * exigeait ici le code nommé — un geste doit porter un nom au journal.
 *
 * Le raisonnement était juste, la frontière ne l'était pas : lire les PIN de
 * caisse d'un commerçant est plus grave que la plupart des écritures qu'il
 * protégeait. isOperator() n'accepte donc plus, lui non plus, que le code nommé,
 * et LES DEUX NIVEAUX COÏNCIDENT AUJOURD'HUI.
 *
 * On garde malgré tout les deux noms, et ce n'est pas de l'inertie : aux points
 * d'appel, `senior && !isSeniorOperator → 403` dit « ce geste-ci doit être
 * imputable », ce qu'un `isOperator` de plus ne dirait pas. Si un jour une
 * lecture doit se rouvrir à un secret partagé, la frontière est déjà tracée au
 * bon endroit. En attendant, les deux répondent la même chose. */
export async function isSeniorOperator(request, env) {
  return !!(await namedOperatorId(request, env));
}

/* Qui agit ? Le cookie kiwi_op est le même pour tous les opérateurs — il ne
 * prouve que « un code a été accepté ». kiwi_op_id, signé, porte lequel.
 * Sans lui on écrit 'equipe' : une identité honnête et vague vaut mieux qu'une
 * fausse précision dans un journal. Écrit une fois ici parce que trois panneaux
 * (modules, ventes, comptes) posent maintenant la même question. */
export async function operatorActor(request, env) {
  const id = await readOperatorId(request, env);
  if (!id) return { id: '', label: 'equipe' };
  try {
    const row = await env.DB.prepare('SELECT label FROM operators WHERE id = ?').bind(id).first();
    return { id, label: (row && row.label) || 'opérateur' };
  } catch (_) { return { id, label: 'opérateur' }; }
}

/* ── ADRESSE MASQUÉE ──────────────────────────────────────────────────────────
 * « à quelle adresse le lien est-il parti ? » doit rester vérifiable dans le
 * journal sans que celui-ci devienne un annuaire des adresses de tous les
 * clients, lisible par n'importe quel opérateur. On garde donc de quoi
 * RECONNAÎTRE une adresse qu'on connaît déjà, pas de quoi en apprendre une.
 * Le domaine reste entier : c'est lui qui permet de repérer qu'on a écrit chez
 * l'ancien fournisseur du client, et il ne désigne personne à lui seul. */
export function maskEmail(e) {
  const s = normEmail(e);
  const at = s.lastIndexOf('@');
  if (at <= 0) return s ? '•••' : '';
  const user = s.slice(0, at);
  const dom = s.slice(at);
  if (user.length <= 2) return user.slice(0, 1) + '•' + dom;
  return user.slice(0, 1) + '•'.repeat(Math.min(6, user.length - 2)) + user.slice(-1) + dom;
}

/* ── ENVOI D'E-MAIL ───────────────────────────────────────────────────────────
 * Kiwi n'a pas de fournisseur d'e-mail, et n'en avait aucun besoin jusqu'ici :
 * rien dans le produit n'écrivait au client. Deux fonctions de cette livraison
 * le demandent (prévenir l'ancienne adresse d'un changement, envoyer un lien de
 * réinitialisation), donc voici la sortie — sur le MÊME mécanisme que
 * mirrorLead() : un webhook Google Apps Script, où `MailApp.sendEmail` fait le
 * travail. Pas de dépendance, pas de clé d'API tierce, et le partenaire a déjà
 * ce chemin en place pour les leads.
 *
 * Sans MAIL_WEBHOOK configuré, on ne fait PAS semblant : la fonction renvoie
 * { ok:false, reason:'unconfigured' } et la console l'affiche à l'opérateur. Un
 * bouton « envoyé ✓ » au-dessus d'un e-mail qui n'est jamais parti est pire que
 * pas de bouton du tout — l'opérateur raccroche en croyant le client servi.
 *
 * `ok:false` ne doit jamais faire échouer l'action appelante : le changement
 * d'adresse a bien eu lieu même si la notification n'est pas partie. L'état
 * d'envoi est inscrit au journal, et c'est là qu'on va le chercher. */
export async function sendMail(env, msg) {
  const url = env && env.MAIL_WEBHOOK;
  if (!url) return { ok: false, reason: 'unconfigured' };
  const to = normEmail(msg && msg.to);
  if (!to) return { ok: false, reason: 'no-recipient' };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'mail',
        to,
        subject: String((msg && msg.subject) || 'Kiwi'),
        text: String((msg && msg.text) || ''),
      }),
    });
    return r && r.ok ? { ok: true } : { ok: false, reason: 'http-' + ((r && r.status) || 0) };
  } catch (e) {
    return { ok: false, reason: 'network' };
  }
}

// Session token = base64url(JSON{aid,exp}) + "." + HMAC(secret, payload).
export async function makeSession(accountId, secret) {
  const exp = Date.now() + SESS_DAYS * 86400 * 1000;
  const payload = bytesToB64url(encoder.encode(JSON.stringify({ aid: accountId, exp })));
  const sig = await hmacHex(secret, payload);
  return payload + '.' + sig;
}

export async function readSession(token, secret) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const dot = token.indexOf('.');
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacHex(secret, payload);
  if (!timingSafeEqualHex(sig, expected)) return null;
  let obj;
  try { obj = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload))); } catch (_) { return null; }
  if (!obj || typeof obj.exp !== 'number' || obj.exp < Date.now()) return null;
  return obj;
}

export function sessionCookie(value) {
  return `${SESS_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESS_DAYS * 86400}`;
}
export function clearSessionCookie() {
  return `${SESS_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

// Merchant slug convention: slugify(business name). "Café Atlas" → "cafe-atlas",
// which is also the Live Link default merchant key, so the roster lines an account
// up with its sales without a stored mapping. Strips accents, lowercases, and
// collapses non-alphanumerics to single hyphens.
export function slugMerchant(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // drop accents
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'client';
}

// Fire-and-forget lead mirror to a Google Apps Script webhook (set as
// LEADS_WEBHOOK). Best-effort: a failure never blocks or breaks signup.
export async function mirrorLead(env, lead) {
  const url = env && env.LEADS_WEBHOOK;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    });
  } catch (_) { /* best-effort */ }
}

/* ── JETON DE RÉINITIALISATION ────────────────────────────────────────────────
 * Deux moitiés, et c'est le cœur du dispositif.
 *
 *   selector  — public, sert UNIQUEMENT à retrouver la ligne (clé primaire).
 *   verifier  — le secret ; la base n'en garde que le HMAC.
 *
 * Pourquoi pas un seul secret, cherché directement en base ? Parce qu'il
 * faudrait alors l'indexer en clair, et une lecture de la table `reset_tokens`
 * rendrait tous les liens vivants utilisables. Ici, cette même lecture ne donne
 * que des empreintes : elle ne permet de reprendre aucun compte.
 *
 * 32 octets de hasard répartis sur les deux moitiés — hors de portée d'un
 * script, et le limiteur d'essais couvre le reste.
 *
 * Le jeton complet n'existe qu'une fois, en mémoire, le temps d'écrire l'e-mail.
 * Il n'est jamais renvoyé à la console, jamais journalisé, jamais stocké. */
export function makeResetToken() {
  const rnd = (n) => bytesToB64url(crypto.getRandomValues(new Uint8Array(n)));
  const selector = rnd(9);
  const verifier = rnd(24);
  return { selector, verifier, token: selector + '.' + verifier };
}
export async function resetVerifierHash(authSecret, verifier) {
  return hmacHex(authSecret, 'kiwi-reset-v1:' + String(verifier || ''));
}
/* Un jeton malformé n'est pas une erreur à signaler, c'est un jeton invalide :
   on renvoie null et l'appelant répond « lien expiré ou déjà utilisé », le même
   message que pour un lien réellement périmé. Distinguer les deux apprendrait à
   un attaquant à reconnaître un selector qui existe. */
export function splitResetToken(token) {
  const s = String(token || '');
  const dot = s.indexOf('.');
  if (dot <= 0 || dot === s.length - 1) return null;
  const selector = s.slice(0, dot);
  const verifier = s.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(selector) || !/^[A-Za-z0-9_-]{8,128}$/.test(verifier)) return null;
  return { selector, verifier };
}

/* ── TENANT ENTITLEMENT ──────────────────────────────────────────────────────
 * feed.js worked this out first, and documented it at length: being past the
 * site gate is NOT the same as being entitled to a tenant, because the gate
 * admits EVERY signed-in merchant plus a shared staff passcode. An endpoint that
 * honours a client-supplied `merchant` therefore hands any caller any store —
 * and slugs are derived from business names, so they are guessable.
 *
 * That reasoning was written once, in one file, and never propagated: /api/sale
 * and /api/order/queue still took the tenant from the request body and query.
 * It lives here now, so the next endpoint inherits the rule instead of having to
 * rediscover it.
 *
 *   · paired till     → the store it was bound to (checked FIRST: on a
 *                       multi-store account the till, not the session, knows
 *                       which établissement is ringing)
 *   · account session → the store it asked for WHEN THE REGISTRY SAYS IT OWNS
 *                       IT, otherwise its own account slug
 *   · operator        → whatever was asked; that is the point of God mode
 *   · gate only       → demo tenants, nothing else
 *
 * Returns '' when the caller is entitled to nothing — callers must refuse. */
export const DEMO_MERCHANTS = { 'cafe-atlas': 1, 'maison-mansour': 1, 'spa-bahia': 1 };

/* Who owns this store? '' = a row that predates the registry (or one an operator
 * seeded) and belongs to nobody yet; null = the column isn't there, i.e. the
 * database has not been migrated. Callers treat both the same way — fall back to
 * the account slug — which is what makes the widening below safe to deploy
 * before the ALTER runs. config.js, menu.js and _private.js each carry an older
 * copy of this with identical semantics; new endpoints should import this one. */
export async function storeOwner(env, slug) {
  try {
    const row = await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?')
      .bind(slug).first();
    return row ? (row.account_id || '') : null;
  } catch (_) { return null; }
}

export async function entitledMerchant(request, env, asked, opts) {
  asked = String(asked || '').slice(0, 64);
  /* No auth configured at all (local static server, preview without secrets):
   * the gate is inert there, so keep the historical behaviour rather than
   * bricking local development. */
  if (!env || !env.AUTH_SECRET) return asked;

  if (opts && opts.allowTill && asked) {
    try { if (await isTillFor(request, env, asked)) return asked; } catch (_) {}
  }
  /* The employee app has its own short-lived, store-scoped cookie. It used to
   * open /api/employee only, so the waiter UI could say "commande envoyée"
   * while /api/order/queue rejected the request at the tenant boundary. Validate
   * the employee against the live Team document on every use: removing someone
   * from Dashboard → Équipe revokes this access immediately. */
  if (opts && opts.allowEmployee && asked) {
    try {
      const employee = await activeServiceEmployee(request, env, asked);
      if (employee) return asked;
    } catch (_) {}
  }
  /* God mode, BEFORE the account session — the console is opened from a browser
   * that is normally ALSO signed in as a merchant (the site gate admits real
   * accounts), and with the session first that account won every time: "Ouvrir
   * dashboard" on any client polled the OPERATOR's own store, so every client's
   * En Direct feed and KPIs showed the operator's takings. The doc above always
   * promised "operator → whatever was asked"; only the ordering said otherwise.
   * Not a widening: isOperator() now demands a NAMED operator code — a signed
   * cookie checked against the live `operators` table on every request — so a
   * plain merchant, and a browser holding only the shared team passcode, both
   * fall through to the session branch and reach nothing but their own shops.
   * That last part is the fix for the cross-tenant read; see isOperator(). */
  if (asked) {
    try { if (await isOperator(request, env)) return asked; } catch (_) {}
  }
  try {
    const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
    if (sess && sess.aid && env.DB) {
      const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(sess.aid).first();
      if (!(acc && acc.business)) return '';
      const accSlug = slugMerchant(acc.business);
      /* One login holds SEVERAL établissements, and money is the one thing that
       * must never cross between them. Collapsing every store onto accounts
       * .business is exactly what put the boutique's takings in the restaurant's
       * Commandes: both dashboards polled that single tenant, and both tills
       * wrote into it, so the two shops shared one till roll. The registry says
       * which stores are really this account's — config.js and _private.js
       * already resolve their tenant this way; the sales path was the one left
       * behind. An unowned or unclaimed slug still snaps back to the account,
       * so nothing widens beyond the caller's own shops. */
      if (asked && asked !== accSlug && (await storeOwner(env, asked)) === sess.aid) return asked;
      return accSlug;
    }
  } catch (_) { /* fall through to operator / demo */ }
  try { if (await isOperator(request, env)) return asked; } catch (_) {}
  return DEMO_MERCHANTS[asked] ? asked : '';
}

/* A signed employee cookie is not enough on its own: the member must still be
 * present in this store's Team document. This helper is intentionally exported
 * so the edge gate and staff-only endpoints enforce the same revocation rule. */
export async function activeEmployee(request, env, asked) {
  if (!env || !env.DB || !env.AUTH_SECRET) return null;
  const session = await readEmployee(request, env);
  if (!session || !session.merchant || !session.staffId) return null;
  if (asked && String(session.merchant) !== String(asked)) return null;
  try {
    const [access, team] = await Promise.all([
      env.DB.prepare("SELECT data, updated_ts FROM store_docs WHERE merchant = ? AND feature = 'employee-access'")
        .bind(session.merchant).first(),
      env.DB.prepare("SELECT data, updated_ts FROM store_docs WHERE merchant = ? AND feature = 'team'")
        .bind(session.merchant).first(),
    ]);
    const accessDoc = JSON.parse((access && access.data) || '{}');
    const teamDoc = JSON.parse((team && team.data) || '{}');
    const find = (doc) => (Array.isArray(doc.members) ? doc.members : [])
      .find((m) => m && String(m.id || '') === String(session.staffId));
    const accessMember = find(accessDoc);
    const teamMember = find(teamDoc);
    const teamIsNewer = !access || Number((team && team.updated_ts) || 0) > Number(access.updated_ts || 0);
    const member = accessMember
      ? { ...(teamMember || {}), ...accessMember }
      : (teamIsNewer ? teamMember : null);
    return member ? { session, member, merchant: session.merchant } : null;
  } catch (_) { return null; }
}

function normEmployeeRole(value) {
  let s = String(value || '').trim().toLowerCase();
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
  return s.replace(/[’`´]/g, "'").replace(/\s+/g, ' ');
}

/* A personal PIN identifies every employee in the employee app, but opening a
 * cash register is a separate permission. Keep this server-side too: filtering
 * only in caisse JavaScript would let a crafted request reuse a server's PIN on
 * privileged till actions. `staff` is the single legacy onboarding role kept
 * for stores created before explicit job assignments existed. */
export function employeeRoleOpensTill(value) {
  const role = normEmployeeRole(value);
  return new Set([
    'caisse', 'caissier', 'caissiere', 'cashier',
    'manager', 'management', 'proprietaire', 'owner', 'admin', 'direction',
    'staff',
  ]).has(role);
}

/* Only an employee who works service AND currently has an open attendance
 * entry may use the operational order/event channels. Kitchen, dishwasher and
 * off-shift accounts remain confined to /api/employee (schedule, hours and
 * clock-in/out). */
export async function activeServiceEmployee(request, env, asked) {
  const employee = await activeEmployee(request, env, asked);
  if (!employee) return null;
  const role = normEmployeeRole(employee.member.function || employee.member.department);
  const service = new Set([
    'serveur', 'chef de rang', "maitre d'hotel", 'sommelier', 'barman',
    "hote d'accueil", 'salle', 'service', 'manager', 'proprietaire',
  ]);
  if (!service.has(role)) return null;
  try {
    const row = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'attendance'")
      .bind(employee.merchant).first();
    const doc = JSON.parse((row && row.data) || '{}');
    const open = (Array.isArray(doc.entries) ? doc.entries : []).find((entry) =>
      entry && !entry.outTs
      && String(entry.memberId || entry.staffId || '') === String(employee.session.staffId));
    return open ? { ...employee, attendance: open } : null;
  } catch (_) { return null; }
}

/* ─────────────────────── ATTEMPT LIMITER (brute force) ───────────────────────
 * Le même compteur que l'appairage (functions/api/pair/redeem.js), rendu
 * réutilisable. Il manquait là où il compte le plus : /auth/operator, le POST
 * /__operator du middleware et /auth/login n'avaient AUCUNE limite. Un code
 * opérateur fait au minimum 4 caractères — soit ~10 000 essais pour obtenir la
 * console d'administration, c'est-à-dire les ventes, les PIN et les clients de
 * TOUS les commerçants. Sans plafond, c'est quelques minutes de script.
 *
 * On réutilise la table pair_attempts telle quelle (aucune migration) en
 * préfixant la clé par un domaine : « op|1.2.3.4 ». Sans ce préfixe un
 * appairage raté bloquerait une connexion, et l'opérateur partagerait son
 * quota avec les caisses.
 *
 * Toujours « fail open » : si la table manque ou que D1 tousse, on laisse
 * passer. Un limiteur cassé ne doit jamais empêcher un commerçant d'entrer
 * chez lui.
 * ───────────────────────────────────────────────────────────────────────── */
const LIMIT_WINDOW_MS = 15 * 60 * 1000;   // fenêtre d'observation
const LIMIT_BLOCK_MS  = 15 * 60 * 1000;   // durée du blocage
const LIMIT_MAX_FAILS = 8;                // essais ratés tolérés par fenêtre

function limiterKey(request, scope) {
  const ip = request.headers.get('CF-Connecting-IP')
          || request.headers.get('X-Forwarded-For')
          || '';
  return ip ? `${scope}|${ip}` : '';
}

/* Déjà bloqué ? Vérifié AVANT de regarder le code, pour qu'une entrée
   malformée ne serve pas de sonde gratuite. Renvoie une Response 429 à
   retourner telle quelle, ou null si la voie est libre. */
export async function limitCheck(request, env, scope) {
  const k = limiterKey(request, scope);
  if (!k || !env.DB) return null;
  try {
    const a = await env.DB.prepare(
      'SELECT blocked_until FROM pair_attempts WHERE ip = ?'
    ).bind(k).first();
    const now = Date.now();
    if (a && a.blocked_until && a.blocked_until > now) {
      return json({ error: 'too_many_attempts', retry_after: Math.ceil((a.blocked_until - now) / 1000) }, 429);
    }
  } catch (_) { /* pas de table → pas de limiteur */ }
  return null;
}

/* Un essai raté de plus. Fenêtre glissante par redémarrage : passé
   LIMIT_WINDOW_MS la ligne repart à 1, donc elle expire d'elle-même. */
export async function limitFail(request, env, scope) {
  const k = limiterKey(request, scope);
  if (!k || !env.DB) return;
  const now = Date.now();
  try {
    const a = await env.DB.prepare(
      'SELECT fails, first_ts FROM pair_attempts WHERE ip = ?'
    ).bind(k).first();
    if (!a || (now - a.first_ts) > LIMIT_WINDOW_MS) {
      await env.DB.prepare(
        `INSERT INTO pair_attempts (ip, fails, first_ts, blocked_until) VALUES (?, 1, ?, NULL)
         ON CONFLICT(ip) DO UPDATE SET fails = 1, first_ts = excluded.first_ts, blocked_until = NULL`
      ).bind(k, now).run();
      return;
    }
    const fails = (a.fails || 0) + 1;
    const blocked = fails >= LIMIT_MAX_FAILS ? (now + LIMIT_BLOCK_MS) : null;
    await env.DB.prepare(
      'UPDATE pair_attempts SET fails = ?, blocked_until = ? WHERE ip = ?'
    ).bind(fails, blocked, k).run();
  } catch (_) { /* limiteur indisponible → on laisse passer */ }
}

/* Entrée réussie : on efface l'ardoise, pour qu'un commerçant qui s'est
   trompé deux fois avant de réussir ne traîne pas son compteur. */
export async function limitClear(request, env, scope) {
  const k = limiterKey(request, scope);
  if (!k || !env.DB) return;
  try { await env.DB.prepare('DELETE FROM pair_attempts WHERE ip = ?').bind(k).run(); } catch (_) {}
}
