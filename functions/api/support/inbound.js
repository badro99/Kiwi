import { json } from '../../auth/_lib.js';
import { ensureSupport, cleanText } from '../_support.js';

/* Le webhook qui rapporte la réponse d'un client (courriel, WhatsApp).
 *
 * · Le secret se compare en temps constant, sur deux empreintes de même
 *   longueur : `!==` s'arrêtait au premier caractère faux et laissait mesurer
 *   jusqu'où un secret deviné était juste.
 * · Un fournisseur de webhook RÉESSAIE quand il n'a pas eu sa réponse. Le
 *   même message ne s'inscrit qu'une fois : par son identifiant quand
 *   l'expéditeur en donne un (`messageId`), sinon par son texte sur ce même
 *   fil dans l'heure. Un doublon répond 200 sans rien écrire ni rouvrir. */
const REPLAY_WINDOW_MS = 60 * 60 * 1000;

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function secretMatches(sent, secret) {
  const [a, b] = await Promise.all([sha256Hex('kiwi-inbound|' + String(sent || '')), sha256Hex('kiwi-inbound|' + String(secret))]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB || !env.SUPPORT_INBOUND_SECRET) return json({ error: 'not-configured' }, 503);
  if (!await secretMatches(request.headers.get('X-Kiwi-Support-Secret'), env.SUPPORT_INBOUND_SECRET)) return json({ error: 'forbidden' }, 403);
  let b; try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  await ensureSupport(env);
  const reference = cleanText(b && b.reference, 48), body = cleanText(b && b.body, 5000), channel = b && b.channel === 'whatsapp' ? 'whatsapp' : 'email';
  const messageId = cleanText(b && (b.messageId || b.message_id), 200);
  if (!reference || !body) return json({ error: 'missing-fields' }, 400);
  const ticket = await env.DB.prepare(`SELECT id FROM support_tickets WHERE reference=?`).bind(reference).first();
  if (!ticket) return json({ error: 'not-found' }, 404);
  const now = Date.now();
  const id = messageId ? 'msg-in-' + (await sha256Hex(ticket.id + '|' + messageId)).slice(0, 32) : 'msg-' + crypto.randomUUID();
  const written = await env.DB.prepare(`INSERT INTO support_messages (id,ticket_id,kind,channel,author,body,delivery,ts)
    SELECT ?,?,?,?,?,?,?,?
    WHERE NOT EXISTS (SELECT 1 FROM support_messages WHERE id=?)
      AND (? <> '' OR NOT EXISTS (SELECT 1 FROM support_messages
        WHERE ticket_id=? AND kind='client' AND channel=? AND body=? AND ts>?))`)
    .bind(id, ticket.id, 'client', channel, 'client', body, 'received', now,
      id, messageId, ticket.id, channel, body, now - REPLAY_WINDOW_MS).run();
  if (!Number(written && written.meta && written.meta.changes)) return json({ ok: true, duplicate: true });
  await env.DB.prepare(`UPDATE support_tickets SET status='open',closed_ts=NULL,updated_ts=? WHERE id=?`).bind(now, ticket.id).run();
  return json({ ok: true });
}
