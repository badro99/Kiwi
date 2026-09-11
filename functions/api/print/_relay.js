/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · RELAIS D'IMPRESSION — helpers partagés par /api/print/bridges et
 * /api/print/jobs.
 * ---------------------------------------------------------------------------
 * Pourquoi ce relais existe. Un navigateur ne peut pas ouvrir une socket brute
 * vers une imprimante à 192.168.x.x:9100 ; sur un ordinateur le Kiwi Printer
 * Bridge (127.0.0.1:9110) le fait à sa place. Sur un iPad il n'y a ni pont
 * local, ni Web Bluetooth, ni WebUSB : la seule façon d'imprimer est de
 * DÉPOSER le ticket ici et de laisser le pont du comptoir venir le chercher
 * (sortant uniquement — aucun certificat, aucune IP de PC à taper, aucun
 * port ouvert sur le réseau de la boutique). C'est le modèle CloudPRNT.
 *
 * Identité :
 *   · la CAISSE (dépose, consulte) est reconnue comme partout ailleurs — session
 *     propriétaire ou cookie de caisse appairée — via tenantFor() ;
 *   · le PONT (récupère, acquitte) porte un jeton `Authorization: Bearer kpb_…`
 *     remis une seule fois à l'appairage et stocké ici uniquement haché.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { json } from '../../auth/_lib.js';

export const BRIDGE_ONLINE_MS = 45 * 1000;   // un pont vu depuis moins de 45 s est « en ligne »
export const JOB_TTL_MS = 10 * 60 * 1000;    // un ticket non imprimé en 10 min est périmé
export const CODE_TTL_MS = 15 * 60 * 1000;   // un code d'appairage vit 15 min
export const MAX_DATA_B64 = 700 * 1024;       // ~512 Ko d'ESC/POS — un logo bitmap tient largement
export const CLAIM_BATCH = 5;

const enc = new TextEncoder();

export function now() { return Date.now(); }

export function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(String(s)));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function code6() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(100000 + (a[0] % 900000));
}

/* Le jeton du pont. `kpb_` + 32 octets aléatoires : reconnaissable dans un log
 * (pour être caviardé) et impossible à deviner. Seul son sha256 est en base. */
export function newBridgeToken() { return 'kpb_' + randomHex(32); }

export function bearer(request) {
  const h = String(request.headers.get('Authorization') || '');
  const m = /^Bearer\s+(kpb_[0-9a-f]{64})$/i.exec(h.trim());
  return m ? m[1] : '';
}

/* Retrouve le pont qui porte ce jeton. Renvoie la ligne (id, merchant, …),
 * null — jeton absent, inconnu ou révoqué — ou `undefined` quand la BASE n'a
 * pas pu répondre (table absente, panne). La distinction compte : un 401 fait
 * oublier son jeton au pont, une panne passagère ne doit jamais le provoquer.
 * Ne touche pas last_seen : c'est l'appelant qui décide (un poll le fait). */
export async function bridgeFromRequest(request, env) {
  const tok = bearer(request);
  if (!tok || !env || !env.DB) return null;
  try {
    const h = await sha256Hex(tok);
    const row = await env.DB.prepare(
      'SELECT id, merchant, name, platform, version, revoked_ts FROM print_bridges WHERE token_hash = ?'
    ).bind(h).first();
    if (!row || row.revoked_ts) return null;
    return row;
  } catch (_) { return undefined; }
}

export function dbDown(request) {
  return relayJson({ ok: false, error: 'relay-unavailable' }, 503, request);
}

/* Le pont fait du sortant vers kiwi-os.com depuis le comptoir ; ce n'est pas une
 * page, donc pas de cookie de passe — l'absence de session ne doit jamais le
 * bloquer. Les routes répondent en JSON pur ; ce helper garde les mêmes
 * en-têtes que json() mais ajoute les CORS pour le pont local (127.0.0.1:9110
 * appelle depuis son origine http://127.0.0.1:911x quand la page locale du
 * pont est utilisée). */
export function relayJson(obj, status, request) {
  const origin = request && request.headers.get('Origin') || '';
  const extra = {};
  if (/^http:\/\/127\.0\.0\.1:911\d$/.test(origin) || /^http:\/\/localhost:911\d$/.test(origin)) {
    extra['Access-Control-Allow-Origin'] = origin;
    extra['Vary'] = 'Origin';
  }
  return json(obj, status, extra);
}

/* Pas de table → la route doit dire « relais non provisionné », jamais 500 :
 * schema.sql devance toujours la base de prod (voir CLAUDE.md §3). */
export function isMissingTable(e) {
  return /no such table/i.test(String((e && e.message) || e || ''));
}

export function safeJsonParse(s, fallback) {
  try { const v = JSON.parse(s); return v == null ? fallback : v; } catch (_) { return fallback; }
}
