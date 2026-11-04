/* Bounded fallback export. Cancellation covers both transport and body reads. */
import { deadlineFetch } from './request-deadline.mjs';
export async function exportAudit({ book, clientId, current, progress, controller, download, limit = 10000 }) {
  const signal = controller.signal, events = [];
  let next = null;
  do {
    if (signal.aborted || !current()) return;
    const url = '/api/clients?merchant=' + encodeURIComponent(book) + '&auditClient=' + encodeURIComponent(clientId)
      + (next ? '&auditBefore=' + encodeURIComponent(next) : '');
    const response = await deadlineFetch(url, { credentials: 'include', cache: 'no-store' }, 15000, controller);
    if (!response.ok) throw new Error('audit-unavailable');
    const page = await response.json();
    if (signal.aborted || !current()) return;
    if (!Array.isArray(page.events) || events.length + page.events.length > limit) throw new Error('audit-limit');
    events.push(...page.events);
    progress(events.length);
    if (page.next && page.next === next) throw new Error('audit-cursor');
    next = page.next;
  } while (next);
  if (!signal.aborted && current()) download(new Blob([JSON.stringify({ clientId, events })], { type: 'application/json' }));
}
