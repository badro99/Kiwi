// Module privé : lecture page par page de l'archive des notices de planning.
// Pages ignore les modules privés ; la route se délègue à ce module. Aucune
// écriture : l'archive est produite par planning-core.js, ce fil ne la lit que.
import { json } from '../../auth/_lib.js';

// Le fil que GET /api/employee sert déjà : les 20 dernières notices de
// l'employé. Tout ce qui précède (le milieu non servi de la liste, puis
// l'archive) est inaccessible au téléphone d'un employé sans cette pagination.
const FEED_KEEP = 20;
const PAGE_SIZE = 25;
const MAX_OFFSET = 100000;

export const PLANNING_NOTICES_PAGE_SIZE = PAGE_SIZE;

/* raw = document team (celui du planning), memberId = fiche canonique de
 * l'employé signé. La lecture s'arrête aux plus récentes servies : le fil du
 * GET reste la source de vérité du présent, la pagination reprend avant lui. */
export function planningNoticesPage(raw, memberId, offset) {
  const planning = raw && typeof raw.planning === 'object' ? raw.planning : {};
  const own = (list) => (Array.isArray(list) ? list : [])
    .filter((notice) => notice && String(notice.memberId || '') === String(memberId || ''));
  const recent = own(planning.notices);
  const freshIds = new Set(recent.map((notice) => String(notice.id || '')));
  const notServed = recent.slice(0, Math.max(0, recent.length - FEED_KEEP));
  const archived = own(planning.noticeArchive).filter((notice) => !freshIds.has(String(notice.id || '')));
  archived.push(...notServed);
  const history = archived.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    || String(b.id || '').localeCompare(String(a.id || '')));
  const start = Math.floor(Number(offset) || 0);
  if (!(start >= 0) || start > MAX_OFFSET) return { items: [], next: null };
  const items = history.slice(start, start + PAGE_SIZE).map((notice) => ({
    id: String(notice.id || ''), type: String(notice.type || ''), day: String(notice.day || ''),
    otherDay: String(notice.otherDay || ''), periodKey: String(notice.periodKey || ''),
    createdAt: String(notice.createdAt || ''),
  }));
  const next = start + items.length < history.length ? start + items.length : null;
  return { items, next };
}

/* actor: { role: 'employee', identity: { session, pin } }, déjà authentifié par
 * la route ; store: contexte de confiance construit par elle (jamais depuis les
 * champs de la requête). Lecture pure : aucune écriture de document. */
export async function handleNoticesPage({ actor, store, body }) {
  if (!actor || !store || !store.env || !store.merchant || !store.readDoc || !store.memberFor) {
    return json({ error: 'employee-session-required' }, 403);
  }
  const teamRow = await store.readDoc(store.env, store.merchant, 'team', { members: [], hours: {}, shifts: {} });
  const member = store.memberFor(teamRow.data, actor.identity && actor.identity.pin);
  const memberId = String((member && member.id) || (actor.identity && actor.identity.pin && actor.identity.pin.id) || '');
  return json({ ok: true, ...planningNoticesPage(teamRow.data, memberId, body && body.offset) });
}
