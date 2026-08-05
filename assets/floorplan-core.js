/* ═══════════════════════════════════════════════════════════════════════════
 * KIWI · FLOOR PLAN CORE
 *
 * The shared vocabulary of a floor plan: materials, the fixture catalogue,
 * instance-owned geometry, and the primitives that draw a table, a chair and
 * a fixture.
 *
 * This lives in its own file because TWO surfaces render the same plan — the
 * owner designs it in the dashboard (assets/pages-pro.js) and the staff work
 * it on the till (kiwi-caisse.html). The till used to keep a private
 * DESIGN_COVERS map of seats-per-table-type, which drifted from the
 * dashboard's: `rect10` was missing from it, so every 10-top displayed "4p".
 * That is the failure this file exists to prevent — one catalogue, one set of
 * drawing rules, both surfaces.
 *
 * Plain script, no build step, loaded BEFORE pages-pro.js. Top-level `const`
 * and `function` here are globals that pages-pro.js reads directly; the same
 * names are also hung on window.KiwiFloorCore for the caisse, which is not an
 * IIFE-sharing consumer.
 *
 * Geometry convention: 1 logical unit = 1 cm. An object owns its own
 * x/y/w/h/rot/color — never its type — which is what makes it resizable.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ─── Materials ───────────────────────────────────────────────────────────
 *   The merchant is colouring THEIR restaurant, not Kiwi's chrome, so this
 *   palette is materials (woods, stone, terracotta, brass) rather than the
 *   brand ramp — same reasoning as the italic depiction exceptions in
 *   CLAUDE.md §3. The three brand greens are in here so a plan can echo the
 *   Kiwi identity, but the UI around the plan stays brand-locked. Free-form
 *   hex is deliberately NOT offered: a colour wheel is how a floor plan ends
 *   up magenta.                                                            */
const PDS_MAT = [
  { id: 'bone',   c: '#FBF7EE' }, { id: 'sand',   c: '#EFE7D6' },
  { id: 'stone',  c: '#E0D7C4' }, { id: 'clay',   c: '#CFC0A6' },
  { id: 'oak',    c: '#C9A46B' }, { id: 'brass',  c: '#BFA86A' },
  { id: 'terra',  c: '#C4784F' }, { id: 'walnut', c: '#8A6A45' },
  { id: 'sage',   c: '#7A9E8E' }, { id: 'ebony',  c: '#3A3128' },
  { id: 'coal',   c: '#2A2A28' }, { id: 'ink',    c: '#141A16' },
  { id: 'atlas',  c: '#0B6E4F' }, { id: 'riad',   c: '#053B2C' },
  { id: 'mint',   c: '#7DF2B0' }, { id: 'glass',  c: '#BFD9E8' },
];

/* Floor finishes. Pure CSS background-image: tiles at a fixed size, so it
   never distorts when the room is resized — the failure mode the old
   `preserveAspectRatio="none"` scenes had. Tinted by the floor colour
   underneath rather than baked, so one pattern serves every colour. */
const PDS_FLOORS = {
  plain:    '',
  terrazzo: `radial-gradient(circle at 18% 26%, rgba(0,0,0,.07) 0 2.2px, transparent 2.3px),
             radial-gradient(circle at 68% 62%, rgba(0,0,0,.055) 0 3px, transparent 3.1px),
             radial-gradient(circle at 88% 18%, rgba(0,0,0,.05) 0 1.6px, transparent 1.7px)`,
  zellige:  `linear-gradient(rgba(0,0,0,.055) 1px, transparent 1px),
             linear-gradient(90deg, rgba(0,0,0,.055) 1px, transparent 1px)`,
  bois:     `repeating-linear-gradient(90deg, rgba(0,0,0,.055) 0 1px, transparent 1px 92px),
             repeating-linear-gradient(0deg, rgba(0,0,0,.035) 0 1px, transparent 1px 27px)`,
  carreaux: `conic-gradient(rgba(0,0,0,.05) 0 25%, transparent 0 50%, rgba(0,0,0,.05) 0 75%, transparent 0)`,
};
const PDS_FLOOR_SIZE = {
  plain: 'auto', terrazzo: '46px 46px, 64px 64px, 38px 38px',
  zellige: '42px 42px', bois: '92px 27px', carreaux: '58px 58px',
};

/* Pick legible text for any material — a table number on ebony needs bone
   ink, the same number on bone needs dark ink. Relative luminance, sRGB. */
