import { json } from '../../auth/_lib.js';
// Internal contract: actor is supplied only after liveEmployee authentication and
// store operational checks. Access roles are distinct from free-form job titles.
// Every listed action permits employee sessions only, never owner/till sessions.
const TEAM_FEATURE = 'team';
export const ACTION_ROLES = Object.freeze({
  'planning-request': Object.freeze(['employee']),
  'planning-request-cancel': Object.freeze(['employee']),
  'planning-open-shift-claim': Object.freeze(['employee']),
  'planning-swap-request': Object.freeze(['employee']),
  'planning-swap-claim': Object.freeze(['employee']),
  'planning-opportunity-cancel': Object.freeze(['employee']),
});
/**
 * actor: { role: 'employee', identity: { session, pin } }, already authenticated.
 * store: trusted tenant context (env, merchant, zone), document CAS operations
 * and shared identity/projection helpers. Never constructed from request fields.
 * Returns the existing HTTP Response; all actions operate on the actor only.
 */
export async function handleLeave({ actor, store, request, action, body }) {
  if (!actor || !Object.hasOwn(ACTION_ROLES, action) || !ACTION_ROLES[action].includes(actor.role)) {
    return json({ error: 'employee-session-required' }, 403);
  }
  const { env, merchant, zone, readDoc, mutateDoc, memberFor, planningDay, roleKey, validISODate, validTime } = store;
  const auth = actor.identity;
  if (action === 'planning-request' || action === 'planning-request-cancel') {
    const teamRow = await readDoc(env, merchant, TEAM_FEATURE, { members:[], hours:{}, shifts:{}, planning:{} });
    const member = memberFor(teamRow.data, auth.pin);
    const memberId = String((member && member.id) || auth.pin.id);
    let requestId = '';
    const now = new Date().toISOString();
    if (action === 'planning-request') {
      const type = String(body.type || '');
      if (type !== 'leave' && type !== 'availability') return json({ error:'planning-request-type-invalid' }, 400);
      const reason = String(body.reason || '').trim().slice(0, 240);
      const request = { id:crypto.randomUUID(), memberId, type, reason, status:'pending', createdAt:now, updatedAt:now };
      if (type === 'leave') {
        const startDate = String(body.startDate || ''), endDate = String(body.endDate || '');
        if (!validISODate(startDate) || !validISODate(endDate) || startDate > endDate) return json({ error:'planning-date-invalid' }, 400);
        const length = Math.round((Date.parse(endDate + 'T12:00:00Z') - Date.parse(startDate + 'T12:00:00Z')) / 86400000);
        if (length > 366) return json({ error:'planning-date-range-too-long' }, 400);
        request.startDate = startDate; request.endDate = endDate;
      } else {
        const weekdays = Array.from(new Set((Array.isArray(body.weekdays) ? body.weekdays : []).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort();
        const available = body.available !== false;
        const start = String(body.start || ''), end = String(body.end || '');
        if (!weekdays.length || (available && (!validTime(start) || !validTime(end) || start === end))) return json({ error:'planning-availability-invalid' }, 400);
        request.weekdays = weekdays; request.available = available; request.start = available ? start : ''; request.end = available ? end : '';
      }
      requestId = request.id;
      const updated = await mutateDoc(env, merchant, TEAM_FEATURE, { members:[], hours:{}, shifts:{}, planning:{} }, (doc) => {
        doc.planning = doc.planning && typeof doc.planning === 'object' ? doc.planning : {};
        doc.planning.requests = Array.isArray(doc.planning.requests) ? doc.planning.requests : [];
        const duplicate = doc.planning.requests.some((item) => item && item.memberId === memberId && item.type === request.type && item.status === 'pending' && (request.type === 'leave' ? item.startDate === request.startDate && item.endDate === request.endDate : JSON.stringify(item.weekdays || []) === JSON.stringify(request.weekdays || [])));
        if (!duplicate) doc.planning.requests.push(request);
        return doc;
      });
      if (!updated) return json({ error:'planning-write-failed' }, 503);
    } else {
      requestId = String(body.requestId || '');
      if (!requestId) return json({ error:'planning-request-id-required' }, 400);
      const updated = await mutateDoc(env, merchant, TEAM_FEATURE, { members:[], hours:{}, shifts:{}, planning:{} }, (doc) => {
        doc.planning = doc.planning && typeof doc.planning === 'object' ? doc.planning : {};
        doc.planning.requests = Array.isArray(doc.planning.requests) ? doc.planning.requests : [];
        const request = doc.planning.requests.find((item) => item && item.id === requestId && item.memberId === memberId && item.status === 'pending');
        if (request) { request.status = 'cancelled'; request.updatedAt = now; }
        return doc;
      });
      if (!updated) return json({ error:'planning-write-failed' }, 503);
    }
    return json({ ok:true, action, requestId });
  }
  if (['planning-open-shift-claim', 'planning-swap-request', 'planning-swap-claim', 'planning-opportunity-cancel'].includes(action)) {
    const teamRow = await readDoc(env, merchant, TEAM_FEATURE, { members:[], hours:{}, shifts:{}, planning:{} });
    const member = memberFor(teamRow.data, auth.pin);
    const memberId = String((member && member.id) || auth.pin.id);
    const memberRole = roleKey((member && (member.function || member.department)) || auth.pin.role);
    const now = new Date().toISOString();
    let resultId = '';
    let operationError = '';
    const updated = await mutateDoc(env, merchant, TEAM_FEATURE, { members:[], hours:{}, shifts:{}, planning:{} }, (doc) => {
      doc.planning = doc.planning && typeof doc.planning === 'object' ? doc.planning : {};
      const planning = doc.planning;
      planning.openShifts = Array.isArray(planning.openShifts) ? planning.openShifts : [];
      planning.swapRequests = Array.isArray(planning.swapRequests) ? planning.swapRequests : [];
      planning.publishedShifts = planning.publishedShifts && typeof planning.publishedShifts === 'object' ? planning.publishedShifts : {};
      if (action === 'planning-open-shift-claim') {
        resultId = String(body.shiftId || '');
        const shift = planning.openShifts.find((item) => item && item.id === resultId);
        if (!shift || shift.status !== 'open') { operationError = 'open-shift-unavailable'; return doc; }
        if (!validISODate(shift.day) || !validTime(shift.start) || !validTime(shift.end) || shift.start === shift.end) { operationError = 'open-shift-invalid'; return doc; }
        if (shift.day < planningDay(Date.now(), zone)) { operationError = 'open-shift-past'; return doc; }
        if (shift.role && memberRole && roleKey(shift.role) !== memberRole) { operationError = 'open-shift-role-mismatch'; return doc; }
        if (planning.publishedShifts[memberId] && planning.publishedShifts[memberId][shift.day]) { operationError = 'open-shift-schedule-conflict'; return doc; }
        const activeClaims = planning.openShifts.filter((item) => item && item.claimantId === memberId && item.status === 'claimed').length;
        if (activeClaims >= 20) { operationError = 'planning-opportunity-limit'; return doc; }
        shift.status = 'claimed'; shift.claimantId = memberId; shift.updatedAt = now;
      } else if (action === 'planning-swap-request') {
        const day = String(body.day || '');
        const ownShift = planning.publishedShifts[memberId] && planning.publishedShifts[memberId][day];
        if (!validISODate(day) || !ownShift || !validTime(ownShift.start) || !validTime(ownShift.end)) { operationError = 'swap-shift-invalid'; return doc; }
        if (day < planningDay(Date.now(), zone)) { operationError = 'swap-shift-past'; return doc; }
        const activeMine = planning.swapRequests.filter((item) => item && item.memberId === memberId && ['open','claimed'].includes(item.status)).length;
        if (activeMine >= 20) { operationError = 'planning-opportunity-limit'; return doc; }
        if (planning.swapRequests.some((item) => item && item.memberId === memberId && item.day === day && ['open','claimed'].includes(item.status))) { operationError = 'swap-already-open'; return doc; }
        resultId = crypto.randomUUID();
        planning.swapRequests.push({ id:resultId, memberId, day, shift:{ start:String(ownShift.start), end:String(ownShift.end) }, status:'open', claimantId:'', offeredDay:'', createdAt:now, updatedAt:now });
      } else if (action === 'planning-swap-claim') {
        resultId = String(body.requestId || '');
        const offeredDay = String(body.offeredDay || '');
        const request = planning.swapRequests.find((item) => item && item.id === resultId);
        const offeredShift = planning.publishedShifts[memberId] && planning.publishedShifts[memberId][offeredDay];
        if (!request || request.status !== 'open' || request.memberId === memberId) { operationError = 'swap-unavailable'; return doc; }
        if (!validISODate(offeredDay) || !offeredShift || !validTime(offeredShift.start) || !validTime(offeredShift.end)) { operationError = 'swap-offer-invalid'; return doc; }
        if (request.day < planningDay(Date.now(), zone) || offeredDay < planningDay(Date.now(), zone)) { operationError = 'swap-shift-past'; return doc; }
        const owner = (Array.isArray(doc.members) ? doc.members : []).find((item) => item && String(item.id || '') === String(request.memberId || ''));
        const ownerRole = roleKey(owner && (owner.function || owner.department || owner.role));
        if (ownerRole && memberRole && ownerRole !== memberRole) { operationError = 'swap-role-mismatch'; return doc; }
        request.status = 'claimed'; request.claimantId = memberId; request.offeredDay = offeredDay;
        request.offeredShift = { start:String(offeredShift.start), end:String(offeredShift.end) }; request.updatedAt = now;
      } else {
        resultId = String(body.requestId || body.shiftId || '');
        const open = planning.openShifts.find((item) => item && item.id === resultId && item.status === 'claimed' && item.claimantId === memberId);
        const swap = planning.swapRequests.find((item) => item && item.id === resultId);
        if (open) { open.status = 'open'; open.claimantId = ''; open.updatedAt = now; }
        else if (swap && swap.memberId === memberId && ['open','claimed'].includes(swap.status)) { swap.status = 'cancelled'; swap.updatedAt = now; }
        else if (swap && swap.claimantId === memberId && swap.status === 'claimed') { swap.status = 'open'; swap.claimantId = ''; swap.offeredDay = ''; delete swap.offeredShift; swap.updatedAt = now; }
        else operationError = 'planning-opportunity-not-cancellable';
      }
      return doc;
    });
    if (!updated) return json({ error:'planning-write-failed' }, 503);
    if (operationError) return json({ error:operationError }, 409);
    return json({ ok:true, action, id:resultId });
  }

}
