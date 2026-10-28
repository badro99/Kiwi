/* Kiwi · the ids of Shopify stock movements, in one place.
 *
 * Three paths write or read the same journal lines: the order webhook
 * (functions/api/channel/shopify/[link].js), the catch-up replay
 * (_replay-orders.js) and the cancel/refund reversal (_order-reversal.js).
 * A sale line is found again by its id alone, so the three must build it the
 * same way, whatever form Shopify used for the ids (REST numbers or GraphQL
 * gid://shopify/…/123). They used to build it separately, and only agreed
 * because every caller happened to pass numbers (note 13, shopify#1).
 *
 *   so-<order>-<line>            the sale took the piece      (webhook, replay)
 *   sx-<order>-<line>            a cancellation gave it back  (reversal)
 *   sr-<refund>-<order>-<line>   a refund gave it back        (reversal)
 * Each part is the last 24 characters of the bare id; the whole id stops at 64.
 * These ids are stored in merchants' catalogues: never change the format. */

const bare = (id) => String(id == null ? '' : id).slice(0, 160).split('/').pop();

/* The order-and-line key shared by the sale and its reversals. */
export const lineKey = (orderRef, lineId) => `${bare(orderRef).slice(-24)}-${bare(lineId).slice(-24)}`;

export const saleMoveId = (orderRef, lineId) => `so-${lineKey(orderRef, lineId)}`.slice(0, 64);

/* key is lineKey(…), or the tail of a sale move id after "so-". */
export const reversalMoveId = (kind, key, refundId = '') =>
  (kind === 'refund' ? `sr-${bare(refundId).slice(-10)}-${key}` : `sx-${key}`).slice(0, 64);

export const __test = { bare };
