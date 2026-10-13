/* Kiwi · target-audit.mjs: the hit-area audit (spec §10.6, Principle 4).
 *
 * It measures HIT AREAS, not paint. For every control it samples a 44 x 44 grid
 * of points centred on the control with `document.elementsFromPoint` (through
 * open shadow roots, §20.4) and requires each point to resolve to that control
 * or something inside it. A segment that paints 28 and hits 44 passes; one that
 * paints 44 and hits 28 fails; and so does any hit area an ancestor's paint
 * containment or overflow clips, which is how revision 5 of the spec lost 8 px.
 *
 *   import { auditTargets, assertTargets } from './target-audit.mjs';
 *   const r = await auditTargets(page);               // every control on the page
 *   const r = await auditTargets(page, { selector: 'k-segmented button' });
 *   assertTargets(r);                                 // throws, naming each miss
 *
 * Options (all optional):
 *   selector   which controls (default: buttons, links, inputs, selects, and the
 *              ARIA widget roles, through open shadow roots)
 *   min        side of the grid in CSS px (default 44). A control may carry its
 *              own: data-k-target-min="56" (the kitchen, 64 for ticket actions)
 *   step       grid pitch in CSS px (default 2: 22 x 22 samples at 44)
 *   exempt     selector for controls the page has justified (default
 *              [data-k-target-exempt]); they are counted, never sampled
 *   corners    false (default) samples the full box. true skips the points that
 *              fall outside a control's rounded corners (a round icon button)
 *
 * The result is { controls, sampled, exempt, skipped, failures: [...] }; each
 * failure has the control's label, its size, how many points missed, the
 * measured hit width and height (capped at 1.5 x min each way), and the first
 * thing that took a point instead. Controls that are not on screen (display
 * none, visibility hidden, inert, zero size) are skipped and counted.
 *
 * No dependency beyond a Page from puppeteer-core. Closed shadow roots cannot be
 * entered by any script; a kit component keeps its controls in OPEN roots (§20.4).
 */

const DEFAULT_SELECTOR = [
  'button', 'a[href]', 'input:not([type="hidden"])', 'select', 'textarea', 'summary',
  '[role="button"]', '[role="radio"]', '[role="tab"]', '[role="switch"]', '[role="checkbox"]',
  '[role="menuitem"]', '[role="option"]', '[role="link"]', '[tabindex]:not([tabindex="-1"])',
].join(',');

/* Runs inside the page. Self-contained: puppeteer serialises it by source. */
function auditInPage(opts) {
  const controls = [];
  const seen = new Set();
  (function walk(root) {
    root.querySelectorAll(opts.selector).forEach((e) => { if (!seen.has(e)) { seen.add(e); controls.push(e); } });
    root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); });
  })(document);

  /* The innermost element at a point, entering open shadow roots. */
  function deepTop(x, y) {
    let scope = document, top = null;
    for (let depth = 0; depth < 24; depth++) {
      const list = scope.elementsFromPoint(x, y);
      const first = list && list[0];
      if (!first) return top;
      if (scope !== document && first.getRootNode && first.getRootNode() !== scope) return top;   /* only the host, or outside */
      top = first;
      if (!first.shadowRoot) return top;
      scope = first.shadowRoot;
    }
    return top;
  }
  function inside(control, el) {
    for (let n = el; n; n = n.parentNode || n.host) if (n === control) return true;
    return false;
  }
  function describe(el) {
    if (!el) return 'nothing (outside the viewport, or no element)';
    const id = el.id ? '#' + el.id : '';
    const cls = el.classList && el.classList.length ? '.' + Array.from(el.classList).slice(0, 2).join('.') : '';
    return el.localName + id + cls;
  }
  function label(el) {
    const a = el.getAttribute('aria-label') || el.getAttribute('data-k-label');
    if (a) return a;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return (el.localName + (el.id ? '#' + el.id : '') + (t ? ' "' + t + '"' : '')).slice(0, 48);
  }
  function inRoundedBox(rect, px, py, cs) {
    const r = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, rect.width / 2, rect.height / 2);
    if (!r) return true;
    const cx = px < rect.left + r ? rect.left + r : px > rect.right - r ? rect.right - r : px;
    const cy = py < rect.top + r ? rect.top + r : py > rect.bottom - r ? rect.bottom - r : py;
    const dx = px - cx, dy = py - cy;
    return dx * dx + dy * dy <= r * r + 0.01;
  }

  const out = { controls: controls.length, sampled: 0, exempt: 0, skipped: 0, failures: [] };
  for (const el of controls) {
    if (opts.exempt && el.matches(opts.exempt)) { out.exempt++; continue; }
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || (el.closest && el.closest('[inert]'))) { out.skipped++; continue; }
    el.scrollIntoView({ block: 'center', inline: 'center' });
    let rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) { out.skipped++; continue; }
    const own = parseFloat(el.getAttribute('data-k-target-min'));
    const min = own > 0 ? own : opts.min;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const half = min / 2, step = opts.step;
    let total = 0, missed = 0, firstBad = null;
    for (let oy = -half + step / 2; oy < half; oy += step) {
      for (let ox = -half + step / 2; ox < half; ox += step) {
        const px = cx + ox, py = cy + oy;
        if (opts.corners && rect.width >= min && rect.height >= min && !inRoundedBox(rect, px, py, cs)) continue;
        total++;
        const top = deepTop(px, py);
        if (!top || !inside(el, top)) { missed++; if (!firstBad) firstBad = top; }
      }
    }
    out.sampled++;
    /* Measured hit extent along the centre lines, 1 px at a time, capped. */
    const cap = Math.round(min * 1.5);
    const run = (axis) => {
      let n = 0;
      for (let d = -cap; d <= cap; d++) {
        const top = axis === 'y' ? deepTop(cx, cy + d) : deepTop(cx + d, cy);
        if (top && inside(el, top)) n++;
      }
      return n;
    };
    if (!missed && !opts.record) continue;
    const hitH = run('y'), hitW = run('x');
    if (missed) {
      out.failures.push({
        label: label(el), min, width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10,
        missed, total, hitW, hitH, takenBy: describe(firstBad),
      });
    } else if (opts.record) {
      (out.passed || (out.passed = [])).push({ label: label(el), min, hitW, hitH });
    }
  }
  return out;
}

export async function auditTargets(page, options = {}) {
  const opts = {
    selector: options.selector || DEFAULT_SELECTOR,
    min: options.min || 44,
    step: options.step || 2,
    exempt: options.exempt === undefined ? '[data-k-target-exempt]' : options.exempt,
    corners: !!options.corners,
    record: !!options.record,
  };
  return page.evaluate(auditInPage, opts);
}

export function formatFailures(result) {
  return result.failures.map((f) =>
    `${f.label}: ${f.missed} of ${f.total} points on the ${f.min} x ${f.min} grid miss it (box ${f.width} x ${f.height}, measured hit ${f.hitW} x ${f.hitH}), taken by ${f.takenBy}`);
}

export function assertTargets(result, what = 'targets') {
  if (!result.failures.length) return result;
  const lines = formatFailures(result);
  const err = new Error(`${what}: ${lines.length} control${lines.length === 1 ? '' : 's'} below the hit area\n  ` + lines.join('\n  '));
  err.failures = result.failures;
  throw err;
}
