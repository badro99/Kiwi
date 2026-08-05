// Kiwi — full-site account gate (Cloudflare Pages Function).
//
// Real, server-side protection: until the visitor is authenticated, NOTHING is
// served — no page, no CSS, no image. This runs on every request at the edge, so
// it is not bypassable via view-source the way a client-side overlay would be. It
// runs only on Cloudflare Pages (inert on the local static server and on GitHub
// Pages), and it is free on the CF Pages tier.
//
// Two ways in, checked in this order:
//   1. Account session — a merchant who signed up / logged in (email + password).
//      Handled by /auth/* (see functions/auth/*). Session = HMAC-signed cookie,
//      verified here with AUTH_SECRET.
//   2. Employee access — email + personal 4-digit code saved by the owner in
//      Dashboard → Équipe. It opens only the employee app, never the dashboard.
//
// ── Configure (Cloudflare Pages → Settings → Variables & Secrets) ─────────────
//   AUTH_SECRET   = <random 32-byte hex>   (secret; signs account sessions)
//   SITE_PASSWORD = <staff passcode>       (optional; enables the staff bypass)
//   LEADS_WEBHOOK = <Google Apps Script /exec URL>  (optional; mirrors signups)
// With NEITHER AUTH_SECRET nor SITE_PASSWORD set, the site serves openly (dev).
// Changing a variable requires a fresh deployment (not "Retry") to take effect.

import {
  readSession, readCookie, SESS_COOKIE, clearSessionCookie,
  operatorToken, OP_COOKIE, operatorIdToken, OPID_COOKIE, namedOperatorId, verifyPassword,
  findEmployeeCredential, employeeToken, employeeCookie,
  limitCheck, limitFail, limitClear,
} from './auth/_lib.js';