function pdsInk(hex) {
  const h = String(hex || '#FBF7EE').replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const v = [0, 2, 4].map(i => {
    const s = parseInt(n.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const L = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  return L > 0.42 ? '#141A16' : '#F7F3E8';
}
/* Slightly darker/lighter sibling of a material, for edges and shading. */
function pdsShade(hex, amt) {
  const h = String(hex || '#FBF7EE').replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const p = [0, 2, 4].map(i => {
    const c = Math.round(parseInt(n.slice(i, i + 2), 16) + amt * 255);
    return Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
  });
  return '#' + p.join('');
}

/* Normalise anything colour-shaped to a 6-digit hex, so <input type="color">
   always has something valid to show and never silently resets to black. */
function pdsHexOf(v) {
  const h = String(v == null ? '' : v).trim().replace('#', '');
  if (/^[0-9a-f]{3}$/i.test(h)) return '#' + h.split('').map(c => c + c).join('');
  if (/^[0-9a-f]{6}$/i.test(h)) return '#' + h.toLowerCase();
  return '#fbf7ee';
}

/* A free colour picker has to stay legible: pdsInk() flips bone-vs-ink at
   L≈0.42, and a fill sitting right on that boundary gets a label that clears
   neither direction. Rather than reject the merchant's choice, nudge it out
   of the dead band — they get the colour they asked for, just far enough
   from the tipping point that the table number stays readable. */
function pdsSafeColor(v) {
  let c = pdsHexOf(v);
  let L = pdsLum(c);
  for (let i = 0; i < 14 && L > 0.34 && L < 0.52; i++) {
    c = pdsShade(c, L >= 0.42 ? 0.05 : -0.05);
    L = pdsLum(c);
  }
  return c;
}

/* ─── Fixtures ────────────────────────────────────────────────────────────
 *   Everything that used to be a hardcoded path inside PDS_SCENES lives here
 *   instead, as a KIND with default geometry. An instance owns its own
 *   x/y/w/h/rot/color/label, so the comptoir can be deleted, the cuisine can
 *   be resized and the entrance can be dragged to another wall — none of
 *   which was expressible while they were artwork.
 *
 *   `draw` returns the body. Two strategies, and the choice is not cosmetic:
 *     • 'box'  → a CSS box (background/border/overlay). CSS backgrounds tile
 *                and borders keep their width, so a box survives any resize
 *                undistorted. Correct for areas, counters, walls, rugs.
 *     • 'svg'  → an inline SVG whose viewBox is generated from the
 *                instance's OWN w/h, so one SVG unit is one logical unit and
 *                geometry is authored in real dimensions. Distortion is
 *                impossible by construction, which is what went wrong when
 *                the scenes stretched a fixed viewBox to fit.
 *   Labels are always an HTML overlay, never inside the SVG — SVG text
 *   scales with the shape and turns into a smear on a wide fixture.        */
const PDS_FIX = {
  comptoir: {
    grp: 'service', w: 460, h: 56, color: '#2A332A', blocking: 1, label: 'COMPTOIR',
    minW: 80, minH: 28, render: 'box',
    draw: (o, c) => ({
      bg: `linear-gradient(180deg, ${pdsShade(c, .06)} 0%, ${c} 46%, ${pdsShade(c, -.05)} 100%)`,
      border: `1px solid ${pdsShade(c, -.1)}`, radius: 4,
      /* brass rail along the customer edge + a worktop highlight */
      overlay: `linear-gradient(180deg, transparent calc(100% - 5px), #BFA86A calc(100% - 5px), #8E6C3A 100%),
                linear-gradient(180deg, rgba(255,255,255,.16) 0 2px, transparent 2px)`,
    }),
  },
  cuisine: {
    grp: 'service', w: 200, h: 300, color: '#EFE7D6', blocking: 1, label: 'CUISINE',
    minW: 60, minH: 60, render: 'box',
    draw: (o, c) => ({
      bg: c, border: `1.5px dashed ${pdsShade(c, -.32)}`, radius: 6,
      overlay: `repeating-linear-gradient(45deg, rgba(0,0,0,.045) 0 6px, transparent 6px 14px)`,
    }),
  },
  passe: {
    grp: 'service', w: 150, h: 18, color: '#BFA86A', blocking: 0, label: '',
    minW: 30, minH: 8, render: 'box',
    draw: (o, c) => ({ bg: c, border: `1px solid ${pdsShade(c, -.18)}`, radius: 3 }),
  },
  caisse: {
    grp: 'service', w: 74, h: 52, color: '#1F2820', blocking: 1, label: 'POS',
    minW: 28, minH: 24, render: 'box',
    draw: (o, c) => ({
      bg: c, border: `1px solid ${pdsShade(c, .1)}`, radius: 5,
      overlay: `linear-gradient(180deg, rgba(125,242,176,.5) 0 3px, transparent 3px)`,
    }),
  },
  vitrine: {
    grp: 'service', w: 130, h: 62, color: '#BFD9E8', blocking: 1, label: '',
    minW: 40, minH: 26, render: 'box',
    draw: (o, c) => ({
      bg: `linear-gradient(180deg, ${pdsShade(c, .08)}, ${c})`,
      border: `1.5px solid ${pdsShade(c, -.24)}`, radius: 4,
      overlay: `repeating-linear-gradient(90deg, rgba(255,255,255,.5) 0 1px, transparent 1px 30px)`,
    }),
  },

  mur: {
    grp: 'archi', w: 240, h: 12, color: '#2C2520', blocking: 1, label: '',
    minW: 16, minH: 4, render: 'box',
    draw: (o, c) => ({ bg: c, border: 'none', radius: 1 }),
  },
  porte: {
    grp: 'archi', w: 92, h: 14, color: '#0B6E4F', blocking: 0, label: '',
    minW: 30, minH: 6, render: 'svg',
    /* Swing arc drawn in the instance's own units, so a wider doorway gets a
       wider arc instead of an ellipse. */
    draw: (o, c, g) => `
      <path d="M2 ${g.h - 2} A ${g.w - 4} ${g.w - 4} 0 0 1 ${g.w - 2} ${g.h - 2}"
            fill="none" stroke="${c}" stroke-width="1.4" stroke-dasharray="4 3" opacity=".62"/>
      <rect x="0" y="${g.h - 4}" width="${g.w}" height="4" rx="1.5" fill="${c}"/>`,
  },
  fenetre: {
    grp: 'archi', w: 140, h: 10, color: '#BFD9E8', blocking: 0, label: '',
    minW: 24, minH: 4, render: 'box',
    draw: (o, c) => ({
      bg: c, border: `1px solid ${pdsShade(c, -.3)}`, radius: 1,
      overlay: `repeating-linear-gradient(90deg, ${pdsShade(c, -.3)} 0 1px, transparent 1px 34px)`,
    }),
  },
  colonne: {
    grp: 'archi', w: 30, h: 30, color: '#2C2520', blocking: 1, label: '',
    minW: 10, minH: 10, render: 'svg',
    draw: (o, c, g) => `
      <rect x="0" y="0" width="${g.w}" height="${g.h}" rx="3" fill="${c}"/>
      <rect x="${g.w * .22}" y="${g.h * .22}" width="${g.w * .56}" height="${g.h * .56}"
            rx="2" fill="none" stroke="${pdsShade(c, .18)}" stroke-width="1"/>`,
  },
  escalier: {
    grp: 'archi', w: 130, h: 96, color: '#CFC0A6', blocking: 1, label: '',
    minW: 40, minH: 34, render: 'svg',
    /* Tread count derived from depth: a taller stair gets more treads rather
       than the same treads stretched. */
    draw: (o, c, g) => {
      const n = Math.max(3, Math.min(12, Math.round(g.h / 15)));
      const step = g.h / n;
      let t = `<rect x="0" y="0" width="${g.w}" height="${g.h}" rx="3" fill="${c}"/>`;
      for (let i = 1; i < n; i++) {
        t += `<line x1="0" y1="${(step * i).toFixed(1)}" x2="${g.w}" y2="${(step * i).toFixed(1)}"
              stroke="${pdsShade(c, -.24)}" stroke-width="1"/>`;
      }
      const ax = g.w / 2, top = g.h * .18, bot = g.h * .82;
      t += `<path d="M${ax} ${bot} L${ax} ${top} M${ax} ${top} l${-g.w * .09} ${g.h * .1}
            M${ax} ${top} l${g.w * .09} ${g.h * .1}" fill="none"
            stroke="${pdsShade(c, -.42)}" stroke-width="1.6" stroke-linecap="round"/>`;
      return t;
    },
  },
  wc: {
    grp: 'archi', w: 92, h: 92, color: '#E0D7C4', blocking: 1, label: 'WC',
    minW: 34, minH: 34, render: 'box',
    draw: (o, c) => ({ bg: c, border: `1.5px solid ${pdsShade(c, -.28)}`, radius: 4 }),
  },

  banquette: {
    grp: 'salle', w: 260, h: 66, color: '#8A6A45', blocking: 1, label: '',
    minW: 60, minH: 30, render: 'svg',
    /* Cushion count follows length, so a long banquette reads as a bench and
       not as one enormous pillow. */
    draw: (o, c, g) => {
      const n = Math.max(1, Math.round(g.w / 84));
      const pad = 3, cw = (g.w - pad * (n + 1)) / n;
      let t = `<rect x="0" y="0" width="${g.w}" height="${g.h}" rx="5" fill="${pdsShade(c, -.12)}"/>`;
      for (let i = 0; i < n; i++) {
        t += `<rect x="${(pad + i * (cw + pad)).toFixed(1)}" y="${pad}" width="${cw.toFixed(1)}"
              height="${(g.h - pad * 2).toFixed(1)}" rx="4" fill="${c}"/>`;
      }
      t += `<rect x="0" y="0" width="${g.w}" height="${Math.min(7, g.h * .16).toFixed(1)}"
            rx="3" fill="${pdsShade(c, -.2)}"/>`;
      return t;
    },
  },
  claustra: {
    grp: 'salle', w: 200, h: 16, color: '#C9A46B', blocking: 1, label: '',
    minW: 40, minH: 8, render: 'box',
    draw: (o, c) => ({
      bg: c, border: `1px solid ${pdsShade(c, -.2)}`, radius: 3,
      overlay: `repeating-linear-gradient(90deg, ${pdsShade(c, -.26)} 0 2px, transparent 2px 11px)`,
    }),
  },
  plante: {
    grp: 'salle', w: 46, h: 46, color: '#0B6E4F', blocking: 1, label: '',
    minW: 16, minH: 16, render: 'svg',
    draw: (o, c, g) => {
      const cx = g.w / 2, potH = g.h * .34, potW = g.w * .46;
      return `
      <ellipse cx="${cx}" cy="${g.h * .40}" rx="${g.w * .46}" ry="${g.h * .34}" fill="${c}"/>
      <ellipse cx="${cx - g.w * .17}" cy="${g.h * .33}" rx="${g.w * .25}" ry="${g.h * .20}" fill="${pdsShade(c, .12)}"/>
      <ellipse cx="${cx + g.w * .16}" cy="${g.h * .30}" rx="${g.w * .21}" ry="${g.h * .17}" fill="${pdsShade(c, .06)}"/>
      <path d="M${cx - potW / 2} ${g.h - potH} L${cx + potW / 2} ${g.h - potH}
               L${cx + potW * .38} ${g.h} L${cx - potW * .38} ${g.h} Z" fill="#B0763F"/>
      <rect x="${cx - potW / 2}" y="${g.h - potH}" width="${potW}"
            height="${Math.min(4, potH * .3).toFixed(1)}" fill="#C98A4E"/>`;
    },
  },
  tapis: {
    grp: 'salle', w: 260, h: 180, color: '#C4784F', blocking: 0, label: '',
    minW: 40, minH: 40, render: 'box',
    draw: (o, c) => ({
      bg: c, border: `3px solid ${pdsShade(c, -.16)}`, radius: 2, opacity: .55,
      overlay: `repeating-linear-gradient(45deg, rgba(255,255,255,.14) 0 5px, transparent 5px 12px)`,
    }),
  },
  garde: {
    grp: 'salle', w: 300, h: 10, color: '#BFA86A', blocking: 1, label: '',
    minW: 30, minH: 4, render: 'box',
    draw: (o, c) => ({
      bg: c, border: 'none', radius: 5,
      overlay: `repeating-linear-gradient(90deg, ${pdsShade(c, -.3)} 0 2px, transparent 2px 22px)`,
    }),
  },
  texte: {
    grp: 'salle', w: 140, h: 30, color: '#2C2520', blocking: 0, label: 'TEXTE',
    minW: 40, minH: 16, render: 'none',
    draw: () => ({}),
  },
};
const PDS_FIX_GRP = { service: 'Service', archi: 'Architecture', salle: 'Salle' };

/* Instance-first geometry. THE fix for "you cannot resize anything": size and
   seat count used to be read from PDS_TABLE_TYPES[t.type] / PDS_EL_TYPES[e.type],
   i.e. owned by the KIND, so a resize had nowhere to be stored and every table
   of a type was locked to one size. Now the instance wins and the kind is only
   a source of defaults for newly-created objects. */
function pdsGeom(o) {
  const def = PDS_TABLE_TYPES[o.type] || PDS_FIX[o.type] || {};
  const w = Math.max(8, +o.w || def.w || 80);
  const h = Math.max(8, +o.h || def.h || 80);
  const seats = (o.seats != null) ? +o.seats : (def.seats || 0);
  return { w, h, seats, shape: o.shape || def.shape || 'rect', def };
}
function pdsColor(o) {
  const def = PDS_TABLE_TYPES[o.type] || PDS_FIX[o.type] || {};
  /* Tables default to sand, not bone: the floor is bone, and a bone table on
     a bone floor reads as a smudge. */
  return o.color || def.color || (PDS_TABLE_TYPES[o.type] ? '#EFE7D6' : '#FBF7EE');
}
/* Relative luminance, shared by pdsInk and the chair tone. */
function pdsLum(hex) {
  const h = String(hex || '#FBF7EE').replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const v = [0, 2, 4].map(i => {
    const s = parseInt(n.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
/* Chairs must stay visible against BOTH the tabletop and the floor. Shading
   the table colour by a fixed amount fails at the ends of the ramp — a bone
   table shaded 6% is still bone. Push away from the table's luminance
   instead, so the delta is guaranteed at either end. */
function pdsChairTone(c) {
  const light = pdsLum(c) > 0.34;
  return {
    pad:  pdsShade(c, light ? -0.26 : 0.20),
    back: pdsShade(c, light ? -0.40 : 0.32),
    lip:  pdsShade(c, light ? -0.14 : 0.30),
  };
}

/* ─── Room shell ──────────────────────────────────────────────────────────
 *   Replaces PDS_SCENES entirely. The room is now four editable properties
 *   instead of one of six frozen drawings, which is what makes "change the
 *   colour of the restaurant" a two-click operation.                       */
function pdsRoom(zone) {
  const r = (zone && zone.room) || {};
  return {
    floor:   r.floor   || '#FBF7EE',
    wall:    r.wall    || '#2C2520',
    finish:  r.finish  || 'terrazzo',
    wallW:   (r.wallW != null) ? +r.wallW : 2,
    /* The void around the room was the one surface with no control on it.
       Null means "inherit the drawer's own paper", which is the old look. */
    backdrop: r.backdrop || null,
  };
}
function pdsRoomShell(zone) {
  const r = pdsRoom(zone);
  const pat = PDS_FLOORS[r.finish] || '';
  const size = PDS_FLOOR_SIZE[r.finish] || 'auto';
  /* Le mur reste la première couche — c'est le réglage du commerçant, épaisseur
     et couleur comprises. Les deux suivantes creusent la pièce : sans elles les
     tables, qui portent désormais leur propre ombre, flottent sur un aplat. Il
     faut que ce soit ici et non dans la feuille de style, qu'un style en ligne
     l'emporte toujours. */
  return `<div class="pds-floor" data-pds-floor style="
    background-color:${r.floor};
    ${pat ? `background-image:${pat.replace(/\s+/g, ' ')}; background-size:${size};` : ''}
    box-shadow: inset 0 0 0 ${r.wallW}px ${r.wall},
                inset 0 26px 48px -34px rgba(20,15,10,0.62),
                inset 0 -18px 40px -32px rgba(20,15,10,0.45);
  "></div>`;
}

const PDS_TABLE_TYPES = {
  round2:  { shape: 'round', seats: 2, w: 72,  h: 72,  label: (T) => `${T.tRound} 2` },
  round4:  { shape: 'round', seats: 4, w: 88,  h: 88,  label: (T) => `${T.tRound} 4` },
  round6:  { shape: 'round', seats: 6, w: 104, h: 104, label: (T) => `${T.tRound} 6` },
  round8:  { shape: 'round', seats: 8, w: 120, h: 120, label: (T) => `${T.tRound} 8` },
  sq2:     { shape: 'square', seats: 2, w: 72,  h: 72,  label: (T) => `${T.tSquare} 2` },
  sq4:     { shape: 'square', seats: 4, w: 88,  h: 88,  label: (T) => `${T.tSquare} 4` },
  rect4:   { shape: 'rect', seats: 4,  w: 112, h: 64, label: (T) => `${T.tRect} 4` },
  rect6:   { shape: 'rect', seats: 6,  w: 144, h: 64, label: (T) => `${T.tRect} 6` },
  rect8:   { shape: 'rect', seats: 8,  w: 176, h: 64, label: (T) => `${T.tRect} 8` },
  rect10:  { shape: 'rect', seats: 10, w: 208, h: 64, label: (T) => `${T.tRect} 10` },
  bar:     { shape: 'rect', seats: 1, w: 56, h: 56, label: (T) => T.tBar },
  high:    { shape: 'round', seats: 2, w: 64, h: 64, label: (T) => T.tHigh },
};

/* Chair band: chairs live OUTSIDE the table footprint, so every table cell is
   inflated by PDS_PAD on all four sides and the SVG viewBox is offset to
   match. The stored x/y therefore still means "top-left of the tabletop",
   unchanged from v1, and rotation still spins about the tabletop centre
   because the inflation is symmetric. */
const PDS_PAD = 19;

function pdsEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function pdsSeatSlots(w, h, n) {
  const cap = s => Math.max(1, Math.floor(s / 46));
  const sides = [
    { k: 'top', len: w }, { k: 'bottom', len: w },
    { k: 'left', len: h }, { k: 'right', len: h },
  ];
  const alloc = { top: 0, bottom: 0, left: 0, right: 0 };
  for (let i = 0; i < n; i++) {
    let best = null, bestRatio = Infinity;
    for (const s of sides) {
      const c = cap(s.len);
      if (alloc[s.k] >= c) continue;
      const ratio = alloc[s.k] / c;
      if (ratio < bestRatio - 1e-9) { bestRatio = ratio; best = s; }
    }
    if (!best) break;   /* table is physically full — stop rather than overlap */
    alloc[best.k]++;
  }
  return alloc;
}

function pdsChair(x, y, deg, c) {
  const t = pdsChairTone(c);
  /* L'assise se décolle du plateau de 1,5 unité : collée au bord, elle lisait
   * comme une excroissance de la table plutôt que comme un siège. L'ombre de
   * contact est portée par le dossier, pas par l'assise — c'est lui qui est le
   * plus haut, et c'est ce décalage qui donne l'épaisseur. */
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})">
    <rect x="-8" y="-16.2" width="16" height="15.4" rx="4" fill="rgba(20,15,10,0.10)"/>
    <rect x="-8" y="-17" width="16" height="4.2" rx="2.1" fill="${t.back}"/>
    <rect x="-7" y="-13.5" width="14" height="12" rx="3.6" fill="${t.pad}"/>
    <rect x="-7" y="-13.5" width="14" height="2.6" rx="1.3" fill="${t.lip}" opacity=".85"/>
  </g>`;
}

function pdsChairsFor(g, seats, c) {
  if (!seats || seats < 1) return '';
  const { w, h, shape } = g;
  if (shape === 'round') {
    /* Anchor on the ellipse, chair rotated to face the centre. */
    const rx = w / 2, ry = h / 2, cx = rx, cy = ry;
    let out = '';
    for (let i = 0; i < seats; i++) {
      const phi = (-90 + (360 * i) / seats) * Math.PI / 180;
      out += pdsChair(cx + rx * Math.cos(phi), cy + ry * Math.sin(phi),
                      (-90 + (360 * i) / seats) + 90, c);
    }
    return out;
  }
  const a = pdsSeatSlots(w, h, seats);
  let out = '';
  const along = (n, len) => Array.from({ length: n }, (_, j) => (len * (j + 1)) / (n + 1));
  along(a.top, w).forEach(px => { out += pdsChair(px, 0, 0, c); });
  along(a.bottom, w).forEach(px => { out += pdsChair(px, h, 180, c); });
  along(a.left, h).forEach(py => { out += pdsChair(0, py, -90, c); });
  along(a.right, h).forEach(py => { out += pdsChair(w, py, 90, c); });
  return out;
}

function pdsBoxStyle(d, c) {
  const isGrad = /gradient\(/.test(String(d.bg || ''));
  const layers = [];
  if (d.overlay) layers.push(String(d.overlay).replace(/\s+/g, ' '));
  if (isGrad) layers.push(String(d.bg).replace(/\s+/g, ' '));
  return `background-color:${isGrad ? c : (d.bg || c)};
    ${layers.length ? `background-image:${layers.join(',')};` : ''}
    border:${d.border || 'none'};
    border-radius:${d.radius != null ? d.radius : 0}px;
    ${d.opacity != null ? `opacity:${d.opacity};` : ''}`;
}

const PDS_STATUS_RING = {
  free:     { s: '#B9B2A4', w: 1.4, dash: '' },
  occupied: { s: '#0B6E4F', w: 2.6, dash: '' },
  reserved: { s: '#C99A2B', w: 2.6, dash: '' },
  cleaning: { s: '#6A7A88', w: 2.4, dash: '5 4' },
};

/* The tabletop itself: contact shadow, edge, top, and the status ring.
 *   Lives here rather than in the dashboard's renderer because the caisse
 *   draws the same tables — with service statuses instead of design ones, so
 *   the ring is passed in rather than looked up. The viewBox the caller
 *   supplies is in the table's OWN units, so nothing here can distort. */
function pdsTableBody(g, c, ring, opts) {
  /* `flat` aplanit l'éclairage du plateau : la vue nuit du dashboard veut du
   * charbon au trait, pas du bois éclairé plein jour. Optionnel et inerte par
   * défaut — la caisse continue d'appeler à trois arguments et ne change pas. */
  const flat = !!(opts && opts.flat);
  const light = pdsLum(c) > 0.34;
  const edge = pdsShade(c, flat ? (light ? -0.10 : 0.11) : (light ? -0.22 : 0.16));
  const lit  = pdsShade(c, flat ? (light ? 0.05 : 0.06) : (light ? 0.13 : 0.26));
  const foot = pdsShade(c, light ? -0.08 : -0.03);
  const dash = ring.dash ? `stroke-dasharray="${ring.dash}"` : '';

  /* Un dégradé par couleur, partagé par toutes les tables qui la portent : deux
   * <defs> ne peuvent entrer en collision qu'entre définitions identiques, et
   * objectBoundingBox laisse une seule définition habiller toutes les tailles.
   * C'est ce qui remplace l'aplat — un plateau lit sa lumière par le haut. */
  const key = 'pdsTop' + String(c).replace(/[^0-9a-zA-Z]/g, '');
  const defs = `<defs><linearGradient id="${key}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${lit}"/><stop offset=".54" stop-color="${c}"/>` +
    `<stop offset="1" stop-color="${foot}"/></linearGradient></defs>`;

  /* Le halo dit le statut de loin, là où un trait de 2,6 px se perd. Il est
   * dessiné SOUS le plateau, donc seul son débord se voit. `glow:false` le
   * coupe pour un appelant qui n'en veut pas ; une bague fine (libre) n'en a
   * pas — sinon chaque table du plan brillerait et plus rien ne ressortirait. */
  const glow = ring.glow !== false && ring.w >= 2;

  if (g.shape === 'round') {
    const rx = g.w / 2, ry = g.h / 2;
    return defs + `
      ${glow ? `<ellipse cx="${rx}" cy="${ry}" rx="${rx + 4.5}" ry="${ry + 4.5}" fill="none" stroke="${ring.s}" stroke-width="7" opacity=".10"/>
      <ellipse cx="${rx}" cy="${ry}" rx="${rx + 1.6}" ry="${ry + 1.6}" fill="none" stroke="${ring.s}" stroke-width="3.2" opacity=".17"/>` : ''}
      <ellipse cx="${rx}" cy="${ry + 6}" rx="${rx + 1}" ry="${ry}" fill="rgba(20,15,10,0.07)"/>
      <ellipse cx="${rx}" cy="${ry + 2.5}" rx="${rx}" ry="${ry}" fill="rgba(20,15,10,0.13)"/>
      <ellipse cx="${rx}" cy="${ry}" rx="${rx}" ry="${ry}" fill="${edge}"/>
      <ellipse cx="${rx}" cy="${ry}" rx="${Math.max(1, rx - 2)}" ry="${Math.max(1, ry - 2)}" fill="url(#${key})"/>
      <ellipse cx="${rx}" cy="${ry}" rx="${Math.max(1, rx - 3.2)}" ry="${Math.max(1, ry - 3.2)}"
               fill="none" stroke="${light ? '#FFFFFF' : 'rgba(255,255,255,0.5)'}" stroke-width="1" opacity="${light ? '.5' : '.22'}"/>
      <ellipse cx="${rx}" cy="${ry}" rx="${Math.max(1, rx - ring.w / 2)}" ry="${Math.max(1, ry - ring.w / 2)}"
               fill="none" stroke="${ring.s}" stroke-width="${ring.w}" ${dash}/>`;
  }
  const r = Math.min(9, g.w / 6, g.h / 6);
  return defs + `
    ${glow ? `<rect x="-4.5" y="-4.5" width="${g.w + 9}" height="${g.h + 9}" rx="${r + 4.5}" fill="none" stroke="${ring.s}" stroke-width="7" opacity=".10"/>
    <rect x="-1.6" y="-1.6" width="${g.w + 3.2}" height="${g.h + 3.2}" rx="${r + 1.6}" fill="none" stroke="${ring.s}" stroke-width="3.2" opacity=".17"/>` : ''}
    <rect x="-1" y="6" width="${g.w + 2}" height="${g.h}" rx="${r + 1}" fill="rgba(20,15,10,0.07)"/>
    <rect x="0" y="2.5" width="${g.w}" height="${g.h}" rx="${r}" fill="rgba(20,15,10,0.13)"/>
    <rect x="0" y="0" width="${g.w}" height="${g.h}" rx="${r}" fill="${edge}"/>
    <rect x="1.5" y="1.5" width="${Math.max(1, g.w-3)}" height="${Math.max(1, g.h-3)}" rx="${Math.max(0, r-1)}" fill="url(#${key})"/>
    <rect x="2.6" y="2.6" width="${Math.max(1, g.w-5.2)}" height="${Math.max(1, g.h-5.2)}" rx="${Math.max(0, r-2)}"
          fill="none" stroke="${light ? '#FFFFFF' : 'rgba(255,255,255,0.5)'}" stroke-width="1" opacity="${light ? '.5' : '.22'}"/>
    <rect x="${ring.w/2}" y="${ring.w/2}" width="${Math.max(1, g.w-ring.w)}" height="${Math.max(1, g.h-ring.w)}"
          rx="${Math.max(0, r-ring.w/2)}" fill="none" stroke="${ring.s}" stroke-width="${ring.w}" ${dash}/>`;
}

/* A fixture's body, for either surface. Mirrors the dashboard renderer minus
   selection chrome. */
function pdsFixtureHTML(e, opts) {
  const K = PDS_FIX[e.type];
  if (!K) return '';
  const g = pdsGeom(e), c = pdsColor(e);
  const label = (e.label != null ? e.label : (K.label || ''));
  let inner = '', boxStyle = '';
  if (K.render === 'svg') {
    inner = `<svg class="pds-el-svg" viewBox="0 0 ${g.w} ${g.h}" aria-hidden="true">${K.draw(e, c, g)}</svg>`;
  } else if (K.render === 'box') {
    boxStyle = pdsBoxStyle(K.draw(e, c, g) || {}, c);
  }
  const cls = (opts && opts.cls) || 'pds-el';
  return `<div class="${cls} ${cls}-${e.type}" style="left:${e.x}px; top:${e.y}px;
      width:${g.w}px; height:${g.h}px; transform:rotate(${e.rot||0}deg); z-index:${10 + (e.z||0)};">
    <div class="pds-el-fill" style="${boxStyle}">${inner}</div>
    ${label ? `<span class="pds-el-label" style="color:${pdsInk(c)};">${pdsEsc(label)}</span>` : ''}
  </div>`;
}

/* ─── Ambiances ───────────────────────────────────────────────────────────
 *   Forty individual colour decisions reliably produce an ugly room; four
 *   curated ones produce a room that looks designed. Each ambiance sets the
 *   floor, walls, finish, backdrop and a material per furniture family in
 *   one go, and every value is an existing PDS_MAT token — an ambiance
 *   re-chooses inside the brand palette, it never widens it.
 *
 *   Per-object colour still wins: applying an ambiance only rewrites objects
 *   that never had a colour set by hand (o.colorLock), so a merchant who
 *   deliberately painted the bar red keeps their red. */
const PDS_AMBIANCE = {
  riad: {
    room: { floor: '#CFC0A6', wall: '#8A6A45', finish: 'zellige' },
    backdrop: '#3A3128',
    table: '#C9A46B',
    fix: { comptoir: '#8A6A45', cuisine: '#EFE7D6', banquette: '#C4784F',
           tapis: '#C4784F', claustra: '#BFA86A', colonne: '#8A6A45', mur: '#8A6A45' },
  },
  marine: {
    room: { floor: '#FBF7EE', wall: '#E0D7C4', finish: 'carreaux' },
    backdrop: '#7A9E8E',
    table: '#E0D7C4',
    fix: { comptoir: '#7A9E8E', cuisine: '#FBF7EE', banquette: '#7A9E8E',
           tapis: '#7A9E8E', claustra: '#E0D7C4', colonne: '#E0D7C4', mur: '#E0D7C4' },
  },
  bistrot: {
    room: { floor: '#8A6A45', wall: '#2A2A28', finish: 'bois' },
    backdrop: '#141A16',
    table: '#3A3128',
    fix: { comptoir: '#2A2A28', cuisine: '#E0D7C4', banquette: '#3A3128',
           tapis: '#8A6A45', claustra: '#BFA86A', colonne: '#2A2A28', mur: '#2A2A28' },
  },
  jardin: {
    room: { floor: '#E0D7C4', wall: '#7A9E8E', finish: 'terrazzo' },
    backdrop: '#053B2C',
    table: '#EFE7D6',
    fix: { comptoir: '#7A9E8E', cuisine: '#FBF7EE', banquette: '#7A9E8E',
           tapis: '#7A9E8E', claustra: '#C9A46B', colonne: '#E0D7C4', mur: '#7A9E8E' },
  },
};

/* Apply an ambiance to one zone. Returns false for an unknown key rather
   than half-painting the room. */
function pdsApplyAmbiance(state, zoneId, key) {
  const A = PDS_AMBIANCE[key];
  if (!A) return false;
  const zone = state.zones.find(z => z.id === zoneId);
  if (!zone) return false;
  zone.room = Object.assign({}, zone.room, A.room, { backdrop: A.backdrop });
  zone.ambiance = key;
  state.tables.filter(t => t.zone === zoneId && !t.colorLock)
    .forEach(t => { t.color = A.table; });
  state.elements.filter(e => e.zone === zoneId && !e.colorLock)
    .forEach(e => { if (A.fix[e.type]) e.color = A.fix[e.type]; });
  return true;
}

/* ─── Collision ───────────────────────────────────────────────────────────
 *   "Make it impossible to stack tables" is right, but a blanket no-overlap
 *   rule breaks the two cases a restaurant actually needs: a tapis is MEANT
 *   to have tables standing on it, and a banquette is MEANT to have tables
 *   pushed flat against it. So the rule is per class, not global.
 *
 *     solid     tables, cuisine, comptoir, caisse, vitrine, wc, escalier,
 *               colonne, plante — may never interpenetrate another solid.
 *     underlay  tapis, texte — never blocks anything, nothing blocks it.
 *     abutting  mur, banquette, claustra, garde, fenetre, passe — a solid may
 *               touch it (zero gap) but not pass through.
 *     portal    porte — sits IN a wall, and keeps a clear approach in front.
 *
 *   The collision body of a TABLE meeting another solid is the tabletop plus
 *   its chair band: two tables 5 units apart do not overlap geometrically,
 *   but nobody can sit between them, so a purely geometric test would bless
 *   a plan that cannot be served. Against an `abutting` piece the band is
 *   dropped — sharing it with a banquette is the entire point of a banquette.
 */
const PDS_CLS = {
  tapis: 'underlay', texte: 'underlay',
  mur: 'abutting', banquette: 'abutting', claustra: 'abutting',
  garde: 'abutting', fenetre: 'abutting', passe: 'abutting',
  porte: 'portal',
};
/* Clear approach a doorway keeps in front of itself, on its swing side. */
const PDS_PORTAL_FAN = 90;

function pdsCls(o) {
  if (!o) return 'solid';
  if (PDS_TABLE_TYPES[o.type]) return 'solid';
  return PDS_CLS[o.type] || 'solid';
}
function pdsIsTable(o) { return !!(o && PDS_TABLE_TYPES[o.type]); }

/* The four corners of a rotated box, in floor coordinates. */
function pdsCorners(x, y, w, h, deg) {
  const r = (deg || 0) * Math.PI / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  const cx = x + w / 2, cy = y + h / 2;
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([px, py]) => [cx + px * cos - py * sin, cy + px * sin + py * cos]);
}

/* Separating-axis test for two convex quads. Exact for rectangles at any
   angle — an axis-aligned bounding box would refuse legal placements for a
   table turned 45°, whose AABB is 41% larger than the table. */
function pdsObbOverlap(A, B) {
  for (const box of [A, B]) {
    for (let i = 0; i < 2; i++) {
      const p1 = box[i], p2 = box[i + 1];
      const ax = -(p2[1] - p1[1]), ay = p2[0] - p1[0];
      const len = Math.hypot(ax, ay) || 1;
      const nx = ax / len, ny = ay / len;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const p of A) { const d = p[0] * nx + p[1] * ny; if (d < aMin) aMin = d; if (d > aMax) aMax = d; }
      for (const p of B) { const d = p[0] * nx + p[1] * ny; if (d < bMin) bMin = d; if (d > bMax) bMax = d; }
      /* A hair of tolerance so "pushed flat against" is legal, not a 0.0001 overlap. */
      if (aMax - bMin <= 0.5 || bMax - aMin <= 0.5) return false;
    }
  }
  return true;
}

/* How far this object's body is inflated when tested against `other`. */
function pdsInflate(o, other) {
  return (pdsCls(o) === 'solid' && pdsCls(other) === 'solid' && pdsIsTable(o)) ? PDS_PAD : 0;
}
function pdsBodyOf(o, pad, at) {
  const g = pdsGeom(o);
  const x = (at ? at.x : o.x) - pad;
  const y = (at ? at.y : o.y) - pad;
  const w = (at && at.w != null ? at.w : g.w) + pad * 2;
  const h = (at && at.h != null ? at.h : g.h) + pad * 2;
  return pdsCorners(x, y, w, h, at && at.rot != null ? at.rot : o.rot);
}
/* A door's keep-clear box: its own footprint extended by the fan on the side
   the leaf swings to, which is local −y (the arc in PDS_FIX.porte). */
function pdsPortalBody(o, at) {
  const g = pdsGeom(o);
  const w = (at && at.w != null ? at.w : g.w);
  const h = (at && at.h != null ? at.h : g.h);
  const x = (at ? at.x : o.x), y = (at ? at.y : o.y);
  const rot = at && at.rot != null ? at.rot : o.rot;
  /* Grow upward in local space: same centre shifted −fan/2 along local y. */
  const r = (rot || 0) * Math.PI / 180;
  const cx = x + w / 2 - Math.sin(r) * (-PDS_PORTAL_FAN / 2);
  const cy = y + h / 2 + Math.cos(r) * (-PDS_PORTAL_FAN / 2);
  const H = h + PDS_PORTAL_FAN;
  return pdsCorners(cx - w / 2, cy - H / 2, w, H, rot);
}

/* Do these two objects conflict? `at` overrides a's position/size/rotation,
   so a drag can ask "would it conflict THERE" without mutating anything. */
function pdsConflict(a, b, at) {
  if (!a || !b || a.id === b.id) return false;
  const ca = pdsCls(a), cb = pdsCls(b);
  if (ca === 'underlay' || cb === 'underlay') return false;
  if (ca === 'portal' && cb === 'portal') return false;
  if (ca === 'portal' || cb === 'portal') {
    const pIsA = ca === 'portal';
    const other = pIsA ? b : a;
    /* A door belongs in a wall — architecture never blocks it. */
    if (pdsCls(other) === 'abutting') return false;
    const portalBox = pIsA ? pdsPortalBody(a, at) : pdsPortalBody(b, null);
    const otherBox  = pIsA ? pdsBodyOf(b, 0, null) : pdsBodyOf(a, 0, at);
    return pdsObbOverlap(portalBox, otherBox);
  }
  return pdsObbOverlap(pdsBodyOf(a, pdsInflate(a, b), at), pdsBodyOf(b, pdsInflate(b, a), null));
}

/* Everything on the same floor that `o` could collide with. */
function pdsNeighbours(state, o) {
  const z = o.zone != null ? o.zone : state.activeZone;
  return state.tables.concat(state.elements)
    .filter(n => n.id !== o.id && (n.zone != null ? n.zone : state.activeZone) === z);
}
/* The blockers at a candidate placement — empty array means legal. */
function pdsBlockers(state, o, at) {
  return pdsNeighbours(state, o).filter(n => pdsConflict(o, n, at));
}

/* Nearest legal spot to (x, y). Used on release so a drag that ends on top of
   something settles beside it instead of snapping back to where it started —
   the table still goes where you aimed it.
 *
 *   Two phases, because rings alone are not enough. Rings are cheap and give
 *   a genuinely nearest answer close in, but on a crowded floor the first
 *   legal spot can sit further out than any sane radius, and the angular
 *   sampling thins as r grows until it steps straight over a narrow slot.
 *   A bounded ring search that fails therefore falls through to a full sweep
 *   of the floor, so "settles beside it" holds whenever ANY legal position
 *   exists — the alternative is a table that silently springs back with no
 *   explanation, which is the behaviour this whole rule exists to remove. */
function pdsNearestFree(state, o, x, y, plane, maxR) {
  const g = pdsGeom(o);
  const w = g.w, h = g.h;
  const clamp = (px, py) => ({
    x: Math.max(0, Math.min(plane.w - w, Math.round(px))),
    y: Math.max(0, Math.min(plane.h - h, Math.round(py))),
  });
  const free = (px, py) => {
    const at = clamp(px, py);
    return pdsBlockers(state, o, at).length === 0 ? at : null;
  };
  const here = free(x, y);
  if (here) return here;

  /* Phase 1 — rings, sampled by arc length so the spacing between probes
     stays constant instead of fanning out with the radius. */
  const step = 8, R = maxR || 200;
  for (let r = step; r <= R; r += step) {
    const n = Math.max(12, Math.round(2 * Math.PI * r / 10));
    for (let i = 0; i < n; i++) {
      const rad = (i / n) * 2 * Math.PI;
      const hit = free(x + Math.cos(rad) * r, y + Math.sin(rad) * r);
      if (hit) return hit;
    }
  }

  /* Phase 2 — sweep the whole floor. Candidates are visited in order of
     distance from the drop, so the first legal one IS the nearest and the
     scan stops there; testing in raster order instead made a crowded drop
     cost ~140 ms of collision maths before it could answer. Coarser grid on
     purpose: this only runs when the neighbourhood is full, and a few units
     of imprecision beats refusing the drop. */
  const grid = 16;
  const cells = [];
  for (let py = 0; py <= plane.h - h; py += grid) {
    for (let px = 0; px <= plane.w - w; px += grid) {
      cells.push([(px - x) * (px - x) + (py - y) * (py - y), px, py]);
    }
  }
  cells.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < cells.length; i++) {
    const at = { x: cells[i][1], y: cells[i][2] };
    if (!pdsBlockers(state, o, at).length) return at;
  }
  return null;
}

/* ─── Plan generation ─────────────────────────────────────────────────────
 *   Replaces the five hard-coded templates. A template is a photograph of
 *   someone else's restaurant: it can only ever be the wrong shape, and its
 *   advertised cover count drifts from what it actually loads because the
 *   number is stored rather than counted. This builds a room from the
 *   merchant's own answers and counts what it placed, so the two can never
 *   disagree.
 *
 *   Units are centimetres — a 4-top is 88×88 cm, a service aisle is 90.
 *
 *   Three variants from the same answers, because nobody can choose between
 *   abstract descriptions but everybody can choose between three concrete
 *   plans with their real numbers on them. */
const PDS_VARIANTS = {
  dense:      { aisle: 90,  main: 120, banquette: false },
  confort:    { aisle: 120, main: 150, banquette: false },
  banquettes: { aisle: 100, main: 130, banquette: true  },
};

/* Default table mix per venue type — what that kind of room actually seats. */
const PDS_VENUE_MIX = {
  restaurant: [['rect4', 4], ['round2', 2], ['rect6', 6]],
  cafe:       [['round2', 2], ['sq2', 2], ['round4', 4]],
  snack:      [['sq4', 4], ['sq2', 2]],
  patisserie: [['round2', 2], ['sq2', 2]],
  rooftop:    [['round4', 4], ['round2', 2], ['rect6', 6]],
};

function pdsId(p) { return p + Math.random().toString(36).slice(2, 9); }

/* One zone, furnished. Architecture first, then circulation, then tables on
   whatever rectangle is left — so the aisles are a consequence of the
   layout rather than something checked afterwards. */
function pdsGenerateZone(o) {
  const W = o.w, H = o.h;
  const V = PDS_VARIANTS[o.variant] || PDS_VARIANTS.dense;
  const zone = o.zoneId;
  const tables = [], elements = [];
  const add = (type, x, y, extra) => {
    const d = PDS_FIX[type] || {};
    elements.push(Object.assign({ id: pdsId('e'), type, zone,
      x: Math.round(x), y: Math.round(y), w: d.w, h: d.h, rot: 0 }, extra || {}));
  };

  /* Usable rectangle, eaten into by each fixture as it is placed. */
  let free = { x: 0, y: 0, w: W, h: H };
  const wallBand = (wall, depth) => {
    if (wall === 'n') { const r = { x: free.x, y: free.y, w: free.w, h: depth }; free = { x: free.x, y: free.y + depth, w: free.w, h: free.h - depth }; return r; }
    if (wall === 's') { const r = { x: free.x, y: free.y + free.h - depth, w: free.w, h: depth }; free = { x: free.x, y: free.y, w: free.w, h: free.h - depth }; return r; }
    if (wall === 'w') { const r = { x: free.x, y: free.y, w: depth, h: free.h }; free = { x: free.x + depth, y: free.y, w: free.w - depth, h: free.h }; return r; }
    const r = { x: free.x + free.w - depth, y: free.y, w: depth, h: free.h };
    free = { x: free.x, y: free.y, w: free.w - depth, h: free.h }; return r;
  };

  /* 1 · Kitchen against its wall, sized to the room rather than fixed. */
  if (o.kitchen) {
    const depth = Math.max(140, Math.min(240, Math.round(Math.min(W, H) * 0.32)));
    const band = wallBand(o.kitchenWall, depth);
    const along = (o.kitchenWall === 'n' || o.kitchenWall === 's') ? 'w' : 'h';
    const span = Math.round(band[along] * 0.58);
    if (along === 'w') add('cuisine', band.x + (band.w - span) / 2, band.y, { w: span, h: depth });
    else               add('cuisine', band.x, band.y + (band.h - span) / 2, { w: depth, h: span });
    /* A pass belongs on the dining side of the kitchen, not floating. */
    if (o.venue === 'restaurant' || o.venue === 'rooftop') {
      const p = PDS_FIX.passe;
      if (along === 'w') add('passe', band.x + band.w / 2 - p.w / 2, o.kitchenWall === 'n' ? band.y + depth - p.h : band.y, { w: p.w, h: p.h });
      else add('passe', o.kitchenWall === 'w' ? band.x + depth - p.h : band.y, band.y + band.h / 2 - p.w / 2, { w: p.h, h: p.w, rot: 0 });
    }
  }

  /* 2 · Counter — the till side of the room, opposite the kitchen. */
  if (o.counter) {
    const opp = { n: 's', s: 'n', e: 'w', w: 'e' }[o.kitchenWall] || 's';
    const c = PDS_FIX.comptoir;
    const band = wallBand(opp, c.h + 20);
    const span = Math.round(Math.min(band.w, W * 0.5));
    add('comptoir', band.x + (band.w - span) / 2, band.y + 10, { w: span, h: c.h });
  }

  /* 3 · Entrance on its wall, with the approach kept clear of tables by the
     portal rule in the collision model. */
  const eDepth = 30;
  const eBand = wallBand(o.entranceWall, eDepth);
  const door = PDS_FIX.porte;
  const eRot = { n: 0, s: 180, w: 90, e: 270 }[o.entranceWall] || 0;
  if (o.entranceWall === 'n' || o.entranceWall === 's') {
    add('porte', eBand.x + eBand.w * 0.22, eBand.y + (eDepth - door.h) / 2, { w: door.w, h: door.h, rot: eRot });
  } else {
    add('porte', eBand.x + (eDepth - door.w) / 2, eBand.y + eBand.h * 0.22, { w: door.w, h: door.h, rot: eRot });
  }

  /* 4 · WC in the corner furthest from the door. */
  if (o.wc) {
    const k = PDS_FIX.wc;
    const cx = (o.entranceWall === 'w') ? W - k.w - 10 : 10;
    const cy = (o.entranceWall === 'n') ? H - k.h - 10 : 10;
    add('wc', cx, cy, { w: k.w, h: k.h });
  }

  /* 5 · Banquette along the longest free wall, for the variant that wants it. */
  let bench = null;
  if (V.banquette && free.w > 260 && free.h > 200) {
    const b = PDS_FIX.banquette;
    const horiz = free.w >= free.h;
    if (horiz) { bench = { x: free.x + 20, y: free.y, w: free.w - 40, h: b.h }; free = { x: free.x, y: free.y + b.h, w: free.w, h: free.h - b.h }; }
    else       { bench = { x: free.x, y: free.y + 20, w: b.h, h: free.h - 40 }; free = { x: free.x + b.h, y: free.y, w: free.w - b.h, h: free.h }; }
    add('banquette', bench.x, bench.y, { w: bench.w, h: bench.h });
  }

  /* 6 · Tables on a lattice sized by the variant's aisle. The mix repeats in
     order, so a 3-way mix over 10 tables gives 4/3/3 rather than 10 of one. */
  const mix = (o.mix && o.mix.length) ? o.mix : (PDS_VENUE_MIX[o.venue] || PDS_VENUE_MIX.restaurant);
  const want = Math.max(1, o.tables | 0);
  const pad = 16;   /* keep tables off the wall line itself */
  const inner = { x: free.x + pad, y: free.y + pad, w: free.w - pad * 2, h: free.h - pad * 2 };
  let placed = 0, i = 0;
  const rows = [];
  let cursorY = inner.y;
  while (placed < want && cursorY < inner.y + inner.h) {
    /* Row height is driven by the tallest table this row will hold. */
    const rowTypes = [];
    let cursorX = inner.x, rowH = 0;
    while (placed + rowTypes.length < want) {
      const [type] = mix[(i + rowTypes.length) % mix.length];
      const d = PDS_TABLE_TYPES[type];
      if (cursorX + d.w > inner.x + inner.w) break;
      rowTypes.push({ type, d, x: cursorX });
      cursorX += d.w + V.aisle;
      rowH = Math.max(rowH, d.h);
    }
    if (!rowTypes.length) break;
    if (cursorY + rowH > inner.y + inner.h) break;
    rowTypes.forEach(r => {
      tables.push({
        id: pdsId('t'), zone, type: r.type,
        x: Math.round(r.x), y: Math.round(cursorY),
        w: r.d.w, h: r.d.h, seats: r.d.seats, shape: r.d.shape,
        rot: 0, num: String(tables.length + 1 + (o.numFrom || 0)),
        status: 'free', server: null,
      });
    });
    placed += rowTypes.length;
    i += rowTypes.length;
    rows.push(rowTypes.length);
    cursorY += rowH + (rows.length === 1 ? V.main : V.aisle);
  }

  /* 7 · Decoration last, and only into space nothing else claimed. */
  if (free.w > 120 && free.h > 120 && o.venue !== 'snack') {
    const p = PDS_FIX.plante;
    add('plante', inner.x + inner.w - p.w, inner.y + inner.h - p.h, { w: p.w, h: p.h });
  }

  const covers = tables.reduce((s, t) => s + (t.seats || 0), 0);
  return { tables, elements, covers, placed, requested: want, aisle: V.aisle };
}

/* A whole venue: one zone per floor plus one per extra the merchant ticked. */
function pdsGeneratePlan(a, variant) {
  const zones = [], tables = [], elements = [];
  const specs = [];
  (a.floors || ['RDC']).forEach((name, idx) => specs.push({ name, kind: 'floor', idx }));
  (a.extras || []).forEach(name => specs.push({ name, kind: 'extra' }));

  /* Split the requested table count across zones by weight, then hand the
     rounding remainder to the main floor so the parts add up to exactly what
     the merchant asked for. The earlier version added a main-floor bonus on
     top of a full share, which quietly turned a request for 24 into 30. */
  const want = Math.max(1, a.tables || 12);
  const weightOf = (s) => s.kind === 'extra' ? 0.35 : (s.idx === 0 ? 1 : 0.6);
  const wSum = specs.reduce((s, sp) => s + weightOf(sp), 0);
  const quota = specs.map(sp => Math.max(1, Math.floor(want * weightOf(sp) / wSum)));
  let mainIdx = specs.findIndex(sp => sp.kind === 'floor' && sp.idx === 0);
  if (mainIdx < 0) mainIdx = 0;
  quota[mainIdx] += want - quota.reduce((s, q) => s + q, 0);
  if (quota[mainIdx] < 1) quota[mainIdx] = 1;

  let shortfall = 0;
  specs.forEach((spec, n) => {
    const id = 'z' + (n + 1);
    const dim = (a.dims && a.dims[spec.name]) || a.dims_default || { w: 880, h: 540 };
    zones.push({ id, name: spec.name, room: { w: dim.w, h: dim.h } });
    /* Kitchen and till belong on the main floor only — an extra zone is a
       terrace or a mezzanine, it is served FROM the main room. */
    const isMain = (n === mainIdx);
    const g = pdsGenerateZone({
      zoneId: id, w: dim.w, h: dim.h, variant,
      venue: a.venue || 'restaurant',
      tables: quota[n],
      mix: a.mix, kitchen: isMain, counter: isMain, wc: isMain && a.wc,
      kitchenWall: a.kitchenWall || 'n', entranceWall: a.entranceWall || 's',
      numFrom: tables.length,
    });
    shortfall += Math.max(0, g.requested - g.placed);
    tables.push(...g.tables);
    elements.push(...g.elements);
  });

  const covers = tables.reduce((s, t) => s + (t.seats || 0), 0);
  const area = zones.reduce((s, z) => s + (z.room.w * z.room.h), 0) / 10000;  /* cm² → m² */
  return {
    zones, tables, elements, variant,
    covers, tableCount: tables.length,
    m2PerCover: covers ? +(area / covers).toFixed(2) : 0,
    aisle: (PDS_VARIANTS[variant] || PDS_VARIANTS.dense).aisle,
    /* Surfaced, never swallowed: a room that cannot hold what was asked for
       has to say so, or the merchant reads a short plan as a broken one. */
    requested: want, shortfall,
  };
}

/* ─── Exposure ────────────────────────────────────────────────────────────
 *   pages-pro.js is an IIFE in the same global scope and picks these up by
 *   name. kiwi-caisse.html is not, so it goes through this namespace. */
window.KiwiFloorCore = {
  MAT: PDS_MAT, FLOORS: PDS_FLOORS, FLOOR_SIZE: PDS_FLOOR_SIZE,
  FIX: PDS_FIX, FIX_GRP: PDS_FIX_GRP, TABLE_TYPES: PDS_TABLE_TYPES,
  STATUS_RING: PDS_STATUS_RING, PAD: PDS_PAD,
  ink: pdsInk, shade: pdsShade, lum: pdsLum, chairTone: pdsChairTone,
  geom: pdsGeom, color: pdsColor, esc: pdsEsc,
  room: pdsRoom, roomShell: pdsRoomShell,
  seatSlots: pdsSeatSlots, chair: pdsChair, chairsFor: pdsChairsFor,
  boxStyle: pdsBoxStyle, tableBody: pdsTableBody, fixtureHTML: pdsFixtureHTML,
  AMBIANCE: PDS_AMBIANCE, applyAmbiance: pdsApplyAmbiance,
  hexOf: pdsHexOf, safeColor: pdsSafeColor,
  VARIANTS: PDS_VARIANTS, VENUE_MIX: PDS_VENUE_MIX,
  generateZone: pdsGenerateZone, generatePlan: pdsGeneratePlan,
  CLS: PDS_CLS, cls: pdsCls, isTable: pdsIsTable,
  corners: pdsCorners, obbOverlap: pdsObbOverlap,
  conflict: pdsConflict, blockers: pdsBlockers,
  neighbours: pdsNeighbours, nearestFree: pdsNearestFree,
};
