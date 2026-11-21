/* SPLIT FLOWS BELONG TO ONE TABLE VISIT.
 *
 * A shared bill (`split.flowId`) is paid in parts, each its own sale row. The
 * parts were counted by flow alone, across visits. A waiter phone left on the
 * split sheet of a visit the till had already settled sent its last part
 * against the NEXT party on the same table (judge probe, round 3): the flow
 * looked complete, and the new party's 56 MAD bill closed on 14 MAD of the
 * previous one.
 *
 * Rule: a part may only join the visit its flow was paid on. The one way a
 * flow legitimately spans two visits is a till reopen: the cashier voids one
 * part and reopens it onto a replacement visit (functions/api/sale/cancel.js
 * › voidAndReopen), which leaves a `sale_audit` « reopen » row naming the flow
 * and the new visit. Only the till can write that row, so a phone cannot forge
 * the exception. */

/* Does a till reopen tie this flow to this visit? */
async function reopenedOnto(env, merchant, splitFlowId, sessionId) {
  const row = await env.DB.prepare(
    `SELECT 1 FROM sale_audit
      WHERE merchant = ? AND action = 'reopen'
        AND json_extract(impact, '$.splitFlowId') = ?
        AND json_extract(impact, '$.sessionId') = ?
      LIMIT 1`
  ).bind(merchant, splitFlowId, sessionId).first();
  return !!row;
}

/* Has this flow already been paid (in part) on a different visit? */
async function paidOnAnotherVisit(env, merchant, splitFlowId, sessionId) {
  const row = await env.DB.prepare(
    `SELECT session_id FROM sales
      WHERE merchant = ? AND split_flow_id = ? AND void_ts IS NULL
        AND session_id IS NOT NULL AND session_id <> ?
      LIMIT 1`
  ).bind(merchant, splitFlowId, sessionId).first();
  return !!row;
}

/* Called before a split part is written.
 *   { spansVisits }            the flow may count parts across visits (till reopen)
 *   { refusal: {status, body} } refuse the part; nothing is written
 * `stored`: the part is a replay of a row already written, which is never refused. */
export async function splitVisitCheck(env, merchant, { splitFlowId, sessionId, stored, table }) {
  if (!splitFlowId || !sessionId) return { spansVisits: false, refusal: null };
  try {
    if (await reopenedOnto(env, merchant, splitFlowId, sessionId)) return { spansVisits: true, refusal: null };
    if (stored || !(await paidOnAnotherVisit(env, merchant, splitFlowId, sessionId))) {
      return { spansVisits: false, refusal: null };
    }
    return {
      spansVisits: false,
      refusal: { status: 409, body: { error: 'split-flow-other-visit', table: table || '', reopened: true, openSession: sessionId } },
    };
  } catch (_) {
    return { spansVisits: false, refusal: { status: 503, body: { error: 'split-receipts-unavailable' } } };
  }
}

/* How many distinct parts of the flow are paid, counting only this visit
 * unless a till reopen made the flow span visits. Throws when unreadable. */
export async function splitPartsPaid(env, merchant, { splitFlowId, sessionId, spansVisits }) {
  const thisVisitOnly = !!sessionId && !spansVisits;
  const receipts = await env.DB.prepare(
    `SELECT DISTINCT id FROM sales
      WHERE merchant = ? AND split_flow_id = ? AND void_ts IS NULL
        ${thisVisitOnly ? 'AND session_id = ?' : ''}`
  ).bind(merchant, splitFlowId, ...(thisVisitOnly ? [sessionId] : [])).all();
  return ((receipts && receipts.results) || []).length;
}
