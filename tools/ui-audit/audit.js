/* In-page UI auditor. Returns a list of findings for the visible page or a root. */
window.__kiwiAudit = function (root) {
  root = root || document.querySelector('.kiwi-modal, .kiwi-drawer') || document.querySelector('.dash-genpage') || document.querySelector('main') || document.body;
  const out = [];
  const seen = new Set();
  const add = (kind, el, detail) => {
    const txt = (el.innerText || el.getAttribute('aria-label') || el.className || el.tagName).toString().replace(/\s+/g, ' ').trim().slice(0, 60);
    const key = kind + '|' + txt + '|' + detail;
    if (seen.has(key)) return; seen.add(key);
    out.push({ kind, text: txt, detail });
  };
  const parse = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = (el) => {
    const layers = []; let e = el;
    while (e && e.nodeType === 1) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/url\(/.test(cs.backgroundImage) && /gradient/.test(cs.backgroundImage)) {
        const m = cs.backgroundImage.match(/rgba?\([^)]+\)/); if (m) { const c = parse(m[0]); if (c) { layers.push(c); if (c.a >= 0.95) break; } }
      }
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 0.95) break; }
      e = e.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    if (!layers.length || layers[layers.length - 1].a < 0.95) base = parse(getComputedStyle(document.body).backgroundColor) || base;
    for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base);
    return base;
  };
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.nodeValue.trim(); if (!t) continue;
    const el = n.parentElement; if (!el || !visible(el)) continue;
    if (el.closest('svg, script, style, [aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    // eff. opacity
    let op = 1, e = el; while (e && e.nodeType === 1) { op *= +getComputedStyle(e).opacity; e = e.parentElement; }
    if (op < 0.35) continue;
    const fg = parse(cs.color); if (!fg) continue;
    const bg = bgOf(el);
    const fgEff = blend({ ...fg, a: fg.a * op }, bg);
    const r = ratio(fgEff, bg);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 600;
    const need = (size >= 18.6 || (size >= 14 && bold)) ? 3 : 4.5;
    const disabled = el.closest('button:disabled, [aria-disabled="true"], .is-disabled');
    if (!disabled && r < need - 0.01 && !(r >= 3 && op < 1)) add(r < 2.2 ? 'contrast-severe' : 'contrast', el, r.toFixed(2) + ':1 · ' + cs.color + ' on rgb(' + [bg.r, bg.g, bg.b].map(Math.round) + ') · ' + size + 'px');
    if (cs.fontStyle === 'italic' && !el.closest('.bl-script,.plogo')) add('italic', el, size + 'px');
    if (/—/.test(t)) add('em-dash', el, t.slice(0, 50));
    if (/\b(undefined|NaN|null|\[object Object\])\b/.test(t) && !/input|textarea/i.test(el.tagName)) add('bad-value', el, t.slice(0, 60));
    if (size < 10.5) add('tiny-text', el, size + 'px');
  }
  // clipped text without ellipsis
  root.querySelectorAll('*').forEach((el) => {
    if (!visible(el) || el.closest('svg')) return;
    const cs = getComputedStyle(el);
    if (el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 2 && (cs.overflowX === 'hidden' || cs.overflow === 'hidden' || cs.overflow === 'clip') && cs.textOverflow !== 'ellipsis' && cs.whiteSpace !== 'normal') add('clipped', el, el.scrollWidth + '>' + el.clientWidth);
    let vis = true, q = el; while (q && q.nodeType === 1) { const c2 = getComputedStyle(q); if (+c2.opacity < 0.2 || c2.visibility === 'hidden') { vis = false; break; } q = q.parentElement; }
    if (vis && el.matches('button, [role="button"], a[href]') && !(el.innerText || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title')) add('no-name', el, el.outerHTML.slice(0, 80));
  });
  // text overlapping siblings (simple): any element wider than viewport
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push({ kind: 'h-scroll', text: 'page', detail: document.documentElement.scrollWidth + ' > ' + innerWidth });
  return out;
};
'ready';
