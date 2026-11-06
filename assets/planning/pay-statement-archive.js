/* Client of /api/pay-statements: advances per staff member and period, and the
 * numbered, immutable pay statements (ruling 5, 4 Nov 2026). Every call goes
 * through deadlineFetch. A write whose answer cannot be read is UNCERTAIN, not
 * a success: the caller keeps the same requestId so a retry replays on the
 * server instead of issuing a second number. */
import { deadlineFetch } from '../request-deadline.mjs';

const fail = (code, extra) => Object.assign(new Error(code), { code }, extra || {});

export function createArchive(merchant, transport = deadlineFetch) {
  const slug = String(merchant || '');
  if (!slug) return null;
  const headers = { Accept: 'application/json' };
  async function read(query) {
    let res;
    try { res = await transport('/api/pay-statements?merchant=' + encodeURIComponent(slug) + query, { credentials: 'same-origin', cache: 'no-store', headers }); }
    catch (_) { throw fail('offline'); }
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    if (!res.ok || !data) throw fail((data && data.error) || 'unavailable', { status: res.status });
    return data;
  }
  async function write(body) {
    let res;
    try {
      res = await transport('/api/pay-statements', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: slug, ...body }) });
    } catch (_) { throw fail('uncertain'); }
    let data = null, unreadable = false;
    try { data = await res.json(); } catch (_) { unreadable = true; }
    if (res.ok && (unreadable || !data)) throw fail('uncertain');
    if (!res.ok) throw fail((data && data.error) || 'unavailable', { status: res.status });
    return data;
  }
  const period = (p) => '&periodStart=' + encodeURIComponent(p.days[0]) + '&periodEnd=' + encodeURIComponent(p.days[p.days.length - 1]);
  const bounds = (p) => ({ periodStart: p.days[0], periodEnd: p.days[p.days.length - 1] });
  return {
    /* Follows the server's cursor until the whole period is read: a long chain of
     * corrections must never push the current statement out of the list. */
    forPeriod: async (p) => {
      let data = await read(period(p)), statements = data.statements || [];
      for (let pages = 1; data.nextCursor && pages < 100; pages++) {
        const next = await read(period(p) + '&after=' + encodeURIComponent(data.nextCursor));
        statements = statements.concat(next.statements || []);
        data = { ...next, advances: data.advances };
      }
      return { ...data, statements, nextCursor: null };
    },
    /* The merchant-wide history, newest first, one page at a time. */
    list: (before) => read(before ? '&before=' + encodeURIComponent(before) : ''),
    get: async (id) => (await read('&id=' + encodeURIComponent(id))).statement,
    saveAdvances: (p, advances) => write({ action: 'advances', ...bounds(p), advances }),
    issue: (p, rows, opts = {}) => write({ action: 'issue', ...bounds(p), rows, ...opts }),
  };
}

/* The same request must carry the same id on a retry (so the server replays it)
 * and a different one when the amounts or the statement replaced change. */
export function requestIdFor(period, rows, replacesId = '') {
  const text = [period.days[0], period.days[period.days.length - 1], replacesId, ...rows.map((r) => [r.memberId, r.memberName, r.hours, r.rateCents, r.baseCents, r.grossCents, r.advanceCents, r.netCents, r.rated ? 1 : 0].join(':'))].join('|');
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + text.charCodeAt(i), 2246822519) >>> 0;
  }
  return 'pay-' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + '-' + text.length.toString(36);
}

/* A statement as the print view wants it: the stored amounts, the server's number. */
export function rowFromStatement(s, replacesNumber = '') {
  const x = s.snapshot || {};
  return { id: s.memberId, name: s.memberName, hours: Number(x.hours) || 0, ref: s.number, replaces: replacesNumber,
    rate: x.rateCents == null ? null : x.rateCents, base: Number(x.baseCents) || 0, gross: s.grossCents,
    advance: s.advanceCents, net: s.netCents, rated: s.rated };
}
