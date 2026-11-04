/* DOM-free economat transport. Individual HTTP attempts; durable submissions live in the outbox. */
import { cached } from './hotel-economat-outbox.js?v=5';
import { deadlineFetch } from './request-deadline.mjs';

export function getJson(url) { return cached(url, () => readJson(url)); }
async function readJson(url) {
  var r = await deadlineFetch(url, { credentials:'same-origin', cache:'no-store' });
  var body = {}; try { body = await r.json(); } catch (_) { if (_.code === 'request-timeout') throw _; if (r.ok) throw Object.assign(new Error('invalid-response'), { code: 'invalid-response', uncertain: true }); }
  if (!r.ok) { var e = new Error(body.error || ('http-' + r.status)); e.status = r.status; e.body = body; throw e; }
  return body;
}
export async function post(body, merchant) {
  var r = await deadlineFetch('/api/inventory/internal-requests', { method:'POST', credentials:'same-origin', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(Object.assign({ merchant:merchant }, body)) });
  var out = {}; try { out = await r.json(); } catch (_) { if (_.code === 'request-timeout') throw _; if (r.ok) throw Object.assign(new Error('invalid-response'), { code: 'invalid-response', uncertain: true }); }
  if (!r.ok) { var e = new Error(out.error || ('http-' + r.status)); e.status = r.status; e.body = out; throw e; }
  return out;
}


export { discard, enqueueRequest, replay, snapshot, subscribe } from './hotel-economat-outbox.js?v=5';
