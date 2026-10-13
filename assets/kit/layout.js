/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/kit/layout.js: declared size classes and the till width rule
 * (spec §13). Layouts DECLARE their class to kit hosts; nothing measures.
 *
 *   window.KiwiLayout  (and module.exports, so the rule is testable in Node)
 *
 *   § 13.1  html[data-k-width]   set by the head block below from matchMedia
 *                                listeners, with no layout read. Five bands:
 *                                xs < 600 · sm 600 · md 768 · lg 1000 · xl 1180
 *                                (the breakpoints of the §13.3 table).
 *           size="compact|regular" passed to the kit hosts whose width the
 *                                layout knows (setSize). ResizeObserver is for
 *                                free-floating hosts only. No container queries.
 *   § 13.3  tillLayout(width, height?)   the one rule for every tablet and
 *                                desktop width: navigation, menu pane, bill
 *                                pane, menu columns, and the payment height form.
 *   § 13.5  sidebar widths, KPI spans. § 13.6 the kitchen root font size.
 *
 * The block between `head:begin` and `head:end` is the 6-line head script the
 * spec describes. A shell may include this whole file in the head, or inline
 * just that block; layout-test runs the block alone and proves it agrees with
 * widthClass() at every width.
 *
 * Zero dependencies.
 * ─────────────────────────────────────────────────────────────────────────── */
/* head:begin */
(function (w) { if (!w || !w.matchMedia) return;
  var Q = [['xl', 1180], ['lg', 1000], ['md', 768], ['sm', 600]].map(function (b) { return [b[0], w.matchMedia('(min-width:' + b[1] + 'px)')]; });
  function set() { var c = 'xs'; for (var i = 0; i < Q.length; i++) if (Q[i][1].matches) { c = Q[i][0]; break; } w.document.documentElement.setAttribute('data-k-width', c); }
  set(); Q.forEach(function (q) { if (q[1].addEventListener) q[1].addEventListener('change', set); else q[1].addListener(set); });
})(typeof window === 'object' ? window : null);
/* head:end */

(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KiwiLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  /* ── §13.1 · bands ─────────────────────────────────────────────────────── */
  var BREAKS = Object.freeze({ sm: 600, md: 768, lg: 1000, xl: 1180 });

  function widthClass(width) {
    var w = +width;
    if (!(w >= 0)) return 'xs';
    if (w >= BREAKS.xl) return 'xl';
    if (w >= BREAKS.lg) return 'lg';
    if (w >= BREAKS.md) return 'md';
    if (w >= BREAKS.sm) return 'sm';
    return 'xs';
  }

  /* The kit hosts take `size="compact|regular"`. The bill pane is regular at
   * every width (§13.3) and the rail is always compact (§13.1); any other
   * host is compact on a phone and regular from 600 up. */
  function hostSize(role, width) {
    if (role === 'bill') return 'regular';
    if (role === 'rail') return 'compact';
    return widthClass(width) === 'xs' ? 'compact' : 'regular';
  }

  function setSize(host, size) {
    if (!host || (size !== 'compact' && size !== 'regular')) return false;
    if (host.getAttribute('size') !== size) host.setAttribute('size', size);
    return true;
  }

  /* ── §13.3 · till width rule ───────────────────────────────────────────── */
  var RAIL = 88;
  var MENU_MARGIN = 24, MENU_GAP = 16, MENU_MIN_COL = 168, MENU_MAX_COLS = 4;

  /* As many 168-wide minimum columns as fit after 24 margins and 16 gaps, at
   * most 4: min(4, floor((pane - 48 + 16) / (168 + 16))). At least 1. */
  function menuColumns(pane) {
    var n = Math.floor((pane - 2 * MENU_MARGIN + MENU_GAP) / (MENU_MIN_COL + MENU_GAP));
    return Math.max(1, Math.min(MENU_MAX_COLS, n));
  }

  /* §13.3 height rule for payment: H >= 1018 regular; 578..1017 compact (the
   * summary over the menu pane, the keypad in the bill pane); 514..577 the
   * compact form with 56-tall keys; below 514 no form fits, so the page keeps
   * min-height 514 and the window scrolls as a whole. Nothing inside the
   * keypad column ever scrolls. */
  function paymentForm(height) {
    var h = +height;
    if (h >= 1018) return { form: 'regular', keyHeight: 72, scrollsPage: false, pageMinHeight: 0 };
    if (h >= 578) return { form: 'compact', keyHeight: 72, scrollsPage: false, pageMinHeight: 0 };
    if (h >= 514) return { form: 'compact-short', keyHeight: 56, scrollsPage: false, pageMinHeight: 0 };
    return { form: 'compact-short', keyHeight: 56, scrollsPage: true, pageMinHeight: 514 };
  }

  function tillLayout(width, height) {
    var w = +width;
    var band = widthClass(w);
    var out = { width: w, band: band };

    if (band === 'xs') {
      /* Every iPhone: tab capsule, full-width menu, 2 columns, the bill as a sheet. */
      out.nav = 'capsule'; out.capsule = 'full'; out.railWidth = 0;
      out.billMode = 'sheet'; out.billWidth = 0;
      out.menuWidth = w; out.menuColumns = 2;
    } else {
      var bill = band === 'xl' ? 432 : band === 'lg' ? 360 : 320;
      var rail = band === 'sm' ? 0 : RAIL;
      out.nav = band === 'sm' ? 'capsule' : 'rail';
      out.capsule = band === 'sm' ? 'menu' : null;            /* floating over the menu pane only */
      out.railWidth = rail;
      out.billMode = 'pane'; out.billWidth = bill;
      out.menuWidth = w - rail - bill;
      out.menuColumns = menuColumns(out.menuWidth);
    }
    out.billSize = 'regular';                                   /* regular at every width */
    out.railSize = 'compact';
    if (height != null) out.payment = paymentForm(height);
    return out;
  }

  /* ── §13.5 · dashboard ─────────────────────────────────────────────────── */
  function sidebarWidth(kind) { return kind === 'desktop' ? 248 : 280; }   /* iPad 280, desktop 248 */

  /* KPI tiles in the portrait 2 x 2 grid: an odd count makes the last tile
   * full width (§13.4). Any other column count lays every tile out at one. */
  function kpiSpans(count, columns) {
    var spans = [], i;
    for (i = 0; i < count; i++) spans.push(1);
    if (columns === 2 && count % 2 === 1) spans[count - 1] = 2;
    return spans;
  }

  /* ── §13.6 · kitchen root font size (size S, M, L) ─────────────────────── */
  var KDS_ROOT = Object.freeze({ S: 20, M: 24, L: 28 });
  function kdsRootPx(size) { return KDS_ROOT[size] || KDS_ROOT.M; }

  return {
    BREAKS: BREAKS, RAIL: RAIL, KDS_ROOT: KDS_ROOT,
    widthClass: widthClass, hostSize: hostSize, setSize: setSize,
    menuColumns: menuColumns, paymentForm: paymentForm, tillLayout: tillLayout,
    sidebarWidth: sidebarWidth, kpiSpans: kpiSpans, kdsRootPx: kdsRootPx
  };
});
