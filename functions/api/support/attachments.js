import { json } from '../../auth/_lib.js';
import { tenantFor } from '../_private.js';
import { ensureSupport, cleanText } from '../_support.js';

const TYPES = {
  'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf',
  'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov',
};
const MAX = 24 * 1024 * 1024;

export function hasSignature(mime, buffer) {
  const b = new Uint8Array(buffer);
  const ascii = (at, value) => value.split('').every((c, i) => b[at + i] === c.charCodeAt(0));
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/png') return b[0] === 0x89 && ascii(1, 'PNG') && b[4] === 0x0d && b[5] === 0x0a;
  if (mime === 'image/webp') return ascii(0, 'RIFF') && ascii(8, 'WEBP');
  if (mime === 'application/pdf') return ascii(0, '%PDF');
  if (mime === 'video/webm') return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
  if (mime === 'video/mp4' || mime === 'video/quicktime') return ascii(4, 'ftyp');
  return false;
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error:'not-configured' },503);
  if (!env.MEDIA) return json({ error:'no-media' },503);
  const url = new URL(request.url);
  const ticketId = cleanText(url.searchParams.get('ticket'),96);
  let merchant = cleanText(url.searchParams.get('merchant'),64);
  merchant = await tenantFor(request,env,merchant,{strict:true});
  if (!merchant || !ticketId) return json({ error:'forbidden' },403);
  await ensureSupport(env);
  const ticket = await env.DB.prepare(`SELECT id FROM support_tickets WHERE id=? AND merchant=?`).bind(ticketId,merchant).first();
  if (!ticket) return json({ error:'ticket-not-found' },404);
  const mime = (request.headers.get('Content-Type') || '').split(';')[0].toLowerCase();
  const ext = TYPES[mime]; if (!ext) return json({ error:'bad-type', accepted:Object.keys(TYPES) },415);
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX) return json({ error:'too-large', max:MAX },413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX) return json({ error:bytes.byteLength?'too-large':'empty', max:MAX }, bytes.byteLength?413:400);
  if (!hasSignature(mime, bytes)) return json({ error:'content-mismatch' },415);
  const id='attachment-'+crypto.randomUUID();
  const key=`support/${merchant}/${ticketId}/${crypto.randomUUID()}.${ext}`;
  const name=cleanText(url.searchParams.get('name') || `piece-jointe.${ext}`,160);
  await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:mime,cacheControl:'private, no-store'}});
  try {
    await env.DB.prepare(`INSERT INTO support_attachments (id,ticket_id,merchant,object_key,name,mime,size,created_ts) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(id,ticketId,merchant,key,name,mime,bytes.byteLength,Date.now()).run();
  } catch (e) {
    try { await env.MEDIA.delete(key); } catch (_) {}
    throw e;
  }
  return json({ok:true,attachment:{id,name,mime,size:bytes.byteLength}});
}
