/* Bounded fallback export. Cancellation covers both transport and body reads.
 * A history longer than `limit` events is exported in parts: the file carries
 * the events read so far plus the cursor to continue from (`from` on the next
 * call), instead of refusing the whole export. */
import { deadlineFetch } from './request-deadline.mjs';
export async function exportAudit({ book, clientId, current, progress, controller, download, limit = 10000, from = null }) {
  const signal = controller.signal, events = [];
  let next = from, partial = null;
  do {
    if (signal.aborted || !current()) return;
    const url = '/api/clients?merchant=' + encodeURIComponent(book) + '&auditClient=' + encodeURIComponent(clientId)
      + (next ? '&auditBefore=' + encodeURIComponent(next) : '');
    const response = await deadlineFetch(url, { credentials: 'include', cache: 'no-store' }, 15000, controller);
    if (!response.ok) throw new Error('audit-unavailable');
    const page = await response.json();
    if (signal.aborted || !current()) return;
    if (!Array.isArray(page.events)) throw new Error('audit-limit');
    if (events.length + page.events.length > limit) {
      if (!events.length) throw new Error('audit-limit');
      partial = next || '';
      break;
    }
    events.push(...page.events);
    progress(events.length);
    if (page.next && page.next === next) throw new Error('audit-cursor');
    next = page.next;
  } while (next);
  if (signal.aborted || !current()) return;
  const body = partial === null ? { clientId, events } : { clientId, events, partial: true, continuation: partial };
  download(new Blob([JSON.stringify(body)], { type: 'application/json' }));
  return partial === null ? { partial: false } : { partial: true, continuation: partial, count: events.length };
}
