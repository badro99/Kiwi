/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/segment.js: ONE customer segmentation (spec §17.1 item 7,
 * §18.0 "Customers", §18.8).
 *
 *   window.KiwiSegment  (and module.exports, so the rule is testable in Node)
 *
 *   segmentCustomer(visits, businessDate) -> 'new' | 'regular' | 'inactive'
 *
 * A customer gets exactly one status, by the FIRST rule that matches, judged
 * on the store's business date:
 *   1. new       the first visit is 30 days ago or less;
 *   2. inactive  the last visit is more than 60 days ago;
 *   3. regular   everyone else.
 * New implies a visit in the last 30 days, so no customer can match both 1 and
 * 2, and rule 3 takes the rest: no gap, no overlap. The input is the list of
 * DATED visits, never a lifetime count, so the result can be checked from the
 * data (fixture-agreement-test). VIP is a separate marker that sits on top of a
 * status; it is never a fourth status and never enters this function.
 *
 * Dates are business dates, 'YYYY-MM-DD'. The business day (the 5 h cutoff, the
 * store's zone) is resolved ONCE, by assets/kit/business-day.js; this file only
 * counts calendar days between two business dates, in UTC, so no zone and no
 * daylight-saving change can move a customer between statuses.
 *
 * A visit is a 'YYYY-MM-DD' string, an object with a `date` of that form
 * (plus an `amount`), or a [date, amount] pair (the fixture's form). Anything else carries no usable date and is ignored.
 *
 * Customers, Retention and Kiwi AI call this and nothing else. Adopting it in
 * the shipped surfaces (clients-store.js `segment`) is a later stage.
 *
 * Zero dependencies.
 * ─────────────────────────────────────────────────────────────────────────── */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KiwiSegment = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  var STATUS = Object.freeze({ NEW: 'new', REGULAR: 'regular', INACTIVE: 'inactive' });
  var NEW_WITHIN_DAYS = 30;        /* first visit 30 days ago or less */
  var INACTIVE_AFTER_DAYS = 60;    /* last visit more than 60 days ago */
  var DAY_MS = 86400000;
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  /* 'YYYY-MM-DD' -> whole days since 1970-01-01, or NaN for anything that is
   * not a real calendar date (2026-02-30 is not). */
  function dayNumber(date) {
    if (typeof date !== 'string') return NaN;
    var m = DATE_RE.exec(date);
    if (!m) return NaN;
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = Date.UTC(y, mo - 1, d);
    var back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return NaN;
    return t / DAY_MS;
  }

  /* The three shapes a visit takes: 'YYYY-MM-DD', {date, amount}, and the
   * [date, amount] pair the worked-example fixture stores. */
  function dateOf(visit) {
    if (typeof visit === 'string') return visit;
    if (Array.isArray(visit)) return typeof visit[0] === 'string' ? visit[0] : null;
    return visit && typeof visit.date === 'string' ? visit.date : null;
  }
  function amountOf(visit) {
    var a = Array.isArray(visit) ? visit[1] : visit && typeof visit === 'object' ? visit.amount : 0;
    return isFinite(+a) && a !== null && a !== '' ? +a : 0;
  }

  /* The dated visits that carry a real date, oldest first. */
  function dated(visits) {
    var out = [];
    (Array.isArray(visits) ? visits : []).forEach(function (v) {
      var date = dateOf(v), day = dayNumber(date);
      if (day === day) out.push({ date: date, day: day, amount: amountOf(v) });
    });
    out.sort(function (a, b) { return a.day - b.day; });
    return out;
  }

  /* Visits = the list's length, lifetime spend = the sum of the amounts, first
   * and last visit = the earliest and latest date. */
  function visitStats(visits) {
    var list = dated(visits);
    var sum = 0;
    list.forEach(function (v) { sum += v.amount; });
    return {
      count: list.length,
      lifetime: Math.round(sum * 100) / 100,
      first: list.length ? list[0].date : null,
      last: list.length ? list[list.length - 1].date : null,
      ignored: (Array.isArray(visits) ? visits.length : 0) - list.length
    };
  }

  function needBusinessDay(businessDate) {
    var n = dayNumber(businessDate);
    if (n !== n) throw new RangeError('KiwiSegment: businessDate must be a real YYYY-MM-DD date, got ' + String(businessDate));
    return n;
  }

  /* The one rule. Rule 3 takes everyone the first two do not, so a customer
   * with no dated visit at all is Regular by the letter of the spec; callers
   * that must tell such a customer apart read visitStats(visits).count. */
  function segmentCustomer(visits, businessDate) {
    var today = needBusinessDay(businessDate);
    var list = dated(visits);
    if (list.length) {
      if (today - list[0].day <= NEW_WITHIN_DAYS) return STATUS.NEW;
      if (today - list[list.length - 1].day > INACTIVE_AFTER_DAYS) return STATUS.INACTIVE;
    }
    return STATUS.REGULAR;
  }

  /* Returning today = a visit today and at least two visits in all. */
  function returningToday(visits, businessDate) {
    var today = needBusinessDay(businessDate);
    var list = dated(visits);
    return list.length >= 2 && list.some(function (v) { return v.day === today; });
  }

  /* Whole days from the last visit to the business date (0 = today), or null. */
  function daysSinceLastVisit(visits, businessDate) {
    var today = needBusinessDay(businessDate);
    var list = dated(visits);
    return list.length ? Math.max(0, today - list[list.length - 1].day) : null;
  }

  /* The counts a Customers header and Retention draw. `customers` is a list of
   * {visits, vip}. regular + new + inactive === all always; vip is a filter
   * over the same people, so it sits outside that sum. */
  function countStatuses(customers, businessDate) {
    var c = { all: 0, regular: 0, new: 0, inactive: 0, vip: 0, returningToday: 0 };
    (Array.isArray(customers) ? customers : []).forEach(function (cu) {
      c.all++;
      c[segmentCustomer(cu && cu.visits, businessDate)]++;
      if (cu && cu.vip) c.vip++;
      if (returningToday(cu && cu.visits, businessDate)) c.returningToday++;
    });
    return c;
  }

  /* List order of §18.0 check 9: last visit newest first, then lifetime spend
   * highest first. Usable as Array.prototype.sort's comparator on
   * {visits} records. */
  function byLastVisit(a, b) {
    var sa = visitStats(a && a.visits), sb = visitStats(b && b.visits);
    var da = sa.last ? dayNumber(sa.last) : -Infinity, db = sb.last ? dayNumber(sb.last) : -Infinity;
    if (da !== db) return db > da ? 1 : -1;
    return sb.lifetime - sa.lifetime;
  }

  return {
    STATUS: STATUS, NEW_WITHIN_DAYS: NEW_WITHIN_DAYS, INACTIVE_AFTER_DAYS: INACTIVE_AFTER_DAYS,
    dayNumber: dayNumber, visitStats: visitStats,
    segmentCustomer: segmentCustomer, returningToday: returningToday,
    daysSinceLastVisit: daysSinceLastVisit, countStatuses: countStatuses, byLastVisit: byLastVisit
  };
});
