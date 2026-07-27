/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · COLOR PALETTE — window.KiwiColors
 * ---------------------------------------------------------------------------
 * ONE colour vocabulary for every surface where a product colour is chosen,
 * shown, filtered, scanned, sold, returned or exported. Dashboard and caisse
 * both read this file; there is deliberately no second copy anywhere.
 *
 * The palette is a set of GENERAL FAMILIES, not a shade catalogue. A vendor at
 * the counter picks "Bleu", never "bleu nuit / roi / ciel / turquoise" — the
 * whole point is that a colour is recognised by eye in under a second. Any
 * finer shade that already exists in a store's data (or arrives from an import)
 * is mapped onto its family for DISPLAY, while the original value is preserved
 * on the variant so nothing is lost and no two variants are ever merged.
 *
 * Rules this file encodes, all of them load-bearing:
 *  · swatches carry the name in `title` + `aria-label`, never as printed text
 *    next to every option — colour perception is never the only channel;
 *  · light families (blanc / beige / jaune / transparent) get a darker rim so
 *    they cannot vanish against a light page, and a dark checkmark when picked;
 *  · the selected state is a ring + a checkmark, so it survives colour-blindness
 *    and greyscale printing;
 *  · one picker markup, one selected state, one size scale (`lg` = touch), so
 *    the caisse and the dashboard cannot drift apart again.
 *
 * Never use var(--ink) as a swatch background: it inverts in dark mode.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────── the families ─────────────────
     Thirteen general colours plus "transparent", which is only offered where a
     store actually uses it (eyewear, flacons, packaging) — `optional: true`
     keeps it out of a filter row until a variant claims it. `light: true`
     drives the visible outline and the dark checkmark. */
  const FAMILIES = [
    { id: 'noir',        label: 'Noir',        en: 'Black',        ar: 'أسود',   hex: '#1A1A1A' },
    { id: 'blanc',       label: 'Blanc',       en: 'White',        ar: 'أبيض',   hex: '#FFFFFF', light: true },
    { id: 'gris',        label: 'Gris',        en: 'Grey',         ar: 'رمادي',  hex: '#9AA0A6' },
    { id: 'marron',      label: 'Marron',      en: 'Brown',        ar: 'بني',    hex: '#6B4A2F' },
    { id: 'beige',       label: 'Beige',       en: 'Beige',        ar: 'بيج',    hex: '#E0CFB2', light: true },
    { id: 'rouge',       label: 'Rouge',       en: 'Red',          ar: 'أحمر',   hex: '#C62828' },
    { id: 'orange',      label: 'Orange',      en: 'Orange',       ar: 'برتقالي', hex: '#E8720C' },
    { id: 'jaune',       label: 'Jaune',       en: 'Yellow',       ar: 'أصفر',   hex: '#F2C230', light: true },
    { id: 'vert',        label: 'Vert',        en: 'Green',        ar: 'أخضر',   hex: '#2E7D46' },
    { id: 'bleu',        label: 'Bleu',        en: 'Blue',         ar: 'أزرق',   hex: '#1F5FA8' },
    { id: 'violet',      label: 'Violet',      en: 'Purple',       ar: 'بنفسجي', hex: '#7B4BA8' },
    { id: 'rose',        label: 'Rose',        en: 'Pink',         ar: 'وردي',   hex: '#E489AE' },
    { id: 'multi',       label: 'Multicolore', en: 'Multicolour',  ar: 'متعدد',  hex: '#8A8F8C', pattern: 'multi' },
    { id: 'transparent', label: 'Transparent', en: 'Transparent',  ar: 'شفاف',   hex: '#DCDCDC', pattern: 'clear', light: true, optional: true },
  ];
  const BY_ID = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));
  const FALLBACK = BY_ID.gris;

  /* ───────────────── shade → family ─────────────────
     Everything Kiwi has ever shipped or is likely to meet in an import. Keys are
     slugged (accents stripped, spaces collapsed), so "Bleu nuit", "bleu-nuit"
     and "BLEU NUIT" all land on the same entry. This table is the explicit part;
     anything it misses falls through to token matching, then to the hex. */
  const ALIASES = {
    /* Kiwi's retired boutique palette — the exact 13 ids stored on live variants */
    ivoire: 'beige', dore: 'jaune', argent: 'gris', bordeaux: 'rouge', nuit: 'bleu',
    emeraude: 'vert', safran: 'jaune', terracotta: 'marron', camel: 'marron',

    /* whites / creams */
    creme: 'beige', ecru: 'beige', ivory: 'beige', cream: 'beige', naturel: 'beige',
    sable: 'beige', lin: 'beige', nude: 'beige', blancasse: 'beige', 'blanc-casse': 'beige',
    offwhite: 'blanc', 'off-white': 'blanc', neige: 'blanc', craie: 'blanc',

    /* greys / blacks */
    charbon: 'gris', anthracite: 'gris', ardoise: 'gris', perle: 'gris', silver: 'gris',
    argente: 'gris', etain: 'gris', acier: 'gris', charcoal: 'gris', graphite: 'gris',
    ebene: 'noir', jais: 'noir', encre: 'noir', onyx: 'noir', black: 'noir', noire: 'noir',

    /* browns */
    chocolat: 'marron', cafe: 'marron', moka: 'marron', cognac: 'marron', fauve: 'marron',
    taupe: 'marron', chataigne: 'marron', noisette: 'marron', bronze: 'marron', rouille: 'marron',
    tabac: 'marron', chameau: 'marron', brun: 'marron', brown: 'marron', kaki: 'vert',

    /* reds */
    burgundy: 'rouge', grenat: 'rouge', carmin: 'rouge', vermillon: 'rouge', cerise: 'rouge',
    rubis: 'rouge', brique: 'rouge', framboise: 'rouge', sang: 'rouge', maroon: 'rouge',
    'rouge-vif': 'rouge', ecarlate: 'rouge', red: 'rouge',

    /* oranges */
    corail: 'orange', abricot: 'orange', mandarine: 'orange', peche: 'orange', cuivre: 'orange',
    saumon: 'orange', ambre: 'orange', citrouille: 'orange',

    /* yellows */
    moutarde: 'jaune', or: 'jaune', gold: 'jaune', citron: 'jaune', paille: 'jaune',
    miel: 'jaune', canari: 'jaune', ocre: 'jaune', yellow: 'jaune',

    /* greens */
    olive: 'vert', menthe: 'vert', mint: 'vert', sapin: 'vert', bouteille: 'vert',
    pistache: 'vert', jade: 'vert', amande: 'vert', foret: 'vert', anis: 'vert',
    'vert-deau': 'vert', green: 'vert', emerald: 'vert',

    /* blues */
    marine: 'bleu', navy: 'bleu', royal: 'bleu', ciel: 'bleu', azur: 'bleu',
    turquoise: 'bleu', cyan: 'bleu', petrole: 'bleu', denim: 'bleu', indigo: 'bleu',
    cobalt: 'bleu', lagon: 'bleu', canard: 'bleu', teal: 'bleu', blue: 'bleu',

    /* purples */
    lavande: 'violet', mauve: 'violet', lilas: 'violet', prune: 'violet', aubergine: 'violet',
    parme: 'violet', amethyste: 'violet', purple: 'violet',

    /* pinks */
    fuchsia: 'rose', magenta: 'rose', poudre: 'rose', 'rose-poudre': 'rose', blush: 'rose',
    bonbon: 'rose', pink: 'rose',

    /* patterns → multi */
    imprime: 'multi', motif: 'multi', multicolore: 'multi', multicolor: 'multi',
    raye: 'multi', rayure: 'multi', fleuri: 'multi', floral: 'multi', carreaux: 'multi',
    tartan: 'multi', leopard: 'multi', zebre: 'multi', tiedye: 'multi', patterned: 'multi',
    print: 'multi', pattern: 'multi', assorti: 'multi', bariole: 'multi',

    /* clear */
    incolore: 'transparent', clair: 'transparent', cristal: 'transparent', clear: 'transparent',
    'sans-couleur': 'transparent', translucide: 'transparent',
  };

  /* Tokens scanned inside a compound value ("bleu nuit" → bleu). Ordered so a
     longer, more specific token wins before its substring can match. */
  const TOKENS = Object.keys(ALIASES)
    .concat(FAMILIES.map((f) => f.id))
    .sort((a, b) => b.length - a.length);

  function slug(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /* ───────────────── hex → family ─────────────────
     Last resort, and the reason an unknown imported shade can never end up
     colourless: any hex lands somewhere sensible. Hue bands follow how a person
     names a colour, not the colour wheel's midpoints — turquoise reads blue,
     a dark warm orange reads brown. */
  function hexToHsl(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const l = (mx + mn) / 2;
    let s = 0, hue = 0;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) hue = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
      hue *= 60;
    }
    return { h: hue, s, l };
  }

  function familyFromHex(hex) {
    const c = hexToHsl(hex);
    if (!c) return null;
    const { h, s, l } = c;
    // Near-neutral: only lightness decides.
    if (s < 0.12) return l < 0.20 ? BY_ID.noir : l > 0.90 ? BY_ID.blanc : BY_ID.gris;
    // Warm, pale and washed out reads as beige long before it reads as orange.
    if (h >= 15 && h < 70 && s < 0.45 && l > 0.72) return BY_ID.beige;
    if (l < 0.14) return BY_ID.noir;
    if (l > 0.94 && s < 0.25) return BY_ID.blanc;
    if (h < 15 || h >= 345) return BY_ID.rouge;
    if (h < 42) return (l < 0.46 || (s < 0.55 && l < 0.62)) ? BY_ID.marron : BY_ID.orange;
    if (h < 68) return l < 0.38 ? BY_ID.marron : BY_ID.jaune;
    if (h < 165) return BY_ID.vert;
    if (h < 255) return BY_ID.bleu;              // teal + turquoise read as blue
    if (h < 330) return l < 0.52 ? BY_ID.violet : BY_ID.rose;
    return BY_ID.rose;
  }

  /* ───────────────── normalize ─────────────────
     Give it anything a variant carries (id, human label, hex) and it returns a
     family — never null. `id` wins, then the label, then the hex. */
  function normalize(id, label, hex) {
    const direct = BY_ID[slug(id)];
    if (direct) return direct;
    for (const raw of [id, label]) {
      const k = slug(raw);
      if (!k) continue;
      if (BY_ID[k]) return BY_ID[k];
      if (ALIASES[k]) return BY_ID[ALIASES[k]];
      for (const t of TOKENS) {
        if (k === t || k.startsWith(t + '-') || k.endsWith('-' + t) || k.indexOf('-' + t + '-') >= 0) {
          return BY_ID[ALIASES[t] || t] || FALLBACK;
        }
      }
    }
    return familyFromHex(hex) || FALLBACK;
  }

  const familyId = (id, label, hex) => normalize(id, label, hex).id;

  /* ───────────────── styles ─────────────────
     Injected once, shared by both apps. Sizes: default 30px (dense tables and
     dashboard forms), `lg` 44px (caisse touch targets — a thumb at the counter),
     `sm` 16px (inline, non-interactive markers in rows and cards). */
  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('kiwi-colors-css')) return;
    const st = document.createElement('style');
    st.id = 'kiwi-colors-css';
    st.textContent = `
      .kc-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .kc-sw {
        position: relative; display: inline-block; flex: none;
        width: 30px; height: 30px; border-radius: 50%;
        border: 1px solid rgba(10,15,13,.22); padding: 0; margin: 0;
        background-clip: padding-box; background-size: cover; cursor: pointer;
        transition: transform 120ms ease, box-shadow 160ms ease;
        -webkit-tap-highlight-color: transparent;
      }
      .kc-sw.kc-lg { width: 44px; height: 44px; }
      .kc-sw.kc-sm { width: 16px; height: 16px; border-width: 1px; cursor: default; vertical-align: -3px; }
      /* A swatch must never dissolve into the page it sits on. On a light page
         that threatens white and beige; on a dark one it threatens black, which
         reads as an empty ring. So the rim follows the page, and the light
         families keep their darker rim in both themes because they stay light. */
      .kc-sw.is-light { border-color: rgba(10,15,13,.42); }
      html[data-theme="dark"] .kc-sw { border-color: rgba(255,255,255,.34); }
      html[data-theme="dark"] .kc-sw.is-light { border-color: rgba(10,15,13,.42); }
      html[data-theme="dark"] button.kc-sw[aria-checked="true"] {
        box-shadow: 0 0 0 2px var(--paper, #0f1512), 0 0 0 4px var(--mint, #7DF2B0);
      }
      .kc-sw[data-kc-pattern="multi"] {
        background-image: conic-gradient(from 210deg, #C62828, #E8720C, #F2C230, #2E7D46, #1F5FA8, #7B4BA8, #E489AE, #C62828);
      }
      /* Transparent reads as "no colour" the way every image editor writes it. */
      .kc-sw[data-kc-pattern="clear"] {
        background-color: #fff;
        background-image:
          linear-gradient(45deg, #c6c9c7 25%, transparent 25%, transparent 75%, #c6c9c7 75%),
          linear-gradient(45deg, #c6c9c7 25%, transparent 25%, transparent 75%, #c6c9c7 75%);
        background-size: 10px 10px;
        background-position: 0 0, 5px 5px;
      }
      .kc-sw.kc-sm[data-kc-pattern="clear"] { background-size: 6px 6px; background-position: 0 0, 3px 3px; }
      button.kc-sw:hover { transform: scale(1.09); }
      button.kc-sw:focus-visible { outline: 2px solid var(--atlas, #0B6E4F); outline-offset: 3px; }
      /* Selected = ring + checkmark. Never colour alone. */
      button.kc-sw[aria-checked="true"] {
        box-shadow: 0 0 0 2px var(--paper, #F7F5F0), 0 0 0 4px var(--atlas, #0B6E4F);
        transform: scale(1.06);
      }
      button.kc-sw[aria-checked="true"]::after {
        content: ''; position: absolute; left: 50%; top: 50%;
        width: 30%; height: 55%; margin: -32% 0 0 -15%;
        border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(42deg);
      }
      button.kc-sw.kc-lg[aria-checked="true"]::after { border-width: 0 2.5px 2.5px 0; }
      button.kc-sw.is-light[aria-checked="true"]::after { border-color: #0A0F0D; }
      /* Name on demand: hover / focus writes it into the caption under the row. */
      .kc-cap { font-size: 12px; color: var(--n-500, #77807b); margin-top: 7px; min-height: 1.15em; }
      .kc-cap:empty::before { content: attr(data-kc-empty); opacity: .75; }
      .kc-tag { display: inline-flex; align-items: center; gap: 6px; }
      .kc-tag-src { font-size: 11px; color: var(--n-500, #77807b); }
      @media (max-width: 720px) { .kc-sw { width: 36px; height: 36px; } .kc-sw.kc-sm { width: 16px; height: 16px; } }
      @media (prefers-reduced-motion: reduce) { .kc-sw { transition: none; } button.kc-sw:hover { transform: none; } }
    `;
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function swAttrs(f, size) {
    const cls = ['kc-sw'];
    if (size === 'lg') cls.push('kc-lg');
    if (size === 'sm') cls.push('kc-sm');
    if (f.light) cls.push('is-light');
    const bg = f.pattern ? '' : `background-color:${f.hex};`;
    return { cls: cls.join(' '), style: bg, pat: f.pattern || '' };
  }

  /* A non-interactive marker: tables, ticket lines, product cards. Carries the
     name for assistive tech even though nothing is printed next to it. */
  function swatch(idOrFamily, opts) {
    opts = opts || {};
    const f = typeof idOrFamily === 'object' && idOrFamily ? idOrFamily : normalize(idOrFamily);
    const a = swAttrs(f, opts.size || 'sm');
    const name = opts.name || f.label;
    return `<i class="${a.cls}" ${a.pat ? `data-kc-pattern="${a.pat}"` : ''} style="${a.style}" `
      + `title="${esc(name)}" role="img" aria-label="${esc(name)}"></i>`;
  }

  /* The selector. One markup, both apps, both size scales.
     `ids` narrows the palette (a filter row shows only what the store stocks);
     `optional` families are hidden unless explicitly listed or asked for. */
  function picker(name, selected, opts) {
    opts = opts || {};
    const size = opts.size || 'md';
    const list = opts.ids && opts.ids.length
      ? opts.ids.map((i) => BY_ID[i] || normalize(i)).filter(Boolean)
      : FAMILIES.filter((f) => !f.optional || opts.optional);
    const seen = new Set();
    const sel = selected ? familyId(selected) : '';
    const btns = list.filter((f) => (seen.has(f.id) ? false : seen.add(f.id))).map((f) => {
      const a = swAttrs(f, size);
      const on = f.id === sel;
      return `<button type="button" class="${a.cls}" ${a.pat ? `data-kc-pattern="${a.pat}"` : ''} `
        + `style="${a.style}" data-kc-color="${f.id}" value="${f.id}" role="radio" `
        + `aria-checked="${on ? 'true' : 'false'}" tabindex="${on || (!sel && f === list[0]) ? '0' : '-1'}" `
        + `title="${esc(f.label)}" aria-label="${esc(f.label)}"></button>`;
    }).join('');
    const cap = opts.caption === false ? ''
      : `<div class="kc-cap" data-kc-cap data-kc-empty="${esc(opts.hint || 'Survolez une pastille pour lire son nom')}">`
        + `${sel ? esc(BY_ID[sel] ? BY_ID[sel].label : '') : ''}</div>`;
    return `<div class="kc-picker" data-kc-picker="${esc(name || 'color')}" role="radiogroup" `
      + `aria-label="${esc(opts.label || 'Couleur')}"><div class="kc-row">${btns}</div>${cap}</div>`;
  }

  /* Read the current value out of a rendered picker (or its container). */
  function value(root) {
    if (!root) return '';
    const box = root.matches && root.matches('[data-kc-picker]') ? root : root.querySelector('[data-kc-picker]');
    if (!box) return '';
    const on = box.querySelector('[aria-checked="true"]');
    return on ? on.getAttribute('data-kc-color') : '';
  }

  function select(box, id) {
    if (!box) return;
    box.querySelectorAll('[data-kc-color]').forEach((b) => {
      const on = b.getAttribute('data-kc-color') === id;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.setAttribute('tabindex', on ? '0' : '-1');
    });
    const cap = box.querySelector('[data-kc-cap]');
    if (cap) cap.textContent = BY_ID[id] ? BY_ID[id].label : '';
  }

  /* One delegated wiring for every picker on the page, present or future — no
     surface has to remember to call an init. Click selects; ← → ↑ ↓ move and
     select (native radiogroup behaviour, so a keyboard user never tabs through
     fourteen buttons); hover and focus write the name into the caption. */
  function install() {
    if (typeof document === 'undefined' || document.__kcWired) return;
    document.__kcWired = true;

    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button.kc-sw[data-kc-color]');
      if (!b) return;
      const box = b.closest('[data-kc-picker]');
      if (!box) return;
      select(box, b.getAttribute('data-kc-color'));
      box.dispatchEvent(new CustomEvent('kc:change', {
        bubbles: true, detail: { value: b.getAttribute('data-kc-color'), name: box.getAttribute('data-kc-picker') },
      }));
    }, true);

    document.addEventListener('keydown', (e) => {
      const b = e.target.closest && e.target.closest('button.kc-sw[data-kc-color]');
      if (!b) return;
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
      if (!dir) return;
      const box = b.closest('[data-kc-picker]');
      if (!box) return;
      e.preventDefault();
      const all = [].slice.call(box.querySelectorAll('button.kc-sw[data-kc-color]'));
      const next = all[(all.indexOf(b) + dir + all.length) % all.length];
      if (!next) return;
      select(box, next.getAttribute('data-kc-color'));
      next.focus();
      box.dispatchEvent(new CustomEvent('kc:change', {
        bubbles: true, detail: { value: next.getAttribute('data-kc-color'), name: box.getAttribute('data-kc-picker') },
      }));
    });

    // Name on hover / focus — the swatch stays wordless, the caption speaks.
    const say = (e) => {
      const b = e.target.closest && e.target.closest('button.kc-sw[data-kc-color]');
      if (!b) return;
      const box = b.closest('[data-kc-picker]');
      const cap = box && box.querySelector('[data-kc-cap]');
      if (cap) cap.textContent = b.getAttribute('title') || '';
    };
    const reset = (e) => {
      const box = e.target.closest && e.target.closest('[data-kc-picker]');
      const cap = box && box.querySelector('[data-kc-cap]');
      if (!cap) return;
      const on = box.querySelector('[aria-checked="true"]');
      cap.textContent = on ? (on.getAttribute('title') || '') : '';
    };
    document.addEventListener('mouseover', say);
    document.addEventListener('focusin', say);
    document.addEventListener('mouseout', reset);
    document.addEventListener('focusout', reset);

    injectCss();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
  }

  window.KiwiColors = {
    FAMILIES,
    families: (opts) => FAMILIES.filter((f) => !f.optional || (opts && opts.optional)).slice(),
    all: () => FAMILIES.slice(),
    get: (id) => BY_ID[slug(id)] || null,
    normalize, familyId,
    label: (id) => (normalize(id).label),
    isFamily: (id) => !!BY_ID[slug(id)],
    slug, hexToHsl, familyFromHex,
    swatch, picker, value, select, injectCss, install,
  };
})();
