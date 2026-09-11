// Kiwi — Enregistrement des jetons de notification push (iOS, Android, Web)
//
// Un jeton est un secret matériel d'un appareil client :
// - Jamais journalisé dans console.log ou err-reporter
// - Jamais renvoyé par un GET (GET renvoie 405 Method Not Allowed)
// - Protégé par l'authentification de l'établissement (tenantFor strict)
//
// Résilience D1 : si la migration n'a pas encore tourné en production,
// la route répond honnêtement en 503 (push-tokens-unavailable) plutôt
// qu'un crash 500 ou un faux 200.

import { tenantFor } from '../_private.js';
import { isTillFor, json } from '../../auth/_lib.js';

const VALID_PLATFORMS = new Set(['ios', 'android', 'web']);
const VALID_ROLES = new Set(['caisse', 'cuisine', 'equipe', 'dashboard', 'all']);
const TOKEN_RE = /^[A-Za-z0-9_\-:./+=]{16,512}$/;

export async function onRequestGet() {
  return json({ error: 'method-not-allowed', message: 'La lecture des jetons push n\'est pas autorisée.' }, 405);
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) {
    return json({ error: 'db-unavailable', message: 'Base de données indisponible.' }, 503);
  }

  let body = null;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: 'invalid-json', message: 'Corps de requête JSON invalide.' }, 400);
  }

  if (!body || typeof body !== 'object') {
    return json({ error: 'invalid-body', message: 'Requête invalide.' }, 400);
  }

  const requestedMerchant = typeof body.merchant === 'string' ? body.merchant.trim().toLowerCase() : '';
  if (!requestedMerchant) {
    return json({ error: 'missing-merchant', message: 'Identifiant d\'établissement manquant.' }, 400);
  }

  // Vérification stricte des droits sur l'établissement demandé
  const merchant = await tenantFor(request, env, requestedMerchant, { strict: true });
  if (!merchant) {
    return json({ error: 'unauthorized', message: 'Accès non autorisé à cet établissement.' }, 401);
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token || !TOKEN_RE.test(token)) {
    return json({ error: 'invalid-token', message: 'Format de jeton invalide.' }, 400);
  }

  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : 'register';
  const pairedTill = await isTillFor(request, env, merchant);

  if (action === 'unregister') {
    try {
      // The stored role is authoritative. Trusting body.role here would let a
      // till call a kitchen token "caisse" and delete it. A role-qualified
      // DELETE is atomic, keeps repeated unregister calls harmless, and reveals
      // no distinction between an unknown token and a forbidden-role token.
      const deletion = pairedTill
        ? await env.DB.prepare('DELETE FROM push_tokens WHERE merchant = ? AND token = ? AND role = ?')
          .bind(merchant, token, 'caisse').run()
        : await env.DB.prepare('DELETE FROM push_tokens WHERE merchant = ? AND token = ?')
          .bind(merchant, token).run();
      return json({ ok: true, unregistered: Number(deletion && deletion.meta && deletion.meta.changes || 0) > 0 });
    } catch (err) {
      const msg = String(err && err.message || '');
      if (msg.includes('no such table')) {
        return json({
          error: 'push-tokens-unavailable',
          message: 'Le stockage des notifications push n\'est pas encore provisionné sur cette base.'
        }, 503);
      }
      return json({ error: 'db-error', message: 'Erreur lors de la suppression du jeton.' }, 500);
    }
  }

  const platform = typeof body.platform === 'string' ? body.platform.trim().toLowerCase() : '';
  if (!VALID_PLATFORMS.has(platform)) {
    return json({ error: 'invalid-platform', message: 'Plateforme invalide (ios, android ou web attendu).' }, 400);
  }

  const role = typeof body.role === 'string' && VALID_ROLES.has(body.role.toLowerCase().trim())
    ? body.role.toLowerCase().trim()
    : 'caisse';

  // A paired counter may subscribe only to the notifications it operates.
  // Broader targets (kitchen, team, dashboard, all) require an owner/operator
  // session; otherwise one till cookie could turn an arbitrary device into a
  // cross-role notification receiver for the whole establishment.
  if (pairedTill && role !== 'caisse') {
    return json({ error: 'forbidden-role', message: 'Une caisse appairée ne peut enregistrer que les notifications de caisse.' }, 403);
  }

  const employeeId = !pairedTill && typeof body.employeeId === 'string' ? body.employeeId.slice(0, 64).trim() : null;
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 128).trim() : null;
  const now = Date.now();

  try {
    await env.DB.prepare(`
      INSERT INTO push_tokens (merchant, token, role, employee_id, platform, device_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (merchant, token) DO UPDATE SET
        role = excluded.role,
        employee_id = excluded.employee_id,
        platform = excluded.platform,
        device_id = excluded.device_id,
        updated_at = excluded.updated_at
    `).bind(merchant, token, role, employeeId, platform, deviceId, now, now).run();

    return json({ ok: true });
  } catch (err) {
    const msg = String(err && err.message || '');
    if (msg.includes('no such table')) {
      return json({
        error: 'push-tokens-unavailable',
        message: 'Le stockage des notifications push n\'est pas encore provisionné sur cette base.'
      }, 503);
    }
    // Erreur de base de données : ne JAMAIS inclure ni journaliser le jeton
    return json({ error: 'db-error', message: 'Erreur lors de l\'enregistrement du jeton.' }, 500);
  }
}