const GATE_COOKIE = 'kiwi_gate';
const UNLOCK_PATH = '/__unlock';
const OPERATOR_PATH = '/__operator';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Staff cookie value = HMAC-SHA256("kiwi-gate-v1", passcode). Unforgeable without
// the passcode, so a stolen/guessed cookie cannot be constructed.
async function expectedToken(password) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('kiwi-gate-v1'));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Is this account still allowed in? The session token is stateless (signature +
// expiry only), so on its own it keeps working for up to 30 days even after we
// delete or suspend the client. This turns that trust into a live check:
//   · row missing  → the account was deleted   → revoke (return false)
//   · status suspended → the client is frozen   → revoke (return false)
//   · active       → allow
// FAIL OPEN on any infrastructure problem (no DB binding, query throws, or the
// `status` column not migrated yet): we return true so a transient database
// blip can never lock out every paying client at once. Only a definitive
// "row is gone" or "status = suspended" result revokes access.
async function accountActive(env, aid) {
  if (!env.DB || !aid) return true;
  try {
    const row = await env.DB.prepare('SELECT status FROM accounts WHERE id = ?').bind(aid).first();
    if (!row) return false;                // deleted
    return row.status !== 'suspended';     // frozen for non-payment, etc.
  } catch (_) {
    return true;                           // can't verify → don't lock anyone out
  }
}

async function routeRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const authSecret = env.AUTH_SECRET;
  const sitePassword = env.SITE_PASSWORD;
  const isApi = path.indexOf('/api/') === 0;

  // ── Public customer surface (unauthenticated by design) ────────────────────
  // A diner who scans a table QR has NO account and NO gate cookie, so the whole
  // gate below would lock them out. The self-order page and its READ-ONLY menu
  // endpoint are the only surfaces a customer legitimately reaches with no
  // session — allow-list them precisely (exact path, GET/HEAD only) and nothing
  // else. The page carries no merchant secrets (it fetches its menu by slug), and
  // GET /api/menu returns only the published carte + display name (never PINs,
  // sales, or account data — see functions/api/menu.js). POST /api/menu is NOT
  // here: publishing still requires the merchant's authenticated dashboard
  // session, which passes the normal gate below.
  //
  // OrderPro (the NFC white-label app) extends the same allow-list, on the same
  // terms. Its capability is the merchant slug written into the tag's URL — the
  // model /api/pair/redeem already uses for its 6-digit code. Every entry is an
  // EXACT path: '/api/order' is open, '/api/order/queue' — the staff view that
  // lists tickets with items and totals, and accepts them — is NOT, because
  // nothing here does a prefix match on it. /api/media/ is the one prefix, and
  // only because uploaded files have generated keys; it is a read-only object
  // fetch under a merchant-namespaced path (functions/api/media/[[key]].js).
  //
  // Reads are open; the ONLY public write is placing an order, and that handler
  // independently refuses unless the merchant has Order Pro switched on — being
  // allow-listed past the gate is not the same as being enabled.
  // Both spellings of each page are listed on purpose. Cloudflare Pages serves
  // `/foo.html` by 308-redirecting to the extension-less `/foo`, so a customer
  // who opens the .html link we generate arrives a second time on a path that
  // never matched this list — and met the staff login screen. Allow-listing the
  // clean URL adds no surface: it is the same document, GET/HEAD only.
  const method = request.method;
  const isRead = method === 'GET' || method === 'HEAD';

  // The marketing landing page is public. Keep the merchant application and
  // its APIs behind the account/staff gate below, but let visitors reach the
  // homepage (and the static Next assets it renders) before signing in.
  //
  // Chaque dossier de langue est ouvert EN ENTIER, pas seulement son index.
  // Un export Next ne se réduit pas à `/fr/index.html` : à côté vivent la
  // charge RSC de navigation (`index.txt`, `__next._tree.txt`,
  // `__next.$d$locale.__PAGE__.txt` …) et `opengraph-image`. N'autoriser que
  // le chemin exact `/fr/` les laissait tous en 401, et rien ne le signalait :
  // Next voit échouer sa navigation douce, retombe sur un rechargement complet
  // de la page — qui, lui, répond 200 — et le site paraît fonctionner. Le prix
  // était invisible : un aller-retour 401 gaspillé à chaque préchargement, un
  // rechargement complet à chaque changement de langue, et surtout aucun
  // aperçu de lien, puisque le scraper WhatsApp recevait l'écran de connexion
  // à la place de l'image OG.
  //
  // Ça n'ouvre rien : ces trois dossiers sont la sortie statique du site
  // vitrine, ils ne contiennent ni données marchandes ni API.
  const isLandingPath = path === '/'
    || path === '/fr' || path.startsWith('/fr/')
    || path === '/en' || path.startsWith('/en/')
    || path === '/ar' || path.startsWith('/ar/')
    || path.startsWith('/_next/') || path.startsWith('/images/')
    || path.startsWith('/model/') || path.startsWith('/draco/')
    // La favicone du site vitrine vit a la racine, pas sous /assets : Next la
    // demande en `/icon.svg`, et les navigateurs vont chercher `/favicon.ico`
    // tout seuls meme quand personne ne l'a declaree. Ni l'une ni l'autre ne
    // correspondait a un prefixe autorise, donc les deux repartaient en 401 --
    // et un 401 sur une favicone ne se signale nulle part : la page repond 200,
    // la console reste muette, l'onglet affiche simplement le globe gris par
    // defaut. C'est ce qu'on voyait sur kiwi-os.com. Un fichier d'icone ne
    // contient rien de prive.
    || path === '/icon.svg' || path === '/favicon.ico' || path === '/apple-icon.png';
  if (isRead && isLandingPath) return next();

  /* Les fichiers statiques que ces pages CHARGENT. Allow-lister la page sans ses
   * scripts, c'est servir un document qui demande ensuite `assets/lucide.min.js`
   * et reçoit l'écran de connexion à la place : le navigateur tente de lire du
   * HTML comme du JavaScript, `window.lucide` reste undefined, et le client qui
   * scanne le QR voit vingt-deux carrés vides à la place des icônes. C'est ce
   * qui se passait en production — la page répondait 200, donc rien ne le
   * signalait.
   *
   * Ça n'ouvre aucune donnée. /assets ne contient que du JS, du CSS et des
   * polices, servis tels quels à tous les navigateurs, et les deux dépôts Kiwi
   * sont PUBLICS sur GitHub : ces fichiers sont déjà lisibles par n'importe qui,
   * et GitHub Pages les sert en clair. Les fermer ici ne protégeait rien — ça ne
   * cassait que la seule page qu'un client voit. Ce qui est privé vit derrière
   * /api, qui reste entièrement gardé.
   *
   * GET/HEAD uniquement, et en préfixe car les pages publiques évoluent : un
   * quinzième script ajouté à kiwi-order.html ne doit pas re-casser la commande
   * client en silence (tools/public-assets-test.js tient cette promesse). */
  if (isRead && path.startsWith('/assets/')) return next();
  if (isRead && (path === '/kiwi-order.html' || path === '/kiwi-order' || path === '/api/menu')) return next();
  // Employee/service app. The page itself contains no merchant data; its single
  // API independently validates a store PIN and then an httpOnly employee
  // session. Exact paths only — no other private API is opened by this exception.
  if (isRead && (path === '/kiwi-serveur.html' || path === '/kiwi-serveur'
    || path === '/serveur.webmanifest' || path === '/api/employee')) return next();
  if (method === 'POST' && path === '/api/employee') return next();
  // La page de réinitialisation de mot de passe. Quelqu'un qui a perdu son mot
  // de passe n'a par définition AUCUNE session : la porte du site la lui
  // refuserait, et le lien qu'on vient de lui envoyer tomberait sur l'écran de
  // connexion — c'est-à-dire exactement l'écran qu'il ne peut pas passer.
  // Les deux orthographes, comme les pages ci-dessous : Pages sert /foo.html en
  // redirigeant vers /foo, et l'URL propre n'aurait jamais croisé cette liste.
  // N'ouvre aucune donnée : la page est un formulaire, tout se joue dans
  // /auth/reset (déjà accessible, comme tout /auth/*) qui exige un jeton signé
  // et ne renvoie jamais d'adresse e-mail.
  if (isRead && (path === '/reset.html' || path === '/reset')) return next();
  if (isRead && (path === '/OrderPro.html' || path === '/OrderPro'
    || path === '/api/order' || path === '/api/order/session'
    || path.startsWith('/api/media/'))) return next();
  /* Les deux seules écritures publiques : déposer une commande, et s'asseoir.
   * Chemins EXACTS — surtout pas le préfixe /api/order/, qui ouvrirait
   * /api/order/queue, c'est-à-dire la file du personnel avec ses articles, ses
   * totaux et le pouvoir d'accepter.
   *
   * Ouvrir une session ne prouve rien non plus : le handler refuse si Order Pro
   * est coupé, ET si le comptoir n'a pas donné signe de vie depuis cinq minutes.
   * C'est ce deuxième verrou qui empêche de commander de chez soi la nuit — il
   * se ferme tout seul quand la caisse s'éteint. */
  if (method === 'POST' && (path === '/api/order' || path === '/api/order/session')) return next();
  /* Le dépôt d'une commande par un canal extérieur (Glovo, Shopify, un relais
   * Make). Ces appelants n'ont ni session ni cookie et n'en auront jamais : ils
   * présentent une clé porteuse dans l'en-tête Authorization, que le handler
   * vérifie lui-même contre channel_links. Passer cette porte-ci ne prouve donc
   * toujours rien — exactement comme /api/order, qui est ouvert mais refuse si
   * Order Pro n'est pas activé. Chemin EXACT : rien sous /api/channel/ d'autre
   * n'est ouvert, et la gestion des clés reste derrière la porte normale. */
  if (method === 'POST' && path === '/api/channel/order') return next();
  /* La réception native de Shopify. Même raisonnement, une exception près : son
   * chemin PORTE l'identifiant du lien, donc il ne peut pas être exact. Le
   * préfixe est aussi étroit que possible — POST seulement, un seul segment
   * après, et rien d'autre sous /api/channel/ n'y correspond : la gestion des
   * clés (/api/channel/keys) reste derrière la porte normale.
   *
   * Ouvrir ce chemin ne prouve rien non plus. Shopify ne sait envoyer aucun
   * en-tête d'authentification ; ce qui tient la porte fermée, c'est la
   * signature HMAC que le handler vérifie lui-même, et il refuse tout tant que
   * le commerçant n'a pas enregistré la clé de signature de sa boutique. */
  if (method === 'POST' && /^\/api\/channel\/shopify\/[A-Za-z0-9-]{6,64}$/.test(path)) return next();

  // /order is the short link written onto NFC tags — every byte counts on an
  // NTAG213, and it is what a guest glimpses as their phone buzzes. Rewrite
  // (not redirect) so the query survives untouched and there is no extra round
  // trip. Target the clean URL, not OrderPro.html, or Pages answers the rewrite
  // with the 308 we just went out of our way to avoid.
  // Before the auth checks so it behaves the same on an open dev deploy.
  if (isRead && path === '/order') {
    const rewritten = new URL(request.url);
    rewritten.pathname = '/OrderPro';
    return next(new Request(rewritten, request));
  }

  // Nothing configured → open site (local dev / preview without secrets).
  if (!authSecret && !sitePassword) return next();

  // 1. Valid account session? A signed, unexpired token gets assets through
  // immediately (they carry no per-account data). For page loads and API calls
  // — the surfaces that expose a client's own data — we additionally confirm the
  // account still exists and isn't suspended, so deleting or freezing a client
  // cuts off their live session on the very next request. If the account was
  // revoked we DON'T return next(): we fall through so a stray staff/operator
  // cookie can still be honoured, then land on the lockout screen with the dead
  // session cookie cleared.
  let sessionRevoked = false;
  if (authSecret) {
    const token = readCookie(request, SESS_COOKIE);
    const sess = token ? await readSession(token, authSecret) : null;
    if (sess) {
      const dest = request.headers.get('Sec-Fetch-Dest');
      const wantsDoc = dest === 'document' ||
        (!dest && (request.headers.get('Accept') || '').indexOf('text/html') !== -1);
      if (!(wantsDoc || isApi)) return next();         // asset → trust the token
      if (await accountActive(env, sess.aid)) return next();
      sessionRevoked = true;                           // deleted/suspended → lock out below
    }
  }

  // 2. Valid staff bypass cookie?
  if (sitePassword) {
    const staff = await expectedToken(sitePassword);
    if (readCookie(request, GATE_COOKIE) === staff) return next();
  }

  // 3. Valid NAMED operator session? The common kiwi_op HMAC alone is not
  // enough: kiwi_op_id must be signed and still exist in the operators table.
  // Removing an operator therefore cuts off their open browsers immediately.
  if (authSecret && await namedOperatorId(request, env)) return next();

  // Not authorized. The /auth/* endpoints must still run so the screen works.
  if (path.startsWith('/auth/')) return next();

  // Employee login. The old shared SITE_PASSWORD form opened the whole product;
  // this route now accepts only the email + personal PIN from the private team
  // roster and creates a store-scoped employee session.
  if (request.method === 'POST' && path === UNLOCK_PATH) {
    if (!authSecret || !env.DB) return htmlResponse(authPage({ staffError: true, allowStaff: false }));
    const tooMany = await limitCheck(request, env, 'employee');
    if (tooMany) return tooMany;
    const form = await request.formData();
    const email = (form.get('email') || '').toString();
    const pin = (form.get('pin') || '').toString().replace(/\D/g, '').slice(0, 4);
    const employee = await findEmployeeCredential(env, email, pin);
    if (employee && !employee.ambiguous && String(employee.status || 'active') !== 'suspended') {
      await limitClear(request, env, 'employee');
      const token = await employeeToken(authSecret, { merchant: employee.merchant, staffId: employee.id });
      return new Response(null, {
        status: 303,
        headers: {
          Location: '/kiwi-serveur',
          'Set-Cookie': employeeCookie(token),
        },
      });
    }
    await limitFail(request, env, 'employee');
    return htmlResponse(authPage({ staffError: true, allowStaff: true }));
  }

  // Operator unlock attempt — a code from the `operators` table, revealed by the
  // hidden long-press gesture on the logo. Lands on the operator console.
  if (authSecret && request.method === 'POST' && path === OPERATOR_PATH) {
    // Même plafond que /auth/operator, et le même compteur ('op') : sans quoi
    // il suffisait de revenir sur l'écran verrouillé pour repartir à zéro.
    const tooMany = await limitCheck(request, env, 'op');
    if (tooMany) return tooMany;
    const form = await request.formData();
    const tried = (form.get('code') || '').toString();
    let ok = false;
    // On retient QUEL code a répondu, pas seulement qu'un code a répondu : c'est
    // le nom qui s'inscrira en face d'une coupure de module dans config_audit.
    let opId = '';
    if (env.DB && tried) {
      try {
        const rows = await env.DB.prepare('SELECT id, salt, hash FROM operators').all();
        for (const r of (rows.results || [])) {
          if (await verifyPassword(tried, r.salt, r.hash)) { ok = true; opId = r.id || ''; break; }
        }
      } catch (_) { /* table missing / db error → treated as no match */ }
    }
    if (ok) {
      await limitClear(request, env, 'op');
      const op = await operatorToken(authSecret);
      const headers = new Headers({ Location: '/kiwi-admin.html' });
      headers.append('Set-Cookie', `${OP_COOKIE}=${op}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`);
      if (opId) {
        const idTok = await operatorIdToken(authSecret, opId);
        headers.append('Set-Cookie', `${OPID_COOKIE}=${idTok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`);
      }
      return new Response(null, { status: 303, headers });
    }
    await limitFail(request, env, 'op');
    return htmlResponse(authPage({ allowStaff: !!(authSecret && env.DB), operatorError: true }));
  }

  // Locked → show the account screen. If we got here because a signed session
  // pointed at a deleted/suspended account, clear that dead cookie so the browser
  // stops replaying it, and answer API callers with JSON instead of a login page.
  const lockHeaders = { 'Cache-Control': 'no-store' };
  if (sessionRevoked) lockHeaders['Set-Cookie'] = clearSessionCookie();
  if (sessionRevoked && isApi) {
    return new Response(JSON.stringify({ error: 'account-revoked' }), {
      status: 401,
      headers: { ...lockHeaders, 'Content-Type': 'application/json' },
    });
  }
  return new Response(authPage({ allowStaff: !!(authSecret && env.DB), revoked: sessionRevoked }), {
    status: 401,
    headers: { ...lockHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/* Apply baseline response hardening to every route, including Pages Functions
 * reached through next(). SAMEORIGIN preserves the intentional same-site
 * iframes in the business plan while blocking third-party clickjacking. A full
 * CSP needs the inline-heavy app to be migrated first; pretending otherwise
 * would either break the product or require unsafe-inline everywhere. */
function secureResponse(response) {
  if (!response) return response;
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function onRequest(context) {
  return secureResponse(await routeRequest(context));
}

function htmlResponse(body) {
  return new Response(body, {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Login / signup screen. /assets/* is explicitly public above, so the opt-in
// Vexel layer and its two cropped wordmarks can load while the gate is closed;
// the complete legacy palette remains inlined as the no-skin fallback. Tab pill uses the
// signature spring easing. Vertical centering uses `margin: auto` inside a
// flex column so the card centers when it fits and lets the body scroll when
// the "Créer un compte" form pushes it past the viewport (fixes the previous
// clipping where the top of the card was cut off on shorter windows). Client
// JS posts JSON to /auth/* and reloads on success; no innerHTML, no eval.
function authPage(opts) {
  const staffError = opts && opts.staffError;
  const allowStaff = opts && opts.allowStaff;
  const operatorError = opts && opts.operatorError;
  const revoked = opts && opts.revoked;
  // Operator prompt — no visible affordance. Revealed only by a long-press on the
  // wordmark (see the script below), or shown pre-open when a code was rejected.
  const operatorBlock = `
    <form class="staff op" id="op-form" method="POST" action="${OPERATOR_PATH}"${operatorError ? '' : ' hidden'}>
      ${operatorError ? `<p class="err staff-err" role="alert">Code opérateur incorrect.</p>` : ''}
      <div class="staff-row">
        <input name="code" type="password" inputmode="numeric" autocomplete="off" placeholder="Code opérateur" aria-label="Code opérateur" />
        <button type="submit">Entrer</button>
      </div>
    </form>`;
  const staffBlock = allowStaff ? `
    <button type="button" class="staff-link" id="staff-toggle">Accès équipe</button>
    <form class="staff" id="staff-form" method="POST" action="${UNLOCK_PATH}"${staffError ? '' : ' hidden'}>
      ${staffError ? `<p class="err staff-err" role="alert">Email ou code personnel incorrect.</p>` : ''}
      <div class="staff-row">
        <input name="email" type="email" inputmode="email" autocomplete="username" placeholder="Email employé" aria-label="Email employé" required />
        <input name="pin" type="password" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="current-password" placeholder="Code personnel · 4 chiffres" aria-label="Code personnel à 4 chiffres" required />
        <button type="submit">Entrer</button>
      </div>
    </form>` : '';

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<title>Kiwi · Votre compte</title>
<style>
  :root {
    --atlas:#0B6E4F; --riad:#053B2C; --mint:#7DF2B0;
    /* --paper is the brand's cream — must stay CREAM in both themes so the
       wordmark's "on-dark" variant (paper text on dark surface) still reads.
       --bg is the page background token, which is what actually flips. */
    --paper:#F7F5F0; --ink:#0A0F0D;
    --bg:#F7F5F0;
    --surface:#ffffff; --line:#e6e2d8; --muted:#6c766e;
    --field:#faf8f2; --field-focus:#ffffff;
    --danger:#b0402f;
    --sans: "Inter Tight", -apple-system, BlinkMacSystemFont, "SF Pro Display",
            "Segoe UI Variable", "Segoe UI", Inter, Roboto, sans-serif;
    --serif: "Instrument Serif", "New York", ui-serif, Georgia, Cambria, serif;
  }

    /* Emphasis is roman. <em>/<i>/<cite> default to italic in every browser, and a
       sheared sans at UI sizes reads as a rendering fault rather than as emphasis —
       the colour and face already set on each em rule carry the emphasis instead.
       Italics that DEPICT something (icing piped on a cake, an imitated masthead)
       set font-style on their own class, which outranks this. */
    em, i, cite, dfn, var { font-style: normal; }
    
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  html, body { margin: 0; }
  /* Vertical layout: min-height fills viewport, padding gives breathing room,
     margin:auto on the card centers when it fits and lets the body scroll when
     the signup form is taller than the viewport (the previous "top of card is
     cut off" bug came from align-items:center clipping the overflow). */
  body {
    min-height: 100vh;
    padding: 40px 20px;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(1200px 720px at 50% -180px, rgba(125,242,176,.22), transparent 62%),
      radial-gradient(900px 560px at 92% 108%, rgba(11,110,79,.10), transparent 56%),
      var(--bg);
    color: var(--ink);
    font: 15px/1.5 var(--sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .card {
    width: 100%;
    max-width: 440px;
    margin: auto;                 /* centers when short, scrolls when tall */
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 24px;
    padding: 40px 36px 30px;
    box-shadow:
      0 40px 80px -34px rgba(5,59,44,.34),
      0 8px 24px -14px rgba(5,59,44,.20),
      0 1px 0 rgba(255,255,255,.6) inset;
  }
  /* Real Kiwi wordmark — lowercase "kiwi" Inter Tight 700 + mint accent dot.
     Per brand.html §01: no pictogram, no kiwi leaf. Long-press this to open
     the operator prompt. */
  .brand {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    font-family: var(--sans);
    font-size: 34px;
    font-weight: 700;
    letter-spacing: -0.06em;
    color: var(--atlas);
    line-height: 1;
    -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;
    cursor: default;
  }
  .brand i {
    width: 9px; height: 9px;
    background: var(--mint);
    border-radius: 50%;
    display: inline-block;
    translate: 0 -1px;
    box-shadow: 0 0 0 4px rgba(125,242,176,.22);
  }
  .brand .vx-entry-logo { display: none; }
  .head { margin: 26px 0 24px; }
  h1 {
    font-size: 26px;
    font-weight: 640;
    letter-spacing: -0.025em;
    line-height: 1.15;
    margin: 0 0 6px;
    color: var(--ink);
  }
  h1 em {
    font-family: var(--serif);
    font-weight: 400;
    letter-spacing: -0.01em;
    color: var(--atlas);
  }
  .sub {
    margin: 0;
    font-size: 14.5px;
    color: var(--muted);
    line-height: 1.55;
  }
  .revoked {
    margin: 0 0 20px;
    padding: 12px 14px;
    background: rgba(176,64,47,.08);
    border: 1px solid rgba(176,64,47,.22);
    border-radius: 10px;
    color: var(--danger);
    font-size: 13.5px;
    font-weight: 540;
    text-align: left;
  }
  .tabs {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: var(--field);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 4px;
    margin: 0 0 22px;
  }
  .tab {
    position: relative;
    z-index: 1;
    border: 0;
    background: transparent;
    font: inherit;
    font-weight: 600;
    padding: 10px 8px;
    border-radius: 9px;
    cursor: pointer;
    color: var(--muted);
    transition: color .2s;
  }
  .tab[aria-selected="true"] { color: var(--riad); }
  .pill {
    position: absolute;
    z-index: 0;
    top: 4px; bottom: 4px; left: 4px;
    width: calc(50% - 4px);
    background: var(--surface);
    border-radius: 9px;
    box-shadow: 0 2px 10px rgba(5,59,44,.14), 0 0 0 1px rgba(11,110,79,.08);
    transition: transform .31s cubic-bezier(0.34, 1.45, 0.5, 1);
  }
  .tabs[data-mode="signup"] .pill { transform: translateX(100%); }
  form.pane {
    display: flex;
    flex-direction: column;
    gap: 14px;
    text-align: left;
    margin: 0;
  }
  form.pane.hidden { display: none; }
  label {
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--riad);
    text-transform: uppercase;
  }
  input {
    font: inherit;
    font-size: 15px;
    text-transform: none;
    letter-spacing: normal;
    padding: 13px 15px;
    border: 1.5px solid var(--line);
    border-radius: 11px;
    background: var(--field);
    color: var(--ink);
    transition: border-color .18s, box-shadow .18s, background .18s;
  }
  input::placeholder { color: #a7b0aa; }
  input:hover { border-color: #d5cec1; }
  input:focus {
    outline: none;
    background: var(--field-focus);
    border-color: var(--atlas);
    box-shadow: 0 0 0 4px rgba(11,110,79,.14);
  }
  .hint {
    margin: -6px 0 0;
    font-size: 12.5px;
    color: var(--muted);
  }
  .err {
    margin: 4px 0 0;
    color: var(--danger);
    font-weight: 540;
    font-size: 13px;
    min-height: 1.1em;
  }
  .go {
    margin-top: 8px;
    font: inherit;
    font-size: 15px;
    font-weight: 640;
    letter-spacing: -0.005em;
    color: #eafff4;
    cursor: pointer;
    padding: 14px 18px;
    border: 0;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--atlas), var(--riad));
    box-shadow:
      0 12px 26px -14px rgba(11,110,79,.85),
      0 2px 4px rgba(5,59,44,.14),
      inset 0 1px 0 rgba(255,255,255,.14);
    transition: transform .12s, box-shadow .2s, filter .2s;
  }
  .go:hover { transform: translateY(-1px); filter: brightness(1.05); }
  .go:active { transform: translateY(0); }
  .go:disabled { opacity: .55; cursor: default; transform: none; filter: none; }
  .staff-link {
    margin: 20px auto 0;
    display: block;
    background: none;
    border: 0;
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: rgba(93,107,99,.35);
    text-decoration-thickness: 1px;
    transition: color .15s, text-decoration-color .15s;
  }
  .staff-link:hover { color: var(--riad); text-decoration-color: rgba(5,59,44,.6); }
  .op { margin-top: 14px; }
  .staff { margin: 14px 0 0; }
  .staff-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .staff input { flex: 1; padding: 11px 13px; font-size: 14px; }
  .staff input[name="email"] { flex-basis: 100%; }
  .staff button {
    border: 0;
    border-radius: 10px;
    padding: 0 18px;
    background: var(--riad);
    color: #eafff4;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s;
  }
  .staff button:hover { background: #044030; }
  .staff-err { text-align: left; margin: 0 0 8px; }
  .foot {
    margin: 26px -10px 0;
    padding-top: 20px;
    border-top: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font-size: 11.5px;
    color: var(--muted);
    letter-spacing: 0.02em;
    flex-wrap: wrap;
  }
  .foot .dot-sep {
    width: 3px; height: 3px;
    background: currentColor;
    border-radius: 50%;
    opacity: .45;
  }
  @media (max-width: 460px) {
    body { padding: 24px 16px; }
    .card { padding: 32px 22px 24px; border-radius: 18px; }
    h1 { font-size: 22px; }
    .brand { font-size: 30px; }
  }
  @media (prefers-color-scheme: dark) {
    :root {
      /* Only --bg / --surface / structural tokens flip — --paper stays cream so
         the wordmark's on-dark variant (paper text on dark card) still reads. */
      --bg:#0c1310;
      --ink:#e8efe9;
      --surface:#141b17;
      --line:#26302b;
      --muted:#93a89c;
      --field:#0e1613;
      --field-focus:#131d18;
    }
    body {
      background:
        radial-gradient(1200px 720px at 50% -180px, rgba(125,242,176,.14), transparent 62%),
        radial-gradient(900px 560px at 92% 108%, rgba(11,110,79,.10), transparent 56%),
        var(--bg);
    }
    /* Wordmark in dark = paper cream on dark surface — matches brand.html §01
       "Inverse" logo variant. */
    .brand { color: var(--paper); }
    .brand i { box-shadow: 0 0 0 4px rgba(125,242,176,.15); }
    h1 { color: var(--paper); }
    h1 em { color: var(--mint); }
    .card {
      box-shadow:
        0 40px 80px -34px rgba(0,0,0,.55),
        0 8px 24px -14px rgba(0,0,0,.40);
    }
    /* Liquid Glass — DARK MODE ONLY. Here the card floats over the dark green-tinted
       gradient, so real refraction reads beautifully. Light mode keeps its crisp
       white card (glass would wash out on cream). Fill stays high (70%) so the login
       form remains a legible reading/input surface. Falls back to the opaque dark
       card wherever url() backdrop filters aren't supported. */
    @supports ((-webkit-backdrop-filter: url("#k")) or (backdrop-filter: url("#k"))) {
      .card {
        background: color-mix(in srgb, var(--surface) 70%, transparent);
        border-color: rgba(255,255,255,.10);
        -webkit-backdrop-filter: url(#kiwi-lg) blur(22px) saturate(1.5);
                backdrop-filter: url(#kiwi-lg) blur(22px) saturate(1.5);
      }
    }
    .tab[aria-selected="true"] { color: var(--paper); }
    .pill { background: #1c2622; box-shadow: 0 2px 10px rgba(0,0,0,.5), 0 0 0 1px rgba(125,242,176,.08); }
    input::placeholder { color: #6a7770; }
    .err, .staff-err { color: #ff9d8a; }
    .revoked { background: rgba(255,157,138,.08); border-color: rgba(255,157,138,.28); color: #ff9d8a; }
    .staff button { background: var(--atlas); }
    .staff button:hover { background: #0e8560; }
  }
</style>
<link rel="stylesheet" href="/assets/design-vexel.css" />
<script src="/assets/design-vexel.js"></script>
</head>
<body class="vx-auth-page">
  <script>window.KiwiDesignVexel && window.KiwiDesignVexel.prime();</script>
  <!-- Liquid Glass displacement filter stays inline so the legacy dark fallback
       remains autonomous even if an optional skin asset fails to load. -->
  <svg width="0" height="0" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">
    <filter id="kiwi-lg" x="-35%" y="-35%" width="170%" height="170%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.006 0.011" numOctaves="2" seed="12" result="n"/>
      <feGaussianBlur in="n" stdDeviation="1.4" result="nb"/>
      <feDisplacementMap in="SourceGraphic" in2="nb" scale="46" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </svg>
  <main class="card vx-auth-card">
    <div class="brand" id="brand-mark" aria-label="Kiwi">
      <span class="auth-brand-legacy">kiwi<i aria-hidden="true"></i></span>
      <span class="vx-entry-logo" aria-hidden="true">
        <img class="brand-logo-light" src="/assets/kiwi-logo.svg" width="846" height="446" alt="" />
        <img class="brand-logo-dark" src="/assets/kiwi-logo-dark.svg" width="846" height="446" alt="" />
      </span>
    </div>
    <div class="head">
      <h1>Bienvenue <em>chez Kiwi</em>.</h1>
      <p class="sub">Votre espace commerçant, en un seul lien.</p>
    </div>
    ${revoked ? `<p class="revoked" role="alert">Votre session a été fermée. Reconnectez-vous.</p>` : ''}

    <div class="tabs" data-mode="login">
      <button type="button" class="tab" id="tab-login" aria-selected="true">Se connecter</button>
      <button type="button" class="tab" id="tab-signup" aria-selected="false">Créer un compte</button>
      <span class="pill" aria-hidden="true"></span>
    </div>

    <form class="pane" id="form-login" novalidate>
      <label>E-mail
        <input id="li-email" type="email" autocomplete="email" placeholder="vous@exemple.ma" required />
      </label>
      <label>Mot de passe
        <input id="li-pass" type="password" autocomplete="current-password" placeholder="••••••••" required />
      </label>
      <p class="err" id="li-err" role="alert"></p>
      <button class="go" type="submit">Se connecter</button>
    </form>

    <form class="pane hidden" id="form-signup" novalidate>
      <label>Nom
        <input id="su-name" type="text" autocomplete="name" placeholder="Prénom Nom" required />
      </label>
      <label>Établissement
        <input id="su-biz" type="text" autocomplete="organization" placeholder="Café Atlas" />
      </label>
      <label>E-mail
        <input id="su-email" type="email" autocomplete="email" placeholder="vous@exemple.ma" required />
      </label>
      <label>Mot de passe
        <input id="su-pass" type="password" autocomplete="new-password" placeholder="8 caractères min." minlength="8" required />
      </label>
      <p class="hint">Au moins 8 caractères.</p>
      <p class="err" id="su-err" role="alert"></p>
      <button class="go" type="submit">Créer mon compte</button>
    </form>
    ${staffBlock}
    ${operatorBlock}
    <div class="foot">
      <span>Données chiffrées</span>
      <span class="dot-sep" aria-hidden="true"></span>
      <span>Jamais revendues</span>
      <span class="dot-sep" aria-hidden="true"></span>
      <span>Sans engagement</span>
    </div>
  </main>
<script>
(function(){
  var tabs = document.querySelector('.tabs');
  var tLogin = document.getElementById('tab-login');
  var tSignup = document.getElementById('tab-signup');
  var fLogin = document.getElementById('form-login');
  var fSignup = document.getElementById('form-signup');
  function setMode(m){
    var login = m === 'login';
    tabs.setAttribute('data-mode', m);
    fLogin.classList.toggle('hidden', !login);
    fSignup.classList.toggle('hidden', login);
    tLogin.setAttribute('aria-selected', login ? 'true' : 'false');
    tSignup.setAttribute('aria-selected', login ? 'false' : 'true');
  }
  tLogin.addEventListener('click', function(){ setMode('login'); });
  tSignup.addEventListener('click', function(){ setMode('signup'); });

  var MSG = {
    email: 'Adresse e-mail invalide.',
    name: 'Indiquez votre nom.',
    weak: 'Mot de passe : 8 caractères minimum.',
    exists: 'Cet e-mail a déjà un compte — connectez-vous.',
    'bad-creds': 'E-mail ou mot de passe incorrect.',
    'bad-json': 'Requête invalide.',
    'not-configured': 'Service momentanément indisponible.'
  };
  function fail(code){ return MSG[code] || 'Une erreur est survenue. Réessayez.'; }
  function val(id){ var el = document.getElementById(id); return el ? el.value : ''; }

  // On success we go straight INTO the product, never a bare location.reload()
  // (users land on the auth screen at "/", so a reload dropped them back on the
  // marketing landing page instead of the dashboard). Login → the dashboard
  // (their PIN lock). Signup → the dashboard with ?onboarding=1, which forces
  // the setup wizard to open (assets/onboarding.js) even over any stale demo
  // state — a brand-new merchant has no PIN yet and must reach setup, not a
  // PIN prompt for a code they never chose.
  function post(u, data, errEl, btn, dest){
    errEl.textContent = '';
    btn.disabled = true;
    fetch(u, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) })
      .then(function(r){
        if (r.ok){ location.assign(dest || '/dashboard'); return; }
        return r.json().then(function(j){ errEl.textContent = fail(j && j.error); btn.disabled = false; },
                             function(){ errEl.textContent = fail(); btn.disabled = false; });
      })
      .catch(function(){ errEl.textContent = 'Erreur réseau. Réessayez.'; btn.disabled = false; });
  }

  fLogin.addEventListener('submit', function(e){
    e.preventDefault();
    post('/auth/login', { email: val('li-email'), password: val('li-pass') },
         document.getElementById('li-err'), fLogin.querySelector('.go'), '/dashboard');
  });
  fSignup.addEventListener('submit', function(e){
    e.preventDefault();
    post('/auth/signup', { name: val('su-name'), business: val('su-biz'), email: val('su-email'), password: val('su-pass') },
         document.getElementById('su-err'), fSignup.querySelector('.go'), '/dashboard?onboarding=1');
  });

  var staffToggle = document.getElementById('staff-toggle');
  var staffForm = document.getElementById('staff-form');
  if (staffToggle && staffForm){
    staffToggle.addEventListener('click', function(){
      staffForm.hidden = !staffForm.hidden;
      if (!staffForm.hidden){ var i = staffForm.querySelector('input'); if (i) i.focus(); }
    });
  }

  // Hidden operator entry — long-press (~1.4s) the wordmark to reveal the code
  // prompt. No visible affordance; clients never stumble onto it.
  var mark = document.getElementById('brand-mark');
  var opForm = document.getElementById('op-form');
  if (mark && opForm){
    var hold = null;
    var reveal = function(){ opForm.hidden = false; var i = opForm.querySelector('input'); if (i) i.focus(); };
    var start = function(){ cancel(); hold = setTimeout(reveal, 1400); };
    var cancel = function(){ if (hold){ clearTimeout(hold); hold = null; } };
    mark.addEventListener('mousedown', start);
    mark.addEventListener('touchstart', start, { passive: true });
    ['mouseup','mouseleave','touchend','touchcancel'].forEach(function(ev){ mark.addEventListener(ev, cancel); });
  }
})();
</script>
</body>
</html>`;
}
