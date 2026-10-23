/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · pages-pro.js — sidebar handler upgrade pass
 *
 * Concatenation of 9 sub-agent outputs covering:
 *   Section 1: nav-accueil / nav-transactions / nav-terminaux / nav-reglements
 *              nav-conformite / nav-equipe / nav-payroll / nav-reservations
 *   Section 2 restaurant: nav-tables / nav-menu / nav-kds / nav-stock
 *   Section 2 boutique:   nav-inventory / nav-categories / nav-promos / nav-returns
 *   Section 2 spa:        nav-appointments / nav-services
 *                         nav-practitioners / nav-clients
 *
 * Loads after pages.js — overrides original handlers + adds 8 new ones.
 * Each agent's section is wrapped in its own IIFE to isolate scopes.
 *
 * Découpé le 22 octobre 2026 en quatre fichiers chargés à la suite (dashboard.html),
 * sections recopiées à l'octet :
 *   pages-pro-office.js      Section 1A et 1B (avant ce fichier)
 *   pages-pro.js             Section 2 rest A et rest B, puis le registre des
 *                            sections chargées au premier usage (les URL
 *                            littérales que tools/stamps.js lit ICI)
 *   pages-pro-boutique.js    Section 2 boutique A
 *   pages-pro-spa-starter.js Section 2 spa clients et les pages de départ
 * ─────────────────────────────────────────────────────────────────────────── */

/* ═══ Section 2 rest A · tables / menu ═══ */
(function() {
  "use strict";
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const handlers = Kiwi.handlers;
  const drawer = Kiwi.drawer;
  const fullpage = Kiwi.fullpage;
  const modal = Kiwi.modal;
  const toast = Kiwi.toast;
  const menu = Kiwi.menu;
  const confetti = Kiwi.confetti;
  /* Locale helper — every i18n lookup in this IIFE reads through trLang(). */
  const trLang = () => (window.KiwiI18n?.getLang?.() || 'fr');
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Section 2a — restaurant vertical handlers
 * Replaces (or supplements) the existing `nav-tables` and `nav-menu`
 * handlers in /Users/badrosonair/Documents/kiwi/assets/pages.js.
 *
 * APPLY:
 *   1. Append the contents of /tmp/kiwi-s2-rest-css.css to the CSS template
 *      literal at the top of pages.js (just before `</style>`).
 *   2. Replace the bodies of `handlers['nav-tables']` and `handlers['nav-menu']`
 *      in pages.js with the bodies below. Auxiliary handlers
 *      (`tables-merge`, `tables-split`, `tables-move`, `tables-new`,
 *      `menu-add`, `menu-86`, `menu-edit`, `menu-mass`, `menu-schedule`)
 *      can sit alongside in the same `handlers = { ... }` block.
 *
 * DEPENDENCIES (already on window.Kiwi):
 *   toast, modal, drawer, handlers, confetti
 * ─────────────────────────────────────────────────────────────────────────── */

/* ─── helper: wire `data-dismiss` buttons on a modal/drawer to close ─── */
function wireDismiss(m) {
  if (!m || !m.el) return;
  m.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-dismiss]')) m.close();
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1 ·  PLAN DE SALLE  ·  layout designer + server assignment + rotation
 *   Three modes share one canvas:
 *     • Layout       — drag tables, add zones, edit table props, templates
 *     • Assignation  — drag servers onto tables, color overlay, per-server stats
 *     • Rotation     — periodic rotation strategy with preview + fairness
 *   State persists in localStorage (kiwiPlanDeSalle) so refreshes survive.
 *   Resetting wipes back to the venue's default template.
 * ═══════════════════════════════════════════════════════════════════════════ */
const PDS_LS_KEY = 'kiwiPlanDeSalle';
const PDS_TRANSIENT_IDS = ['scoped', 'own'];
/* Nettoyage au chargement des anciens seaux non nommés écrits par les versions
 * antérieures : 'kiwiPlanDeSalle:scoped' et 'kiwiPlanDeSalle:own' ne doivent plus
 * jamais être lus comme source de plan. */
PDS_TRANSIENT_IDS.forEach(function (tid) {
  try { localStorage.removeItem(PDS_LS_KEY + ':' + tid); } catch (_) {}
});

function pdsTenant(vid) {
  if (window.KiwiVenue && typeof window.KiwiVenue.tenantOf === 'function') {
    return window.KiwiVenue.tenantOf(vid) || '';
  }
  if (window.KiwiVenue && typeof window.KiwiVenue.slugOf === 'function') {
    const s = window.KiwiVenue.slugOf(vid);
    if (s) return s;
  }
  if (vid === 'scoped') return '';
  try { return String(localStorage.getItem('kiwiLiveMerchant') || '').trim(); } catch (_) { return ''; }
}

/* Per-store floor plan: every store keeps its own layout under its own key.
 * Pour les identifiants transitoires ('scoped', 'own'), le seau est nommé par
 * le slug du locataire résolu ('kiwiPlanDeSalle:scoped@<slug>'). Sans slug
 * résolu, la clé retourne '' (fail-closed) : aucun cache partagé ni écriture. */
function pdsKey(id) {
  const vid = id || (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || 'default';
  const transients = (window.KiwiVenue && window.KiwiVenue.TRANSIENT_IDS) || PDS_TRANSIENT_IDS;
  if (transients.indexOf(vid) < 0) return PDS_LS_KEY + ':' + vid;
  const slug = pdsTenant(vid);
  return slug ? PDS_LS_KEY + ':' + vid + '@' + slug : '';
}
const PDS_GRID = 16;         /* snap-to-grid unit (px) */
const PDS_CANVAS_W = 880;
const PDS_CANVAS_H = 540;

/* Materials, the fixture catalogue, instance geometry and the table/chair/
   fixture drawing primitives now live in assets/floorplan-core.js, loaded
   just before this file. They are shared verbatim with the caisse so the
   till can render the owner's actual plan instead of its own guess at it. */

/* ─── Vue nuit / vue jour ─────────────────────────────────────────────────
 * Le plan est celui que promet la page d'accueil : une salle charbon, des
 * tables au trait, le statut porté par la lumière, la menthe pour la seule
 * addition demandée. La vue jour en est le miroir à l'encre.
 *
 * Le plan suit le thème du dashboard (le propriétaire, 2026-10-10 : « il
 * faut aussi un mode clair »). Une préférence propre au plan, comme
 * l'ancienne clé kiwiPdsView2, laissait la page noire sous un dashboard
 * clair : deux interrupteurs qui se contredisent. On lit donc ce que <html>
 * affiche (data-theme, que le mode fusion peint aussi), et le bouton soleil
 * du plan bascule le thème du dashboard lui-même. En nuit, la page peint
 * son fond (body.pds-dark-page) pour que la salle soit posée sur du noir. */
function pdsNoir() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}
function pdsSetNoir(on) {
  if (window.KiwiDashTheme && window.KiwiDashTheme.set) window.KiwiDashTheme.set(on ? 'dark' : 'light');
  else document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
}
/* Une matière sur la scène nuit : rabattue vers le charbon en gardant `keep`
 * de sa teinte — le noyer reste chaud, le sauge reste vert, mais tout devient
 * nocturne. Encres et chaises suivent d'elles-mêmes : pdsInk/pdsChairTone
 * raisonnent en luminance, pas en clair codé en dur. */
function pdsNoirC(hex, keep) {
  const k = keep == null ? 0.18 : keep;
  const h = String(hex || '#141A16').replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const base = [4, 5, 4];      /* #040504 — le charbon de la salle, quasi noir */
  return '#' + [0, 2, 4].map((i, j) => {
    const c = parseInt(n.slice(i, i + 2), 16) || 0;
    return Math.round(base[j] + (c - base[j]) * k).toString(16).padStart(2, '0');
  }).join('');
}
/* Même contrat que PDS_STATUS_RING (la caisse n'y touche pas), mais les
 * valeurs sont CELLES du mockup de l'accueil (SVG fp-* d'index.html) : une
 * échelle de blanc — libre 0.19, réservé 0.40 — et l'accent #00FFAE réservé
 * à l'occupée, qui seule a droit au halo et à l'anneau d'appel. Pas d'ambre :
 * le mockup n'en a pas. `fill`/`num`/`chair` suivent la même échelle. */
const PDS_STATUS_RING_NOIR = {
  /* Échelle remontée d'un cran par rapport au SVG de l'accueil : sur le sol
   * quasi noir demandé, les valeurs du mockup (0.19/0.40) lisaient trop bas.
   * Trois langages de trait pour trois états sans couleur : plein faible
   * (libre), tiret long (réservée), pointillé (à nettoyer). La distinction
   * survit au daltonisme et à la distance — c'est le motif qui parle. */
  free:     { s: 'rgba(255,255,255,0.30)', w: 1.25, dash: '',        fill: 'rgba(255,255,255,0.02)', chair: 'rgba(255,255,255,0.20)' },
  occupied: { s: '#00FFAE',                w: 1.25, dash: '',        fill: 'rgba(0,255,174,0.14)',   chair: 'rgba(0,255,174,0.70)' },
  reserved: { s: '#E8C067', w: 1.25, dash: '6 3',     fill: 'rgba(232,192,103,0.08)', chair: 'rgba(232,192,103,0.50)' },
  cleaning: { s: 'rgba(255,255,255,0.40)', w: 1.25, dash: '1.5 3.5', fill: 'rgba(255,255,255,0.02)', chair: 'rgba(255,255,255,0.20)' },
  /* The till's own five, in the till's own inks (kiwi-caisse.html, dark):
     à commander amber, en cours mint, addition rose, réglée dotted. The plan
     and the counter must read the same table the same way. Réservée moves to
     a dashed bone so it no longer shares the amber of « à commander ». */
  ordering: { s: '#E8C067', w: 1.25, dash: '',        fill: 'rgba(232,192,103,0.10)', chair: 'rgba(232,192,103,0.65)' },
  bill:     { s: '#FF7DA9', w: 1.6,  dash: '',        fill: 'rgba(255,125,169,0.14)', chair: 'rgba(255,125,169,0.70)' },
  paid:     { s: 'rgba(255,255,255,0.40)', w: 1.25, dash: '1.5 3.5', fill: 'rgba(255,255,255,0.02)', chair: 'rgba(255,255,255,0.20)' },
  out:      { s: 'rgba(255,255,255,0.18)', w: 1,    dash: '2 4',     fill: 'rgba(255,255,255,0.00)', chair: 'rgba(255,255,255,0.08)' },
};
PDS_STATUS_RING_NOIR.reserved = { s: 'rgba(242,239,230,0.72)', w: 1.25, dash: '6 3', fill: 'rgba(242,239,230,0.05)', chair: 'rgba(242,239,230,0.40)' };
/* Une matière en vue jour ligne-claire : rabattue vers le papier chaud de la
 * marque en gardant `keep` de sa teinte — un lavis, pas une peinture. Le
 * noyer devient un beige chaud, le sauge un vert pâle : la MATIÈRE choisie
 * par le commerçant reste lisible sans casser le dessin à l'encre. */
function pdsJourC(hex, keep) {
  const k = keep == null ? 0.16 : keep;
  const h = String(hex || '#B9AF9B').replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const base = [247, 245, 240];   /* #F7F5F0 — le papier de la marque */
  return '#' + [0, 2, 4].map((i, j) => {
    const c = parseInt(n.slice(i, i + 2), 16) || 0;
    return Math.round(base[j] + (c - base[j]) * k).toString(16).padStart(2, '0');
  }).join('');
}
/* Le miroir exact de l'échelle nuit, à l'encre sur papier : une échelle
 * d'encre #0A0F0D — libre 0.30, réservée 0.55 — et l'atlas #0B6E4F réservé
 * à l'occupée, qui seule a droit au halo et à l'anneau d'appel. La menthe
 * appartient à la nuit ; le jour vit en vert de la marque. */
const PDS_STATUS_RING_JOUR = {
  /* Même langage de trait que la nuit : plein faible / tiret long / pointillé.
   * La réservée s'ancre dans le riad #053B2C — encore de la marque, jamais
   * d'ambre ni de bleu. */
  free:     { s: 'rgba(10,15,13,0.30)', w: 1.25, dash: '',        fill: 'rgba(10,15,13,0.015)', chair: 'rgba(10,15,13,0.22)' },
  occupied: { s: '#0B6E4F',             w: 1.25, dash: '',        fill: 'rgba(11,110,79,0.10)', chair: 'rgba(11,110,79,0.70)' },
  reserved: { s: '#C89235',  w: 1.25, dash: '6 3',     fill: 'rgba(200,146,53,0.10)',   chair: 'rgba(200,146,53,0.55)' },
  cleaning: { s: 'rgba(10,15,13,0.45)', w: 1.25, dash: '1.5 3.5', fill: 'rgba(10,15,13,0.02)',  chair: 'rgba(10,15,13,0.24)' },
  /* Light-till inks (kiwi-caisse.html › html:not([data-caisse-theme="dark"])). */
  ordering: { s: '#C89235',             w: 1.25, dash: '',        fill: 'rgba(200,146,53,0.10)', chair: 'rgba(200,146,53,0.60)' },
  bill:     { s: '#C2456F',             w: 1.6,  dash: '',        fill: 'rgba(194,69,111,0.10)', chair: 'rgba(194,69,111,0.65)' },
  paid:     { s: 'rgba(10,15,13,0.45)', w: 1.25, dash: '1.5 3.5', fill: 'rgba(10,15,13,0.02)',  chair: 'rgba(10,15,13,0.24)' },
  out:      { s: 'rgba(10,15,13,0.22)', w: 1,    dash: '2 4',     fill: 'rgba(10,15,13,0.00)',  chair: 'rgba(10,15,13,0.10)' },
};
PDS_STATUS_RING_JOUR.reserved = { s: '#053B2C', w: 1.25, dash: '6 3', fill: 'rgba(5,59,44,0.06)', chair: 'rgba(5,59,44,0.45)' };
/* v4 · l'échelle de l'accueil, telle quelle (SVG « Le plan de salle, en un
 * geste »). Le statut est porté par la LUMIÈRE, pas par la couleur : libre
 * 0.19, attend 0.40, mange 0.60, et une seule couleur, la menthe, pour
 * l'addition demandée, avec son halo et son anneau. Réglée en pointillé,
 * réservée en tiret long, hors service à peine tracée. Le jour en est le
 * miroir exact à l'encre, l'atlas de la marque tenant le rôle de la menthe.
 * `t` est l'encre du numéro, la même échelle. */
Object.assign(PDS_STATUS_RING_NOIR, {
  free:     { s: 'rgba(255,255,255,0.19)', w: 1.25, dash: '',        fill: 'rgba(255,255,255,0.012)', chair: 'rgba(255,255,255,0.12)', t: 'rgba(255,255,255,0.30)' },
  ordering: { s: 'rgba(255,255,255,0.40)', w: 1.25, dash: '',        fill: 'rgba(255,255,255,0.035)', chair: 'rgba(255,255,255,0.30)', t: 'rgba(255,255,255,0.45)' },
  occupied: { s: 'rgba(255,255,255,0.60)', w: 1.25, dash: '',        fill: 'rgba(255,255,255,0.075)', chair: 'rgba(255,255,255,0.44)', t: 'rgba(255,255,255,0.62)' },
  bill:     { s: '#00FFAE',                w: 1.25, dash: '',        fill: 'rgba(0,255,174,0.11)',    chair: 'rgba(0,255,174,0.55)',    t: 'rgba(0,255,174,0.90)' },
  paid:     { s: 'rgba(255,255,255,0.40)', w: 1.25, dash: '1.5 3.5', fill: 'rgba(255,255,255,0.02)',  chair: 'rgba(255,255,255,0.20)', t: 'rgba(255,255,255,0.40)' },
  reserved: { s: 'rgba(255,255,255,0.45)', w: 1.25, dash: '6 3',     fill: 'rgba(255,255,255,0.03)',  chair: 'rgba(255,255,255,0.24)', t: 'rgba(255,255,255,0.50)' },
  out:      { s: 'rgba(255,255,255,0.12)', w: 1,    dash: '2 4',     fill: 'rgba(255,255,255,0.00)',  chair: 'rgba(255,255,255,0.06)', t: 'rgba(255,255,255,0.18)' },
});
Object.assign(PDS_STATUS_RING_JOUR, {
  free:     { s: 'rgba(10,15,13,0.24)', w: 1.25, dash: '',        fill: 'rgba(10,15,13,0.012)', chair: 'rgba(10,15,13,0.16)', t: 'rgba(10,15,13,0.40)' },
  ordering: { s: 'rgba(10,15,13,0.48)', w: 1.25, dash: '',        fill: 'rgba(10,15,13,0.035)', chair: 'rgba(10,15,13,0.34)', t: 'rgba(10,15,13,0.62)' },
  occupied: { s: 'rgba(10,15,13,0.78)', w: 1.25, dash: '',        fill: 'rgba(10,15,13,0.07)',  chair: 'rgba(10,15,13,0.55)', t: 'rgba(10,15,13,0.86)' },
  bill:     { s: '#0B6E4F',             w: 1.5,  dash: '',        fill: 'rgba(11,110,79,0.12)', chair: 'rgba(11,110,79,0.65)', t: '#0B6E4F' },
  paid:     { s: 'rgba(10,15,13,0.45)', w: 1.25, dash: '1.5 3.5', fill: 'rgba(10,15,13,0.02)',  chair: 'rgba(10,15,13,0.22)', t: 'rgba(10,15,13,0.55)' },
  reserved: { s: 'rgba(10,15,13,0.55)', w: 1.25, dash: '6 3',     fill: 'rgba(10,15,13,0.03)',  chair: 'rgba(10,15,13,0.28)', t: 'rgba(10,15,13,0.66)' },
  out:      { s: 'rgba(10,15,13,0.16)', w: 1,    dash: '2 4',     fill: 'rgba(10,15,13,0.00)',  chair: 'rgba(10,15,13,0.08)', t: 'rgba(10,15,13,0.30)' },
});

/* ─── Rendu nuit : le trait, pas la matière ───────────────────────────────
 * La scène de l'accueil est un dessin au trait — contours en filet, chaises
 * en tirets, remplissage à peine au-dessus du sol, la lumière réservée à
 * l'état. Re-teinter le rendu matières (bois éclairé, chaises en volume) n'y
 * arrivera jamais : la nuit a son propre tracé, le jour garde le sien. */
function pdsNoirTick(x, y, deg, fill) {
  /* La chaise du mockup, au pixel : rect(-9,-3,18,6, rx 3), centrée à 12 px
   * du bord de la table, la couleur suivant le statut de la table. */
  return `<rect x="-9" y="-3" width="18" height="6" rx="3" fill="${fill}"
    transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})"/>`;
}
function pdsNoirChairs(g, seats, ring) {
  if (!seats || seats < 1) return '';
  const { w, h, shape } = g;
  const fill = (ring && ring.chair) || 'rgba(255,255,255,0.12)';
  let out = '';
  if (shape === 'round') {
    /* Tirets tangents sur la circonférence, comme la grande ronde du mockup. */
    const rx = w / 2 + 12, ry = h / 2 + 12, cx = w / 2, cy = h / 2;
    for (let i = 0; i < seats; i++) {
      const a = -90 + (360 * i) / seats;
      const rad = a * Math.PI / 180;
      out += pdsNoirTick(cx + rx * Math.cos(rad), cy + ry * Math.sin(rad), a + 90, fill);
    }
    return out;
  }
  const alloc = pdsSeatSlots(w, h, seats);
  const along = (n, len) => Array.from({ length: n }, (_, j) => (len * (j + 1)) / (n + 1));
  along(alloc.top, w).forEach(px => { out += pdsNoirTick(px, -12, 0, fill); });
  along(alloc.bottom, w).forEach(px => { out += pdsNoirTick(px, h + 12, 0, fill); });
  along(alloc.left, h).forEach(py => { out += pdsNoirTick(-12, py, 90, fill); });
  along(alloc.right, h).forEach(py => { out += pdsNoirTick(w + 12, py, 90, fill); });
  return out;
}
/* Plateau du mockup, couche par couche : le disque d'appel (dégradé radial
 * menthe, occupée seulement), le corps en dégradé vertical #101312→#050605
 * posé sur une ombre portée (fp-body + fp-lift), puis la couche de statut —
 * remplissage + contour 1.25 sur la MÊME forme, rx 8. L'occupée reçoit en
 * plus l'anneau d'appel qui pulse (classe .pds-noir-call, animée en CSS,
 * l'équivalent exact de .kw-plan-call sur l'accueil). Les dégradés et le
 * filtre vivent une seule fois dans les defs partagées de la scène — les SVG
 * inline résolvent url(#…) à l'échelle du document. */
function pdsNoirTableBody(g, ring, status, tint) {
  /* `tint` absent = scène nuit (corps charbon, halo menthe). Présent = vue
   * jour ligne-claire : le corps est le lavis de la matière du commerçant
   * (pdsJourC), l'ombre et le halo passent aux defs jour (encre, atlas). */
  const jour = tint != null;
  /* Seule « Addition demandée » pulse : c'est la table qui coûte de l'argent
     pendant qu'elle attend. L'occupée garde son halo, sans battement. */
  const hot = status === 'bill';
  const dash = ring.dash ? `stroke-dasharray="${ring.dash}"` : '';
  const fill = ring.fill || 'rgba(255,255,255,0.012)';
  const bodyFill = jour ? tint : 'url(#pdsNoirBody)';
  const lift = jour ? 'url(#pdsJourLift)' : 'url(#pdsNoirLift)';
  const callId = jour ? 'url(#pdsJourCall)' : 'url(#pdsNoirCall)';
  const cx = g.w / 2, cy = g.h / 2;
  /* Le disque d'appel aux valeurs du mockup — le sol quasi noir encaisse
   * la somme des halos sans se noyer, l'adoucissement n'est plus utile. */
  /* Comme sur l'accueil : seule l'addition demandée rayonne. */
  const glow = status === 'bill';
  const call = glow ? `<circle cx="${cx}" cy="${cy}" r="${(Math.max(g.w, g.h) * 1.45).toFixed(0)}" fill="${callId}"/>` : '';
  if (g.shape === 'round') {
    return `${call}
      <ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="${bodyFill}" filter="${lift}"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="${fill}" stroke="${ring.s}" stroke-width="${ring.w}" ${dash}/>
      ${hot ? `<ellipse class="pds-noir-call" cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="none" stroke="${ring.s}" stroke-width="${ring.w}"/>` : ''}`;
  }
  const r = Math.min(8, g.w / 5, g.h / 5);
  return `${call}
    <rect x="0" y="0" width="${g.w}" height="${g.h}" rx="${r}" fill="${bodyFill}" filter="${lift}"/>
    <rect x="0" y="0" width="${g.w}" height="${g.h}" rx="${r}" fill="${fill}" stroke="${ring.s}" stroke-width="${ring.w}" ${dash}/>
    ${hot ? `<rect class="pds-noir-call" x="0" y="0" width="${g.w}" height="${g.h}" rx="${r}" fill="none" stroke="${ring.s}" stroke-width="${ring.w}"/>` : ''}`;
}
/* Le bâti au trait. Chaque genre a son idéogramme — la caisse porte son
 * interrupteur menthe, la cuisine ses hachures en filet, la porte son arc —
 * et l'inconnu retombe sur un simple contour. Les gabarits (couleur,
 * matière) ne jouent pas ici : la nuit dessine, elle ne peint pas. */
function pdsNoirFixture(e, K, g) {
  /* Le même trait dans les deux vues, seule l'encre change. Nuit : blanc un
   * cran au-dessus du mockup pour tenir sur le sol quasi noir — filet 0.38,
   * discret 0.20, pilules 0.05 / 0.20 — l'accent #00FFAE réservé au vivant
   * (interrupteur de caisse, plantes). Jour : encre #0A0F0D sur papier —
   * filet 0.45, discret 0.25 — et l'atlas de la marque en accent. */
  const jour = !pdsNoir();
  const line = jour ? 'rgba(10,15,13,0.45)' : 'rgba(255,255,255,0.38)';
  const dim  = jour ? 'rgba(10,15,13,0.25)' : 'rgba(255,255,255,0.20)';
  const pillFill = jour ? 'rgba(10,15,13,0.035)' : 'rgba(255,255,255,0.05)';
  const pillLine = jour ? 'rgba(10,15,13,0.25)' : 'rgba(255,255,255,0.20)';
  const acc = jour ? '11,110,79' : '0,255,174';
  switch (e.type) {
    case 'texte': return '';
    case 'comptoir': {
      /* Le bar du mockup porte ses tabourets : des cercles r 7 cerclés 0.22,
       * espacés de 38, à 15 px au-dessus du long côté. Seulement quand la
       * pilule est vraiment un comptoir (long et bas) — le SVG déborde de la
       * boîte, .pds-el-svg est en overflow:visible la nuit pour ça. */
      let stools = '';
      if (g.w >= 100 && g.w > g.h * 2) {
        const n = Math.max(2, Math.min(8, Math.floor(g.w / 38)));
        for (let i = 0; i < n; i++) {
          const sx = (g.w * (i + 1)) / (n + 1);
          stools += `<circle cx="${sx.toFixed(1)}" cy="-15" r="7" fill="none" stroke="${jour ? 'rgba(10,15,13,0.28)' : 'rgba(255,255,255,0.22)'}" stroke-width="1.25"/>`;
        }
      }
      return `${stools}<rect x="0.5" y="0.5" width="${g.w - 1}" height="${g.h - 1}" rx="${Math.max(3, Math.min(g.h / 2 - 1, 12))}"
        fill="${pillFill}" stroke="${pillLine}" stroke-width="1"/>`;
    }
    case 'caisse': {
      const kr = Math.max(3, Math.min(g.h / 2 - 1, 12));
      /* L'interrupteur du mockup : 22 × 14, rx 3, à 10 px du bord droit. */
      const th = Math.min(14, Math.max(8, g.h - 10)), tw = th / 14 * 22;
      const tx = g.w - tw - 10, ty = (g.h - th) / 2;
      return `<rect x="0.5" y="0.5" width="${g.w - 1}" height="${g.h - 1}" rx="${kr}" fill="${pillFill}" stroke="${pillLine}" stroke-width="1"/>
        <rect x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="${tw.toFixed(1)}" height="${th.toFixed(1)}" rx="3" fill="rgba(${acc},0.14)" stroke="rgba(${acc},0.5)" stroke-width="1"/>`;
    }
    case 'cuisine':
      return `<defs><pattern id="pdsNoirHatch" width="16" height="16" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="16" stroke="${dim}" stroke-width="1"/></pattern></defs>
        <rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="8" fill="url(#pdsNoirHatch)" stroke="${dim}" stroke-width="1.2" stroke-dasharray="5 4"/>`;
    case 'porte':
      /* La porte de l'accueil : seuil net (0.28 · 1.5), battement en arc
       * pointillé 3 3 (0.14 · 1). */
      return `<path d="M2 ${g.h - 2} A ${g.w - 4} ${g.w - 4} 0 0 1 ${g.w - 2} ${g.h - 2}" fill="none" stroke="${dim}" stroke-width="1" stroke-dasharray="3 3"/>
        <line x1="0" y1="${g.h - 1.5}" x2="${g.w}" y2="${g.h - 1.5}" stroke="${line}" stroke-width="1.5"/>`;
    case 'mur':
      return `<rect x="0" y="0" width="${g.w}" height="${g.h}" rx="${Math.min(2, g.h / 2)}" fill="${line}"/>`;
    case 'fenetre':
      return `<rect x="0" y="${g.h / 2 - 0.75}" width="${g.w}" height="1.5" fill="${line}"/>
        <rect x="0" y="0" width="1.5" height="${g.h}" fill="${line}"/>
        <rect x="${g.w - 1.5}" y="0" width="1.5" height="${g.h}" fill="${line}"/>`;
    case 'passe':
      return `<rect x="0.6" y="0.6" width="${g.w - 1.2}" height="${g.h - 1.2}" rx="${Math.min(g.h / 2, 6)}" fill="none" stroke="${dim}" stroke-width="1.2"/>`;
    case 'plante': {
      const cx = g.w / 2, cy = g.h / 2, r = Math.max(2, Math.min(g.w, g.h) / 2 - 1.5);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(${acc},0.04)" stroke="rgba(${acc},0.35)" stroke-width="1.2"/>
        <circle cx="${cx}" cy="${cy}" r="${Math.max(1, r * 0.45)}" fill="none" stroke="rgba(${acc},0.28)" stroke-width="1"/>`;
    }
    case 'colonne':
      return `<rect x="1" y="1" width="${g.w - 2}" height="${g.h - 2}" rx="3" fill="${jour ? 'rgba(10,15,13,0.05)' : 'rgba(255,255,255,0.06)'}" stroke="${line}" stroke-width="1.2"/>`;
    case 'wc':
      return `<rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="8" fill="none" stroke="${dim}" stroke-width="1.2" stroke-dasharray="5 4"/>`;
    case 'escalier': {
      const n = Math.max(3, Math.min(12, Math.round(g.h / 15))), step = g.h / n;
      let out = `<rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="4" fill="none" stroke="${dim}" stroke-width="1.2"/>`;
      for (let i = 1; i < n; i++) {
        out += `<line x1="1.5" y1="${(step * i).toFixed(1)}" x2="${g.w - 1.5}" y2="${(step * i).toFixed(1)}" stroke="${dim}" stroke-width="1"/>`;
      }
      return out;
    }
    case 'banquette':
      /* Sur l'accueil la banquette est une seule pilule pleine (0.05 / 0.13,
       * rx 6) — pas de coussins dessinés. */
      return `<rect x="0.5" y="0.5" width="${g.w - 1}" height="${g.h - 1}" rx="${Math.min(6, g.h / 3, g.w / 3)}" fill="${pillFill}" stroke="${pillLine}" stroke-width="1"/>`;
    case 'claustra':
      return `<rect x="0" y="${g.h / 2 - 0.75}" width="${g.w}" height="1.5" fill="${dim}"/>` +
        Array.from({ length: Math.max(2, Math.round(g.w / 11)) }, (_, i) =>
          `<rect x="${(i * 11 + 2).toFixed(1)}" y="0" width="1.5" height="${g.h}" fill="${line}"/>`).join('');
    case 'garde':
      return `<rect x="0" y="${g.h / 2 - 0.75}" width="${g.w}" height="1.5" rx="0.75" fill="${line}"/>` +
        Array.from({ length: Math.max(2, Math.round(g.w / 22)) }, (_, i) =>
          `<rect x="${(i * 22 + 2).toFixed(1)}" y="0" width="1.5" height="${g.h}" fill="${dim}"/>`).join('');
    case 'tapis':
      return `<rect x="1" y="1" width="${g.w - 2}" height="${g.h - 2}" rx="3" fill="${jour ? 'rgba(10,15,13,0.02)' : 'rgba(255,255,255,0.02)'}" stroke="${dim}" stroke-width="1.2" stroke-dasharray="2 3"/>`;
    case 'vitrine':
      return jour
        ? `<rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="6" fill="rgba(64,102,124,0.08)" stroke="rgba(64,102,124,0.45)" stroke-width="1.2"/>`
        : `<rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="6" fill="rgba(191,217,232,0.05)" stroke="rgba(191,217,232,0.35)" stroke-width="1.2"/>`;
    default:
      return `<rect x="0.75" y="0.75" width="${Math.max(2, g.w - 1.5)}" height="${Math.max(2, g.h - 1.5)}" rx="6" fill="none" stroke="${dim}" stroke-width="1.2"/>`;
  }
}
/* Le sol la nuit : charbon teinté par le sol du commerçant, une grille fine
 * calée sur le pas d'aimantation (3 × PDS_GRID), et un souffle de lumière
 * depuis le haut — la même lumière que l'accueil sombre. Les finitions
 * (terrazzo, zellige) sont dessinées à l'encre sombre et disparaîtraient
 * ici ; la grille les remplace, la vue jour les garde. */
function pdsRoomShellNoir(zone) {
  /* Le sol du mockup (fp-floor + fp-grid) : un souffle blanc décentré —
   * 0.05 à 42 % / 34 %, 0.015 à 60 %, rien au bord — sur le charbon teinté
   * par le sol du commerçant, et la grille fine de 31 px à 0.028. Le mur est
   * le trait blanc 0.13 de l'accueil, pas la matière du gabarit. */
  const r = pdsRoom(zone);
  return `<div class="pds-floor" data-pds-floor style="
    background-color:${pdsNoirC(r.floor, 0.03)};
    background-image:
      radial-gradient(78% 78% at 42% 34%, rgba(255,255,255,0.04), rgba(255,255,255,0.012) 60%, transparent 100%),
      linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px);
    background-size: 100% 100%, 31px 31px, 31px 31px;
    background-repeat: no-repeat, repeat, repeat;
    ${r.wallW > 2 ? `box-shadow: inset 0 0 0 ${r.wallW}px rgba(255,255,255,0.20);` : ''}
  "></div>`;
}
/* Le sol le jour : le même dessin, à l'encre sur papier. Le sol choisi par le
 * commerçant devient un lavis sur le papier chaud (pdsJourC 0.30 — assez pour
 * distinguer chêne de béton, pas assez pour casser le dessin), la grille
 * passe à l'encre fine, la lumière entre par la même fenêtre décentrée que la
 * nuit — en blanc franc, c'est le matin — et le mur est un trait d'encre,
 * comme la nuit le fait en blanc : le mur du gabarit ne peint pas ici. */
function pdsRoomShellJour(zone) {
  const r = pdsRoom(zone);
  return `<div class="pds-floor" data-pds-floor style="
    background-color:${pdsJourC(r.floor, 0.30)};
    background-image:
      radial-gradient(78% 78% at 42% 34%, rgba(255,255,255,0.50), rgba(255,255,255,0.15) 60%, transparent 100%),
      linear-gradient(rgba(10,15,13,0.055) 1px, transparent 1px),
      linear-gradient(90deg, rgba(10,15,13,0.055) 1px, transparent 1px);
    background-size: 100% 100%, 31px 31px, 31px 31px;
    background-repeat: no-repeat, repeat, repeat;
    ${r.wallW > 2 ? `box-shadow: inset 0 0 0 ${r.wallW}px rgba(10,15,13,0.30);` : ''}
  "></div>`;
}


/* ─── Static i18n table — every label, status, role, template name ───────── */
const PDS_STR = {
  fr: {
    title: 'Plan de salle',
    subtitle: (name, n, occ) => `${name} · ${n} table${n > 1 ? 's' : ''} · ${occ} occupée${occ > 1 ? 's' : ''} en service`,
    tagPdS: 'PLAN DE SALLE',
    /* Modes */
    modeLayout: 'Aménagement',
    modeAssign: 'Affectation',
    modeRotate: 'Rotation',
    modeLayoutDesc: 'Glissez les tables · clic pour éditer · ajoutez murs, portes et plantes pour visualiser le restaurant.',
    modeAssignDesc: 'Glissez un serveur sur une table pour l\'affecter · cliquez une table pour réassigner.',
    modeRotateDesc: 'Faites tourner les serveurs entre zones et tables pour éviter la lassitude, équité automatique.',
    /* Top bar */
    save: 'Sauvegarder',
    saving: 'Enregistrement…',
    savedButton: 'Enregistré',
    saved: 'Plan enregistré',
    savedDesc: 'Toutes les modifications ont bien été enregistrées.',
    reset: 'Réinitialiser',
    resetTitle: 'Réinitialiser le plan ?',
    resetDesc: 'Supprime toutes les tables, zones et affectations · charge le template par défaut. Action irréversible.',
    resetCancel: 'Annuler',
    resetConfirm: 'Réinitialiser',
    resetDone: 'Plan réinitialisé',
    resetDoneDesc: 'Template par défaut chargé · 16 tables, 3 zones.',
    templates: 'Templates',
    export: 'Exporter le plan',
    exportToast: 'Plan exporté',
    exportDesc: 'PDF A3 · 1 page · prêt pour impression ou WhatsApp.',
    /* KPIs */
    kpiTables: 'TABLES',
    kpiCovers: 'COUVERTS',
    kpiZones: 'ZONES',
    kpiServers: 'SERVEURS',
    /* Zones */
    addZone: 'Ajouter une zone',
    addZoneDesc: 'Une nouvelle zone apparaîtra dans les onglets · vous pourrez la peupler de tables.',
    zoneName: 'Nom de la zone',
    zoneAdd: 'Créer',
    zoneAdded: 'Zone ajoutée',
    zoneAddedDesc: (n) => `Zone "${n}" créée · cliquez pour la sélectionner.`,
    renameZone: 'Renommer',
    renameZoneTitle: 'Renommer la zone',
    deleteZone: 'Supprimer la zone',
    deleteZoneTitle: 'Supprimer cette zone ?',
    deleteZoneDesc: (n, c) => `La zone "${n}" et ses ${c} tables seront retirées du plan. Action irréversible.`,
    deleteZoneOk: 'Supprimer',
    deleteZoneDone: 'Zone supprimée',
    deleteZoneNoLast: 'Dernière zone',
    deleteZoneNoLastDesc: 'Vous devez garder au moins une zone active.',
    zoneRenamedDesc: (n) => `Zone renommée en "${n}".`,
    /* Add table palette */
    paletteTitle: 'Ajouter une table',
    paletteHint: 'Cliquez pour ajouter, la table apparaît au centre de la zone.',
    /* Une table comme un comptoir s'ouvrent de la même façon ; rien ne le
       disait, et le comptoir passait pour un décor qu'on ne peut pas toucher. */
    editHint: 'Cliquez un objet posé · table, comptoir, cuisine, plante · pour le redimensionner ou le supprimer.',
    structTitle: 'Éléments structurels',
    structHint: 'Murs, portes, fenêtres et plantes, purement visuels.',
    elWall: 'Mur',
    elDoor: 'Porte',
    elWindow: 'Fenêtre',
    elColumn: 'Colonne',
    elPlant: 'Plante',
    tRound: 'Ronde',
    tSquare: 'Carrée',
    tRect: 'Rectangulaire',
    tBar: 'Bar / Comptoir',
    tHigh: 'Mange-debout',
    seats: 'places', tableName: 'Table',
    addedTableToast: (id) => `Table ${id} ajoutée`,
    addedTableDesc: (s, z) => `${s} couverts · ${z} · glissez-la pour la positionner.`,
    addedElementToast: 'Élément ajouté',
    addedElementDesc: 'Glissez-le pour positionner · cliquez pour pivoter.',
    /* Snap */
    viewNuit: 'Vue nuit · console de service',
    viewJour: 'Vue jour · matières & décor',
    snapOn: 'Aimanter',
    snapOff: 'Libre',
    snapHint: 'Aimanter aligne les tables sur la grille',
    /* Table inspector */
    inspectorTitle: (id) => `Table ${id}`,
    inspectorNum: 'Numéro',
    inspectorType: 'Type',
    inspectorSeats: 'Places',
    inspectorStatus: 'Statut',
    inspectorNotes: 'Notes',
    inspectorServer: 'Serveur affecté',
    reservationName: 'Nom de réservation',
    reservationTime: 'Heure',
    reservationNamePlaceholder: 'ex. Benali',
    inspectorRotate: 'Pivoter',
    inspectorDuplicate: 'Dupliquer',
    inspectorDelete: 'Supprimer',
    inspectorDone: 'Modifications enregistrées',
    inspectorUnassigned: 'Aucun',
    inspectorAddServer: '+ Un autre serveur',
    inspectorNoStaff: 'Aucun serveur dans votre équipe. Ajoutez-en depuis Équipe pour les affecter aux tables.',
    statusFree: 'Libre',
    statusOccupied: 'Occupée',
    statusReserved: 'Réservée',
    statusCleaning: 'À nettoyer',
    /* Selection / bulk */
    selection: 'Sélection',
    bulkAlignH: 'Aligner horiz.',
    bulkAlignV: 'Aligner vert.',
    bulkDistH: 'Distribuer horiz.',
    bulkDistV: 'Distribuer vert.',
    bulkDelete: 'Supprimer',
    bulkClear: 'Désélectionner',
    bulkSetStatus: 'Statut',
    bulkOkAlign: 'Tables alignées',
    bulkOkDist: 'Tables distribuées uniformément',
    bulkOkDelete: (n) => `${n} tables supprimées`,
    bulkOkStatus: (n, s) => `${n} tables marquées ${s}`,
    bulkHintNone: 'Maintenez Maj et cliquez pour sélectionner plusieurs tables · au moins 2 pour aligner.',
    /* Groupement */
    groupTables: 'Grouper',
    ungroupTables: 'Dissocier',
    groupPickHint: 'Cliquez sur une autre table pour la grouper avec celle-ci.',
    groupPickCancel: 'Groupement annulé',
    groupOk: (nums, covers) => `Tables ${nums} groupées · ${covers} couverts`,
    ungroupOk: 'Tables dissociées',
    undoAction: 'Annuler',
    deleteUndone: 'Table restaurée',
    ungroupUndone: 'Groupe restauré',
    bulkGroup: 'Grouper la sélection',
    bulkOkGroup: (n) => `${n} tables groupées`,
    groupCovers: (n) => `${n} couverts`,
    groupedWith: (nums) => `Groupée avec ${nums}`,
    /* Templates */
    templatesTitle: 'Templates de salle',
    templatesDesc: 'Démarrez avec une disposition pré-construite · vous pourrez la modifier ensuite.',
    tplBistro: 'Bistro · 30 couverts',
    tplBistroDesc: '8 tables intérieures + petite terrasse · 1 zone bar',
    tplResto: 'Restaurant · 60 couverts',
    tplRestoDesc: 'Salle principale 12 tables, terrasse, salon privé',
    tplCafe: 'Café · 20 couverts',
    tplCafeDesc: '6 mange-debout, comptoir, 3 tables ronde',
    tplBrasserie: 'Brasserie terrasse · 80 couverts',
    tplBrasserieDesc: 'Grande terrasse 10 tables, salle 8 tables, bar',
    tplBlank: 'Plan vierge',
    tplBlankDesc: 'Commencez de zéro · une seule zone vide',
    tplApply: 'Charger ce template',
    tplApplyConfirm: (n) => `Charger "${n}" ?`,
    tplApplyConfirmDesc: 'Le plan actuel sera remplacé. Pensez à exporter d\'abord si nécessaire.',
    tplLoaded: (n) => `${n} chargé`,
    tplLoadedDesc: 'Disposition initiale prête · personnalisez librement.',
    /* Empty state */
    emptyTitle: 'Commencez par choisir un template',
    emptyDesc: 'Ou créez votre première table, vous pouvez tout modifier ensuite.',
    emptyChoose: 'Choisir un template',
    emptyBlank: 'Démarrer vierge',
    /* Assignation mode */
    rosterTitle: 'Équipe en service',
    rosterHint: 'Glissez une pastille vers une table ou une zone',
    rosterShift: 'Shift soir',
    rosterUnassigned: 'Non affecté',
    rosterTables: (n) => `${n} table${n > 1 ? 's' : ''}`,
    rosterCovers: (n) => `${n} couverts`,
    rosterEmpty: 'Personne en service. Ajoutez un serveur ici, ou renseignez votre équipe depuis la page Équipe · elle apparaîtra automatiquement.',
    rosterAdd: '+ Ajouter un serveur',
    rosterAddTitle: 'Ajouter un serveur',
    rosterAddDesc: 'Il apparaîtra dans l\'équipe en service et pourra être glissé sur une table ou une zone.',
    rosterAddLabel: 'Nom du serveur',
    rosterAddPlaceholder: 'ex. Karim',
    rosterAddOk: 'Ajouter',
    rosterAddDone: (n) => `${n} ajouté au service`,
    rosterRemove: 'Retirer du service',
    rosterRemoveDone: (n) => `${n} retiré du service`,
    rosterRemoveDoneDesc: (n) => n ? `${n} tables libérées.` : 'Aucune table n\'était affectée.',
    clearAssign: 'Effacer toutes les affectations',
    clearAssignTitle: 'Effacer toutes les affectations ?',
    clearAssignDesc: 'Aucun serveur ne sera affecté à aucune table. Les affectations seront vides jusqu\'à réassignation.',
    clearAssignOk: 'Effacer',
    clearAssignDone: 'Affectations effacées',
    clearAssignDoneDesc: 'Toutes les tables sont libres d\'affectation serveur.',
    assignDone: (s, t) => `${s} affecté à ${t}`,
    assignDoneDesc: 'Coloré sur le plan · synchronisé avec l\'app serveur.',
    unassignDone: (t) => `${t} libérée d'affectation`,
    /* Rotation */
    rotateTitle: 'Configurer la rotation',
    rotateCTA: 'Configurer',
    rotateDesc: 'Quand vos serveurs alternent, ils restent motivés et apprennent toutes les tables.',
    rotatePeriod: 'Période',
    rotateDaily: 'Chaque jour',
    rotateShift: 'Chaque shift',
    rotateWeekly: 'Chaque semaine',
    rotateCustom: 'Personnalisée',
    rotateStrategy: 'Stratégie',
    rotZones: 'Rotation des zones',
    rotZonesDesc: 'Les serveurs tournent entre zones (recommandé)',
    rotTables: 'Rotation des tables',
    rotTablesDesc: 'Round-robin sur toutes les tables',
    rotPairs: 'Permutation par paires',
    rotPairsDesc: 'Vous choisissez les paires manuellement',
    rotPreview: 'Aperçu des 3 prochaines rotations',
    rotFairness: 'Équité par serveur',
    rotApply: 'Appliquer la rotation',
    rotApplied: 'Rotation appliquée',
    rotAppliedDesc: 'Tous les serveurs notifiés sur leur app · plan mis à jour.',
    rotNow: 'Tourner maintenant',
    rotNowDone: 'Rotation effectuée',
    rotNowDoneDesc: 'Nouvelles affectations actives · serveurs notifiés.',
    rotHistoryTitle: 'Historique de la semaine',
    rotHistoryHint: 'Vérifiez visuellement que personne ne reste sur la même zone trop longtemps.',
    rotNoneTitle: 'Aucune rotation configurée',
    rotNoneDesc: 'Configurez une rotation pour éviter que vos serveurs restent sur la même table pendant des mois.',
    rotNoneCTA: 'Configurer',
    fairnessLow: 'a trop fait cette zone, son tour arrive',
    fairnessHigh: 'rotation équilibrée',
    /* Status legend */
    legendTitle: 'Statuts',
    /* Generic */
    cancel: 'Annuler',
    close: 'Fermer',
    save2: 'Enregistrer',
    /* Days of week */
    days: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
    soonAvailable: 'Bientôt disponible',
    /* Scene picker (zone backdrop) */
    sceneLabel: 'Décor de la zone',
    sceneHint: (n) => `Change l'arrière-plan visuel de${n ? ` « ${n} »` : ' cette zone'}, purement esthétique, n'affecte pas vos tables.`,
    sceneSalle: 'Salle intérieure',
    sceneTerrasse: 'Terrasse extérieure',
    sceneBar: 'Bar / Comptoir',
    sceneEtage: 'Étage / Mezzanine',
    scenePrive: 'Salon privé',
    sceneBlank: 'Vierge (sans fixtures)',
    /* Floor toggle */
    floorRDC: 'Rez-de-chaussée',
    floorEtage: '1ᵉʳ étage',
    /* Room labels */
    roomLabel: (zone) => `${zone} · vue propriétaire`,
    viewOwner: 'vue propriétaire',
    floorCount: (occ, total) => `${total} table${total > 1 ? 's' : ''} · ${occ} occupée${occ > 1 ? 's' : ''}`,
  },
  en: {
    title: 'Floor Plan',
    subtitle: (name, n, occ) => `${name} · ${n} table${n === 1 ? '' : 's'} · ${occ} in service`,
    tagPdS: 'FLOOR PLAN',
    modeLayout: 'Layout',
    modeAssign: 'Assignment',
    modeRotate: 'Rotation',
    modeLayoutDesc: 'Drag tables · click to edit · add walls, doors and plants to visualize the room.',
    modeAssignDesc: 'Drag a server onto a table to assign · click a table to reassign.',
    modeRotateDesc: 'Rotate servers across zones and tables so they don\'t burn out, fairness built-in.',
    save: 'Save',
    saving: 'Saving…',
    savedButton: 'Saved',
    saved: 'Plan saved',
    savedDesc: 'All floor-plan changes were saved successfully.',
    reset: 'Reset',
    resetTitle: 'Reset the plan?',
    resetDesc: 'Removes all tables, zones and assignments · loads the default template. Cannot be undone.',
    resetCancel: 'Cancel',
    resetConfirm: 'Reset',
    resetDone: 'Plan reset',
    resetDoneDesc: 'Default template loaded · 16 tables, 3 zones.',
    templates: 'Templates',
    export: 'Export plan',
    exportToast: 'Plan exported',
    exportDesc: 'A3 PDF · 1 page · ready for print or WhatsApp.',
    kpiTables: 'TABLES',
    kpiCovers: 'COVERS',
    kpiZones: 'ZONES',
    kpiServers: 'SERVERS',
    addZone: 'Add a zone',
    addZoneDesc: 'A new zone will appear in the tabs · you can populate it with tables.',
    zoneName: 'Zone name',
    zoneAdd: 'Create',
    zoneAdded: 'Zone added',
    zoneAddedDesc: (n) => `Zone "${n}" created · click to select it.`,
    renameZone: 'Rename',
    renameZoneTitle: 'Rename zone',
    deleteZone: 'Delete zone',
    deleteZoneTitle: 'Delete this zone?',
    deleteZoneDesc: (n, c) => `Zone "${n}" and its ${c} tables will be removed. Cannot be undone.`,
    deleteZoneOk: 'Delete',
    deleteZoneDone: 'Zone deleted',
    deleteZoneNoLast: 'Last zone',
    deleteZoneNoLastDesc: 'You must keep at least one active zone.',
    zoneRenamedDesc: (n) => `Zone renamed to "${n}".`,
    paletteTitle: 'Add a table',
    paletteHint: 'Click to add, the table appears at the center of the zone.',
    editHint: 'Click any placed object · table, counter, kitchen, plant · to resize or delete it.',
    structTitle: 'Structural elements',
    structHint: 'Walls, doors, windows and plants, visual only.',
    elWall: 'Wall',
    elDoor: 'Door',
    elWindow: 'Window',
    elColumn: 'Column',
    elPlant: 'Plant',
    tRound: 'Round',
    tSquare: 'Square',
    tRect: 'Rectangular',
    tBar: 'Bar / Counter',
    tHigh: 'High table',
    seats: 'seats', tableName: 'Table',
    addedTableToast: (id) => `Table ${id} added`,
    addedTableDesc: (s, z) => `${s} seats · ${z} · drag to position.`,
    addedElementToast: 'Element added',
    addedElementDesc: 'Drag to position · click to rotate.',
    viewNuit: 'Night view · service console',
    viewJour: 'Day view · materials & decor',
    snapOn: 'Snap',
    snapOff: 'Free',
    snapHint: 'Snap aligns tables to the grid',
    inspectorTitle: (id) => `Table ${id}`,
    inspectorNum: 'Number',
    inspectorType: 'Type',
    inspectorSeats: 'Seats',
    inspectorStatus: 'Status',
    inspectorNotes: 'Notes',
    inspectorServer: 'Assigned server',
    reservationName: 'Reservation name',
    reservationTime: 'Time',
    reservationNamePlaceholder: 'e.g. Benali',
    inspectorRotate: 'Rotate',
    inspectorDuplicate: 'Duplicate',
    inspectorDelete: 'Delete',
    inspectorDone: 'Changes saved',
    inspectorUnassigned: 'None',
    inspectorAddServer: '+ Another server',
    inspectorNoStaff: 'No servers on your team yet. Add them in Team to assign them to tables.',
    statusFree: 'Free',
    statusOccupied: 'Occupied',
    statusReserved: 'Reserved',
    statusCleaning: 'Cleaning',
    selection: 'Selection',
    bulkAlignH: 'Align horiz.',
    bulkAlignV: 'Align vert.',
    bulkDistH: 'Distribute horiz.',
    bulkDistV: 'Distribute vert.',
    bulkDelete: 'Delete',
    bulkClear: 'Deselect',
    bulkSetStatus: 'Status',
    bulkOkAlign: 'Tables aligned',
    bulkOkDist: 'Tables distributed evenly',
    bulkOkDelete: (n) => `${n} tables deleted`,
    bulkOkStatus: (n, s) => `${n} tables set to ${s}`,
    bulkHintNone: 'Hold Shift and click to select multiple tables · at least 2 to align.',
    groupTables: 'Group',
    ungroupTables: 'Ungroup',
    groupPickHint: 'Click another table to group it with this one.',
    groupPickCancel: 'Grouping cancelled',
    groupOk: (nums, covers) => `Tables ${nums} grouped · ${covers} covers`,
    ungroupOk: 'Tables ungrouped',
    undoAction: 'Undo',
    deleteUndone: 'Table restored',
    ungroupUndone: 'Group restored',
    bulkGroup: 'Group selection',
    bulkOkGroup: (n) => `${n} tables grouped`,
    groupCovers: (n) => `${n} covers`,
    groupedWith: (nums) => `Grouped with ${nums}`,
    templatesTitle: 'Room templates',
    templatesDesc: 'Start from a pre-built layout · you can modify it after.',
    tplBistro: 'Bistro · 30 covers',
    tplBistroDesc: '8 indoor tables + small terrace · 1 bar zone',
    tplResto: 'Restaurant · 60 covers',
    tplRestoDesc: 'Main hall 12 tables, terrace, private room',
    tplCafe: 'Café · 20 covers',
    tplCafeDesc: '6 high tables, counter, 3 round tables',
    tplBrasserie: 'Brasserie terrace · 80 covers',
    tplBrasserieDesc: 'Large terrace 10 tables, hall 8 tables, bar',
    tplBlank: 'Blank plan',
    tplBlankDesc: 'Start from scratch · one empty zone',
    tplApply: 'Load this template',
    tplApplyConfirm: (n) => `Load "${n}"?`,
    tplApplyConfirmDesc: 'The current plan will be replaced. Export first if needed.',
    tplLoaded: (n) => `${n} loaded`,
    tplLoadedDesc: 'Initial layout ready · customize freely.',
    emptyTitle: 'Start by choosing a template',
    emptyDesc: 'Or create your first table, you can change everything later.',
    emptyChoose: 'Choose a template',
    emptyBlank: 'Start blank',
    rosterTitle: 'Team on shift',
    rosterHint: 'Drag a chip onto a table or a zone',
    rosterShift: 'Evening shift',
    rosterUnassigned: 'Unassigned',
    rosterTables: (n) => `${n} table${n === 1 ? '' : 's'}`,
    rosterCovers: (n) => `${n} covers`,
    rosterEmpty: 'Nobody on shift. Add a server here, or fill in your team on the Team page · it shows up automatically.',
    rosterAdd: '+ Add a server',
    rosterAddTitle: 'Add a server',
    rosterAddDesc: 'They join the team on shift and can be dragged onto a table or a zone.',
    rosterAddLabel: 'Server name',
    rosterAddPlaceholder: 'e.g. Karim',
    rosterAddOk: 'Add',
    rosterAddDone: (n) => `${n} added to the shift`,
    rosterRemove: 'Remove from shift',
    rosterRemoveDone: (n) => `${n} removed from the shift`,
    rosterRemoveDoneDesc: (n) => n ? `${n} tables freed.` : 'No table was assigned.',
    clearAssign: 'Clear all assignments',
    clearAssignTitle: 'Clear all assignments?',
    clearAssignDesc: 'No server will be assigned to any table. Assignments will be empty until reassigned.',
    clearAssignOk: 'Clear',
    clearAssignDone: 'Assignments cleared',
    clearAssignDoneDesc: 'All tables are now free of server assignment.',
    assignDone: (s, t) => `${s} assigned to ${t}`,
    assignDoneDesc: 'Highlighted on the plan · synced with the server app.',
    unassignDone: (t) => `${t} unassigned`,
    rotateTitle: 'Configure rotation',
    rotateCTA: 'Configure',
    rotateDesc: 'When your servers alternate, they stay motivated and learn every table.',
    rotatePeriod: 'Period',
    rotateDaily: 'Every day',
    rotateShift: 'Every shift',
    rotateWeekly: 'Every week',
    rotateCustom: 'Custom',
    rotateStrategy: 'Strategy',
    rotZones: 'Zone rotation',
    rotZonesDesc: 'Servers rotate across zones (recommended)',
    rotTables: 'Table rotation',
    rotTablesDesc: 'Round-robin on all tables',
    rotPairs: 'Manual pair swap',
    rotPairsDesc: 'You choose the pairs manually',
    rotPreview: 'Preview of next 3 rotations',
    rotFairness: 'Fairness per server',
    rotApply: 'Apply rotation',
    rotApplied: 'Rotation applied',
    rotAppliedDesc: 'All servers notified on their app · plan updated.',
    rotNow: 'Rotate now',
    rotNowDone: 'Rotation done',
    rotNowDoneDesc: 'New assignments active · servers notified.',
    rotHistoryTitle: 'This week history',
    rotHistoryHint: 'Visually check that nobody stays on the same zone too long.',
    rotNoneTitle: 'No rotation configured',
    rotNoneDesc: 'Set up a rotation so servers don\'t stay on the same table for months.',
    rotNoneCTA: 'Configure',
    fairnessLow: 'has done this zone too much, turn coming up',
    fairnessHigh: 'balanced rotation',
    legendTitle: 'Statuses',
    cancel: 'Cancel',
    close: 'Close',
    save2: 'Save',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    soonAvailable: 'Coming soon',
    /* Scene picker */
    sceneLabel: 'Zone backdrop',
    sceneHint: (n) => `Change the visual backdrop of${n ? ` "${n}"` : ' this zone'}, purely cosmetic, doesn't affect your tables.`,
    sceneSalle: 'Indoor dining',
    sceneTerrasse: 'Outdoor terrace',
    sceneBar: 'Bar / Counter',
    sceneEtage: 'Mezzanine / Upper',
    scenePrive: 'Private room',
    sceneBlank: 'Blank (no fixtures)',
    floorRDC: 'Ground floor',
    floorEtage: 'Upper floor',
    roomLabel: (zone) => `${zone} · owner view`,
    viewOwner: 'owner view',
    floorCount: (occ, total) => `${total} table${total === 1 ? '' : 's'} · ${occ} occupied`,
  },
  ar: {
    title: 'مخطط القاعة',
    subtitle: (name, n, occ) => `${name} · ${n} طاولة · ${occ} قيد الخدمة`,
    tagPdS: 'مخطط القاعة',
    modeLayout: 'التصميم',
    modeAssign: 'الإسناد',
    modeRotate: 'التدوير',
    modeLayoutDesc: 'اسحب الطاولات · انقر للتعديل · أضف الجدران والأبواب والنباتات لتخيل القاعة.',
    modeAssignDesc: 'اسحب نادلًا فوق طاولة لإسنادها · انقر طاولة لإعادة الإسناد.',
    modeRotateDesc: 'قم بتدوير النوادل بين المناطق والطاولات حتى لا يملّوا، العدالة تلقائية.',
    save: 'حفظ',
    saving: 'جارٍ الحفظ…',
    savedButton: 'تم الحفظ',
    saved: 'تم حفظ المخطط',
    savedDesc: 'تم حفظ جميع تغييرات مخطط القاعة بنجاح.',
    reset: 'إعادة تعيين',
    resetTitle: 'إعادة تعيين المخطط؟',
    resetDesc: 'يحذف كل الطاولات والمناطق والإسنادات · يحمّل القالب الافتراضي. لا يمكن التراجع.',
    resetCancel: 'إلغاء',
    resetConfirm: 'إعادة تعيين',
    resetDone: 'تمت إعادة تعيين المخطط',
    resetDoneDesc: 'تم تحميل القالب الافتراضي · 16 طاولة، 3 مناطق.',
    templates: 'القوالب',
    export: 'تصدير المخطط',
    exportToast: 'تم تصدير المخطط',
    exportDesc: 'PDF بحجم A3 · صفحة واحدة · جاهز للطباعة أو WhatsApp.',
    kpiTables: 'الطاولات',
    kpiCovers: 'المقاعد',
    kpiZones: 'المناطق',
    kpiServers: 'النوادل',
    addZone: 'إضافة منطقة',
    addZoneDesc: 'ستظهر منطقة جديدة في التبويبات · يمكنك ملؤها بالطاولات.',
    zoneName: 'اسم المنطقة',
    zoneAdd: 'إنشاء',
    zoneAdded: 'تمت إضافة المنطقة',
    zoneAddedDesc: (n) => `تم إنشاء المنطقة "${n}" · انقر لاختيارها.`,
    renameZone: 'إعادة تسمية',
    renameZoneTitle: 'إعادة تسمية المنطقة',
    deleteZone: 'حذف المنطقة',
    deleteZoneTitle: 'حذف هذه المنطقة؟',
    deleteZoneDesc: (n, c) => `سيتم حذف المنطقة "${n}" و${c} طاولاتها. لا يمكن التراجع.`,
    deleteZoneOk: 'حذف',
    deleteZoneDone: 'تم حذف المنطقة',
    deleteZoneNoLast: 'المنطقة الأخيرة',
    deleteZoneNoLastDesc: 'يجب الإبقاء على منطقة نشطة واحدة على الأقل.',
    zoneRenamedDesc: (n) => `تمت إعادة تسمية المنطقة إلى "${n}".`,
    paletteTitle: 'إضافة طاولة',
    paletteHint: 'انقر للإضافة، تظهر الطاولة في وسط المنطقة.',
    editHint: 'انقر أي عنصر موضوع · طاولة، بار، مطبخ، نبتة · لتغيير حجمه أو حذفه.',
    structTitle: 'العناصر الهيكلية',
    structHint: 'جدران، أبواب، نوافذ ونباتات، للعرض فقط.',
    elWall: 'جدار',
    elDoor: 'باب',
    elWindow: 'نافذة',
    elColumn: 'عمود',
    elPlant: 'نبتة',
    tRound: 'مستديرة',
    tSquare: 'مربعة',
    tRect: 'مستطيلة',
    tBar: 'بار / كاونتر',
    tHigh: 'طاولة عالية',
    seats: 'مقاعد', tableName: 'طاولة',
    addedTableToast: (id) => `تمت إضافة الطاولة ${id}`,
    addedTableDesc: (s, z) => `${s} مقاعد · ${z} · اسحبها للموقع.`,
    addedElementToast: 'تمت إضافة العنصر',
    addedElementDesc: 'اسحب للموقع · انقر للتدوير.',
    viewNuit: 'عرض ليلي · وحدة الخدمة',
    viewJour: 'عرض نهاري · الخامات والديكور',
    snapOn: 'محاذاة',
    snapOff: 'حر',
    snapHint: 'المحاذاة تصفّ الطاولات على الشبكة',
    inspectorTitle: (id) => `طاولة ${id}`,
    inspectorNum: 'الرقم',
    inspectorType: 'النوع',
    inspectorSeats: 'المقاعد',
    inspectorStatus: 'الحالة',
    inspectorNotes: 'ملاحظات',
    inspectorServer: 'النادل المعين',
    reservationName: 'اسم الحجز',
    reservationTime: 'الوقت',
    reservationNamePlaceholder: 'مثال: بنعلي',
    inspectorRotate: 'تدوير',
    inspectorDuplicate: 'نسخ',
    inspectorDelete: 'حذف',
    inspectorDone: 'تم حفظ التعديلات',
    inspectorUnassigned: 'لا أحد',
    inspectorAddServer: '+ نادل آخر',
    inspectorNoStaff: 'لا يوجد نادل في فريقك بعد. أضفهم من الفريق لتعيينهم على الطاولات.',
    statusFree: 'متاحة',
    statusOccupied: 'مشغولة',
    statusReserved: 'محجوزة',
    statusCleaning: 'للتنظيف',
    selection: 'المحدد',
    bulkAlignH: 'محاذاة أفقيًا',
    bulkAlignV: 'محاذاة عموديًا',
    bulkDistH: 'توزيع أفقي',
    bulkDistV: 'توزيع عمودي',
    bulkDelete: 'حذف',
    bulkClear: 'إلغاء التحديد',
    bulkSetStatus: 'الحالة',
    bulkOkAlign: 'تمت محاذاة الطاولات',
    bulkOkDist: 'تم توزيع الطاولات بالتساوي',
    bulkOkDelete: (n) => `تم حذف ${n} طاولة`,
    bulkOkStatus: (n, s) => `تم تعيين ${n} طاولة على ${s}`,
    bulkHintNone: 'اضغط Shift وانقر لاختيار عدة طاولات · 2 على الأقل للمحاذاة.',
    groupTables: 'تجميع',
    ungroupTables: 'فصل',
    groupPickHint: 'انقر على طاولة أخرى لتجميعها مع هذه.',
    groupPickCancel: 'تم إلغاء التجميع',
    groupOk: (nums, covers) => `تم تجميع الطاولات ${nums} · ${covers} مقعدًا`,
    ungroupOk: 'تم فصل الطاولات',
    undoAction: 'تراجع',
    deleteUndone: 'تمت استعادة الطاولة',
    ungroupUndone: 'تمت استعادة المجموعة',
    bulkGroup: 'تجميع المحدد',
    bulkOkGroup: (n) => `تم تجميع ${n} طاولات`,
    groupCovers: (n) => `${n} مقعدًا`,
    groupedWith: (nums) => `مجمّعة مع ${nums}`,
    templatesTitle: 'قوالب القاعة',
    templatesDesc: 'ابدأ بترتيب جاهز · يمكنك تعديله لاحقًا.',
    tplBistro: 'بيسترو · 30 مقعدًا',
    tplBistroDesc: '8 طاولات داخلية + شرفة صغيرة · منطقة بار واحدة',
    tplResto: 'مطعم · 60 مقعدًا',
    tplRestoDesc: 'قاعة رئيسية 12 طاولة، شرفة، صالون خاص',
    tplCafe: 'مقهى · 20 مقعدًا',
    tplCafeDesc: '6 طاولات عالية، كاونتر، 3 طاولات مستديرة',
    tplBrasserie: 'شرفة برآسري · 80 مقعدًا',
    tplBrasserieDesc: 'شرفة كبيرة 10 طاولات، قاعة 8 طاولات، بار',
    tplBlank: 'مخطط فارغ',
    tplBlankDesc: 'ابدأ من الصفر · منطقة فارغة واحدة',
    tplApply: 'تحميل هذا القالب',
    tplApplyConfirm: (n) => `تحميل "${n}"؟`,
    tplApplyConfirmDesc: 'سيتم استبدال المخطط الحالي. صدّر أولًا إن أردت.',
    tplLoaded: (n) => `تم تحميل ${n}`,
    tplLoadedDesc: 'الترتيب الأولي جاهز · خصّص بحرية.',
    emptyTitle: 'ابدأ باختيار قالب',
    emptyDesc: 'أو أنشئ أول طاولة، يمكنك تعديل كل شيء لاحقًا.',
    emptyChoose: 'اختر قالبًا',
    emptyBlank: 'ابدأ فارغًا',
    rosterTitle: 'الفريق في الخدمة',
    rosterHint: 'اسحب الشارة فوق طاولة أو منطقة',
    rosterShift: 'وردية المساء',
    rosterUnassigned: 'غير معيّن',
    rosterTables: (n) => `${n} طاولات`,
    rosterCovers: (n) => `${n} مقاعد`,
    rosterEmpty: 'لا أحد في الخدمة. أضف نادلًا هنا، أو سجّل فريقك في صفحة الفريق · سيظهر تلقائيًا.',
    rosterAdd: '+ إضافة نادل',
    rosterAddTitle: 'إضافة نادل',
    rosterAddDesc: 'سينضم إلى الفريق في الخدمة ويمكن سحبه فوق طاولة أو منطقة.',
    rosterAddLabel: 'اسم النادل',
    rosterAddPlaceholder: 'مثال: كريم',
    rosterAddOk: 'إضافة',
    rosterAddDone: (n) => `${n} أُضيف إلى الخدمة`,
    rosterRemove: 'إزالة من الخدمة',
    rosterRemoveDone: (n) => `${n} أُزيل من الخدمة`,
    rosterRemoveDoneDesc: (n) => n ? `${n} طاولات تحرّرت.` : 'لم تكن أي طاولة مسندة.',
    clearAssign: 'مسح كل الإسنادات',
    clearAssignTitle: 'مسح كل الإسنادات؟',
    clearAssignDesc: 'لن يكون أي نادل مسندًا لأي طاولة. ستبقى فارغة حتى إعادة الإسناد.',
    clearAssignOk: 'مسح',
    clearAssignDone: 'تم مسح الإسنادات',
    clearAssignDoneDesc: 'كل الطاولات حرة من إسناد النوادل الآن.',
    assignDone: (s, t) => `تم إسناد ${s} للطاولة ${t}`,
    assignDoneDesc: 'مميز على المخطط · متزامن مع تطبيق النادل.',
    unassignDone: (t) => `تم تحرير ${t}`,
    rotateTitle: 'إعداد التدوير',
    rotateCTA: 'إعداد',
    rotateDesc: 'حين يتناوب النوادل، يبقون متحفزين ويتعلمون كل الطاولات.',
    rotatePeriod: 'الفترة',
    rotateDaily: 'كل يوم',
    rotateShift: 'كل وردية',
    rotateWeekly: 'كل أسبوع',
    rotateCustom: 'مخصص',
    rotateStrategy: 'الاستراتيجية',
    rotZones: 'تدوير المناطق',
    rotZonesDesc: 'النوادل يتنقلون بين المناطق (موصى به)',
    rotTables: 'تدوير الطاولات',
    rotTablesDesc: 'دورة كاملة على جميع الطاولات',
    rotPairs: 'تبادل أزواج يدوي',
    rotPairsDesc: 'تختار أنت الأزواج يدويًا',
    rotPreview: 'معاينة آخر 3 تدويرات قادمة',
    rotFairness: 'العدالة لكل نادل',
    rotApply: 'تطبيق التدوير',
    rotApplied: 'تم تطبيق التدوير',
    rotAppliedDesc: 'تم إعلام كل النوادل عبر تطبيقهم · تم تحديث المخطط.',
    rotNow: 'دوّر الآن',
    rotNowDone: 'تم التدوير',
    rotNowDoneDesc: 'الإسنادات الجديدة نشطة · النوادل تلقوا الإشعار.',
    rotHistoryTitle: 'سجل هذا الأسبوع',
    rotHistoryHint: 'تحقق بصريًا أن أحدًا لا يبقى في نفس المنطقة طويلًا.',
    rotNoneTitle: 'لم يتم إعداد تدوير',
    rotNoneDesc: 'اضبط تدويرًا حتى لا يبقى النوادل على نفس الطاولة لأشهر.',
    rotNoneCTA: 'إعداد',
    fairnessLow: 'عمل هذه المنطقة كثيرًا، جاء دوره',
    fairnessHigh: 'تدوير متوازن',
    legendTitle: 'الحالات',
    cancel: 'إلغاء',
    close: 'إغلاق',
    save2: 'حفظ',
    days: ['اث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'],
    soonAvailable: 'قريبًا',
    /* Scene picker */
    sceneLabel: 'ديكور المنطقة',
    sceneHint: (n) => `غيّر الخلفية البصرية${n ? ` لمنطقة "${n}"` : ' لهذه المنطقة'}، تجميلي فقط، لا يؤثر على طاولاتك.`,
    sceneSalle: 'صالة داخلية',
    sceneTerrasse: 'تراس خارجي',
    sceneBar: 'حانة / كاونتر',
    sceneEtage: 'الطابق العلوي',
    scenePrive: 'صالون خاص',
    sceneBlank: 'فارغ (بدون تجهيزات)',
    floorRDC: 'الطابق الأرضي',
    floorEtage: 'الطابق الأول',
    roomLabel: (zone) => `${zone} · رؤية المالك`,
    viewOwner: 'رؤية المالك',
    floorCount: (occ, total) => `${total} طاولة · ${occ} مشغولة`,
  },
};

/* ─── v2 strings ──────────────────────────────────────────────────────────
 *   Added by assignment rather than inline, so the three language blocks
 *   above stay diff-clean and a missing key is a visible undefined instead
 *   of a silent French fallback in an Arabic UI. */
Object.assign(PDS_STR.fr, {
  undo: 'Annuler', redo: 'Rétablir',
  undoNothing: 'Rien à annuler', redoNothing: 'Rien à rétablir',
  unitCm: 'cm', deletedSuffix: 'supprimé',
  roomTitle: 'La salle', roomHint: 'Sol, murs et dimensions de cette zone.',
  roomHintNuit: 'Dimensions de cette zone.',
  roomFloor: 'Sol', roomWall: 'Murs', roomFinish: 'Finition',
  roomW: 'Larg.', roomH: 'Prof.', roomWallW: 'Mur',
  finplain: 'Uni', finterrazzo: 'Terrazzo', finzellige: 'Zellige',
  finbois: 'Parquet', fincarreaux: 'Carreaux',
  grpservice: 'Service', grparchi: 'Architecture', grpsalle: 'Salle',
  fixcomptoir: 'Comptoir', fixcuisine: 'Cuisine', fixpasse: 'Passe-plat',
  fixcaisse: 'Caisse', fixvitrine: 'Vitrine', fixmur: 'Mur', fixporte: 'Entrée',
  fixfenetre: 'Fenêtre', fixcolonne: 'Colonne', fixescalier: 'Escalier',
  fixwc: 'WC', fixbanquette: 'Banquette', fixclaustra: 'Claustra',
  fixplante: 'Plante', fixtapis: 'Tapis', fixgarde: 'Garde-corps', fixtexte: 'Texte',
  matbone: 'Ivoire', matsand: 'Sable', matstone: 'Pierre', matclay: 'Argile',
  matoak: 'Chêne', matbrass: 'Laiton', matterra: 'Terracotta', matwalnut: 'Noyer',
  matsage: 'Sauge', matebony: 'Ébène', matcoal: 'Charbon', matink: 'Encre',
  matatlas: 'Atlas', matriad: 'Riad', matmint: 'Menthe', matglass: 'Verre',
  inspectorSeats: 'Couverts', inspectorLabel: 'Libellé', inspectorSize: 'Taille',
  inspectorRotation: 'Orientation', inspectorMaterial: 'Matière', inspectorDepth: 'Profondeur',
  layerBack: 'Arrière', layerFront: 'Avant',
  lock: 'Verrouiller', unlock: 'Déverrouiller',
  lockedHint: 'Verrouillé · déverrouillez pour modifier',
  rotateHint: 'Faire pivoter · Maj pour 15°',
  noRoom: 'Pas de place libre ici',
  ambianceLabel: 'Ambiance', customColor: 'Couleur libre',
  wizTitle: 'Composons votre salle', wizDesc: 'Huit questions, puis trois plans meublés à comparer.',
  scanSalle: 'Scanner ma salle', scanUnavailable: 'Scan indisponible',
  wizVenue: 'Type d’établissement', wizFloors: 'Combien d’étages ?',
  wizExtras: 'Vous avez aussi…', wizDims: 'Dimensions de la salle',
  wizW: 'Largeur', wizH: 'Profondeur', wizTables: 'Combien de tables ?',
  wizKitchen: 'La cuisine est de quel côté ?', wizEntrance: 'L’entrée est de quel côté ?',
  wizAlso: 'Aussi présent', wizGenerate: 'Composer mon plan', wizBack: 'Modifier',
  wizAgain: 'Régénérer', wizApply: 'Personnaliser ce plan',
  wizCardsNote: 'Chaque plan respecte des passages de service. Vous pourrez tout déplacer ensuite.',
  wizDone: (c) => `Plan composé · ${c} couverts`,
  wizDoneDesc: (n, a) => `${n} tables, passages de ${a} cm. Tout reste modifiable.`,
  wizShort: (n, r) => `${n} des ${r} tables demandées ne tiennent pas avec ces passages`,
  venuerestaurant: 'Restaurant', venuecafe: 'Café', venuesnack: 'Snack',
  venuepatisserie: 'Pâtisserie', venuerooftop: 'Rooftop',
  extraterrasse: 'Terrasse', extrapatio: 'Patio', extramezzanine: 'Mezzanine',
  extrasalon: 'Salon privé', extrabar: 'Bar',
  walln: 'Nord', walle: 'Est', walls: 'Sud', wallw: 'Ouest',
  vardense: 'Dense', varconfort: 'Confort', varbanquettes: 'Banquettes',
  covers: 'couverts', tables: 'tables', cover: 'couvert',
  aisleOf: (a) => `passages ${a} cm`,
  roomBackdrop: 'Fond', backdropNone: 'Aucun fond',
  ambriad: 'Riad', ambmarine: 'Bord de mer', ambbistrot: 'Néo-bistrot', ambjardin: 'Jardin',
  ambianceApplied: (n) => `Ambiance ${n} appliquée`,
  ambianceDesc: 'Sol, murs, tables et fond repeints ensemble. Les pièces peintes à la main sont conservées.',
  blockedHint: 'Chevauchement · relâchez pour poser à côté',
});
Object.assign(PDS_STR.en, {
  undo: 'Undo', redo: 'Redo',
  undoNothing: 'Nothing to undo', redoNothing: 'Nothing to redo',
  unitCm: 'cm', deletedSuffix: 'deleted',
  roomTitle: 'The room', roomHint: 'Floor, walls and dimensions of this zone.',
  roomHintNuit: 'Dimensions of this zone.',
  roomFloor: 'Floor', roomWall: 'Walls', roomFinish: 'Finish',
  roomW: 'Width', roomH: 'Depth', roomWallW: 'Wall',
  finplain: 'Plain', finterrazzo: 'Terrazzo', finzellige: 'Zellige',
  finbois: 'Wood', fincarreaux: 'Checker',
  grpservice: 'Service', grparchi: 'Architecture', grpsalle: 'Room',
  fixcomptoir: 'Counter', fixcuisine: 'Kitchen', fixpasse: 'Pass',
  fixcaisse: 'Till', fixvitrine: 'Display', fixmur: 'Wall', fixporte: 'Entrance',
  fixfenetre: 'Window', fixcolonne: 'Column', fixescalier: 'Stairs',
  fixwc: 'WC', fixbanquette: 'Banquette', fixclaustra: 'Screen',
  fixplante: 'Plant', fixtapis: 'Rug', fixgarde: 'Railing', fixtexte: 'Text',
  matbone: 'Bone', matsand: 'Sand', matstone: 'Stone', matclay: 'Clay',
  matoak: 'Oak', matbrass: 'Brass', matterra: 'Terracotta', matwalnut: 'Walnut',
  matsage: 'Sage', matebony: 'Ebony', matcoal: 'Charcoal', matink: 'Ink',
  matatlas: 'Atlas', matriad: 'Riad', matmint: 'Mint', matglass: 'Glass',
  inspectorSeats: 'Covers', inspectorLabel: 'Label', inspectorSize: 'Size',
  inspectorRotation: 'Orientation', inspectorMaterial: 'Material', inspectorDepth: 'Depth',
  layerBack: 'Send back', layerFront: 'Bring front',
  lock: 'Lock', unlock: 'Unlock',
  lockedHint: 'Locked · unlock to edit',
  rotateHint: 'Rotate · hold Shift for 15°',
  noRoom: 'No free space here',
  ambianceLabel: 'Ambiance', customColor: 'Custom colour',
  wizTitle: 'Let’s lay out your room', wizDesc: 'Eight questions, then three furnished plans to compare.',
  scanSalle: 'Scan my room', scanUnavailable: 'Scan unavailable',
  wizVenue: 'Type of venue', wizFloors: 'How many floors?',
  wizExtras: 'You also have…', wizDims: 'Room dimensions',
  wizW: 'Width', wizH: 'Depth', wizTables: 'How many tables?',
  wizKitchen: 'Which side is the kitchen?', wizEntrance: 'Which side is the entrance?',
  wizAlso: 'Also present', wizGenerate: 'Build my plan', wizBack: 'Edit answers',
  wizAgain: 'Regenerate', wizApply: 'Customise this plan',
  wizCardsNote: 'Every plan keeps real service aisles. You can move anything afterwards.',
  wizDone: (c) => `Plan built · ${c} covers`,
  wizDoneDesc: (n, a) => `${n} tables, ${a} cm aisles. Everything stays editable.`,
  wizShort: (n, r) => `${n} of the ${r} tables asked for do not fit at these aisles`,
  venuerestaurant: 'Restaurant', venuecafe: 'Café', venuesnack: 'Snack',
  venuepatisserie: 'Pâtisserie', venuerooftop: 'Rooftop',
  extraterrasse: 'Terrace', extrapatio: 'Patio', extramezzanine: 'Mezzanine',
  extrasalon: 'Private room', extrabar: 'Bar',
  walln: 'North', walle: 'East', walls: 'South', wallw: 'West',
  vardense: 'Dense', varconfort: 'Comfort', varbanquettes: 'Banquettes',
  covers: 'covers', tables: 'tables', cover: 'cover',
  aisleOf: (a) => `${a} cm aisles`,
  roomBackdrop: 'Backdrop', backdropNone: 'No backdrop',
  ambriad: 'Riad', ambmarine: 'Seaside', ambbistrot: 'Neo-bistro', ambjardin: 'Garden',
  ambianceApplied: (n) => `${n} ambiance applied`,
  ambianceDesc: 'Floor, walls, tables and backdrop repainted together. Hand-picked pieces are kept.',
  blockedHint: 'Overlapping · release to settle beside it',
});
Object.assign(PDS_STR.ar, {
  undo: 'تراجع', redo: 'إعادة',
  undoNothing: 'لا شيء للتراجع عنه', redoNothing: 'لا شيء لإعادته',
  unitCm: 'سم', deletedSuffix: 'حُذف',
  roomTitle: 'القاعة', roomHint: 'الأرضية والجدران وأبعاد هذه المنطقة.',
  roomHintNuit: 'أبعاد هذه المنطقة.',
  roomFloor: 'الأرضية', roomWall: 'الجدران', roomFinish: 'التشطيب',
  roomW: 'العرض', roomH: 'العمق', roomWallW: 'الجدار',
  finplain: 'سادة', finterrazzo: 'تيرازو', finzellige: 'زليج',
  finbois: 'خشب', fincarreaux: 'مربعات',
  grpservice: 'الخدمة', grparchi: 'العمارة', grpsalle: 'القاعة',
  fixcomptoir: 'الكونتوار', fixcuisine: 'المطبخ', fixpasse: 'ممر الأطباق',
  fixcaisse: 'الصندوق', fixvitrine: 'واجهة العرض', fixmur: 'جدار', fixporte: 'المدخل',
  fixfenetre: 'نافذة', fixcolonne: 'عمود', fixescalier: 'درج',
  fixwc: 'المرافق', fixbanquette: 'أريكة', fixclaustra: 'حاجز',
  fixplante: 'نبتة', fixtapis: 'زربية', fixgarde: 'حاجز واقٍ', fixtexte: 'نص',
  matbone: 'عاجي', matsand: 'رملي', matstone: 'حجري', matclay: 'طيني',
  matoak: 'بلوط', matbrass: 'نحاس', matterra: 'فخاري', matwalnut: 'جوز',
  matsage: 'مريمية', matebony: 'أبنوس', matcoal: 'فحمي', matink: 'حبري',
  matatlas: 'أطلس', matriad: 'رياض', matmint: 'نعناع', matglass: 'زجاج',
  inspectorSeats: 'المقاعد', inspectorLabel: 'التسمية', inspectorSize: 'الحجم',
  inspectorRotation: 'الاتجاه', inspectorMaterial: 'المادة', inspectorDepth: 'العمق',
  layerBack: 'إلى الخلف', layerFront: 'إلى الأمام',
  lock: 'قفل', unlock: 'فتح',
  lockedHint: 'مقفل · افتح القفل للتعديل',
  rotateHint: 'تدوير · اضغط Shift لـ 15°',
  noRoom: 'لا توجد مساحة فارغة هنا',
  ambianceLabel: 'الأجواء', customColor: 'لون حر',
  wizTitle: 'لنرتّب قاعتك', wizDesc: 'ثمانية أسئلة، ثم ثلاثة مخططات مؤثّثة للمقارنة.',
  scanSalle: 'مسح قاعتي بالصورة', scanUnavailable: 'المسح غير متاح',
  wizVenue: 'نوع المحل', wizFloors: 'كم طابقًا؟',
  wizExtras: 'لديك أيضًا…', wizDims: 'أبعاد القاعة',
  wizW: 'العرض', wizH: 'العمق', wizTables: 'كم طاولة؟',
  wizKitchen: 'في أي جهة المطبخ؟', wizEntrance: 'في أي جهة المدخل؟',
  wizAlso: 'موجود أيضًا', wizGenerate: 'أنشئ مخططي', wizBack: 'تعديل',
  wizAgain: 'إعادة الإنشاء', wizApply: 'خصّص هذا المخطط',
  wizCardsNote: 'كل مخطط يحترم ممرات الخدمة. يمكنك تحريك كل شيء بعد ذلك.',
  wizDone: (c) => `تم إنشاء المخطط · ${c} مقعدًا`,
  wizDoneDesc: (n, a) => `${n} طاولة، ممرات ${a} سم. كل شيء قابل للتعديل.`,
  wizShort: (n, r) => `${n} من ${r} طاولة مطلوبة لا تتّسع بهذه الممرات`,
  venuerestaurant: 'مطعم', venuecafe: 'مقهى', venuesnack: 'سناك',
  venuepatisserie: 'حلويات', venuerooftop: 'سطح',
  extraterrasse: 'تراس', extrapatio: 'فناء', extramezzanine: 'ميزانين',
  extrasalon: 'صالون خاص', extrabar: 'بار',
  walln: 'شمال', walle: 'شرق', walls: 'جنوب', wallw: 'غرب',
  vardense: 'مكثّف', varconfort: 'مريح', varbanquettes: 'أرائك',
  covers: 'مقعدًا', tables: 'طاولة', cover: 'مقعد',
  aisleOf: (a) => `ممرات ${a} سم`,
  roomBackdrop: 'الخلفية', backdropNone: 'بدون خلفية',
  ambriad: 'رياض', ambmarine: 'شاطئ', ambbistrot: 'بيسترو', ambjardin: 'حديقة',
  ambianceApplied: (n) => `تم تطبيق أجواء ${n}`,
  ambianceDesc: 'الأرضية والجدران والطاولات والخلفية أُعيد طلاؤها معًا. القطع الملوّنة يدويًا تبقى كما هي.',
  blockedHint: 'تداخل · أفلت ليستقر بجانبه',
});

/* ─── v3 strings · the live room, honest actions, editor tools ───────────
 *   Same rule as v2: one block per language, a missing key shows up as
 *   `undefined` in that language instead of silently falling back. */
Object.assign(PDS_STR.fr, {
  modeLayoutDesc: 'Glissez pour placer · cliquez pour modifier.',
  modeAssignDesc: 'Glissez un serveur sur une table ou un onglet de zone.',
  modeRotateDesc: 'Les serveurs changent de zone à chaque période.',
  snapOn: 'Grille', snapOff: 'Libre', snapHint: 'Aligner les objets sur une grille de 16 cm',
  statusFree: 'Libre', statusOrdering: 'À commander', statusOccupied: 'En cours', statusBill: 'Addition',
  statusPaid: 'Réglée', statusReserved: 'Réservée', statusOut: 'Hors service', statusCleaning: 'Réglée',
  kpiTablesD: (free, n) => `${free} libre${free > 1 ? 's' : ''} sur ${n}`,
  kpiCoversLive: 'COUVERTS EN SALLE', kpiCoversD: (cap) => `capacité ${cap}`,
  kpiCoversPlan: 'CAPACITÉ', kpiCoversPlanD: (n) => `${n} table${n > 1 ? 's' : ''}`,
  kpiBills: 'ADDITIONS OUVERTES', kpiBillsD: (n) => n ? `${n} addition${n > 1 ? 's' : ''} demandée${n > 1 ? 's' : ''}` : 'aucune demandée',
  kpiZonesD: (n) => n > 1 ? `${n} zones` : '1 zone',
  kpiServersD: (on, n) => on == null ? `${n} dans le plan` : `${on} en service sur ${n}`,
  mad: (v) => `${Math.round(v).toLocaleString('fr-FR')} MAD`,
  liveOn: 'Caisse en direct', liveStale: (t) => `Hors ligne · vu à ${t}`, liveDemo: 'Démo · statuts saisis à la main',
  liveOffline: 'Caisse injoignable · statuts du plan', liveNone: 'Statuts saisis à la main',
  liveNoTill: 'Aucune caisse connectée', liveTillAway: (t) => `Caisse hors ligne · vue à ${t}`,
  liveTitle: 'En ce moment', liveBills: 'Additions demandées', liveCheck: 'Ouvertes depuis plus de 4 h',
  liveCheckHint: 'Probablement oubliées sur la caisse. Vérifiez puis libérez-les depuis la caisse.',
  liveUpcoming: 'Réservations du jour', liveUnplaced: 'Sans table', livePlace: 'Placer',
  livePlaced: (n, t) => `${n} placé·e à la table ${t}`, liveNoFit: 'Aucune table libre ne convient',
  liveNoBookings: 'Aucune réservation aujourd’hui.', liveToday: 'Aujourd’hui',
  liveTurns: (n) => `${n} tour${n > 1 ? 's' : ''}`, liveOpen: (n) => `${n} en cours`, liveAvg: (m) => `${m} min en moyenne`,
  liveRevSeat: (v) => `${v} par place`, liveNoStats: 'Les tours et le chiffre par table apparaissent dès la première addition encaissée.',
  checkTable: 'à vérifier', since: (l) => `depuis ${l}`, nextAt: (t, n) => `${t} · ${n}`,
  tillStatus: 'Statut de la caisse', tillStatusHint: 'Ce statut vient de la caisse. Il change quand l’équipe encaisse ou ouvre la table.',
  holdLabel: 'Réservation ou blocage', holdNone: 'Aucun', holdReserved: 'Réservée', holdOut: 'Hors service',
  coversNow: (c, s) => `${c} / ${s} couverts`, billNow: 'Addition en cours', liveAllFree: 'Toutes les tables sont libres.',
  filterAll: 'Tout afficher', heatLabel: 'Afficher', heatStatus: 'Statut', heatRevenue: 'Chiffre', heatTurns: 'Tours',
  heatNeedsLive: 'Disponible quand la caisse est connectée',
  zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', zoomFit: 'Ajuster', zoomFitHint: 'Ajuster la salle à l’écran',
  shapeRound: 'Ronde', shapeSquare: 'Carrée', shapeRect: 'Longue', shapeBar: 'Comptoir', shapeHigh: 'Haute',
  paletteSeats: 'Places', paletteHint: 'Choisissez le nombre de places, puis la forme.',
  editHint: 'Cliquez un objet pour le modifier. Maj ou ⌘ pour en sélectionner plusieurs, ou tracez un cadre.',
  bulkHintNone: 'Tracez un cadre sur le plan, ou Maj/⌘ + clic, pour sélectionner plusieurs tables.',
  kbdHint: 'Flèches pour déplacer · ⌘D dupliquer · ⌘C / ⌘V · Suppr pour effacer',
  renumber: 'Renuméroter', renumberTitle: 'Renuméroter les tables',
  renumberDesc: 'Les numéros suivent l’ordre de lecture de chaque zone, de gauche à droite puis de haut en bas.',
  renumberFlat: 'Numéros continus', renumberFlatDesc: '1, 2, 3… dans toutes les zones',
  renumberPrefix: 'Une centaine par zone', renumberPrefixDesc: 'Première zone 1, 2…, puis 101, 102…, puis 201… Lisible sur le pavé de la caisse.',
  renumberOk: 'Renuméroter', renumberDone: (n) => `${n} tables renumérotées`,
  dupNums: (nums) => `Numéros en double : ${nums}`, dupNumField: 'Ce numéro est déjà pris',
  zoneMoveL: 'Déplacer à gauche', zoneMoveR: 'Déplacer à droite', zoneDuplicate: 'Dupliquer la zone',
  zoneDuplicated: (n) => `Zone « ${n} » dupliquée`, zoneColor: 'Couleur de la zone', zoneCopy: (n) => `${n} (copie)`,
  zoneTools: 'Zone', copied: (n) => `${n} objet${n > 1 ? 's' : ''} copié${n > 1 ? 's' : ''}`,
  pasted: (n) => `${n} objet${n > 1 ? 's' : ''} collé${n > 1 ? 's' : ''}`,
  maxServersTitle: '3 serveurs maximum', maxServersDesc: 'Retirez un serveur de cette table avant d’en ajouter un autre.',
  zoneAssigned: (s, z) => `${s} → ${z}`, zoneAssignedDesc: (n) => `${n} table${n > 1 ? 's' : ''} affectée${n > 1 ? 's' : ''}.`,
  assignDoneDesc: 'L’app serveur affiche ses tables à sa prochaine synchronisation.',
  onShift: 'En service', offShift: 'Absent', onPause: 'En pause',
  rosterShiftNow: (n) => `${n} en service maintenant`,
  footMeta: (t, z, c) => `${t} table${t > 1 ? 's' : ''} · ${z} zone${z > 1 ? 's' : ''} · ${c} couvert${c > 1 ? 's' : ''}`,
  autosaved: 'Enregistré automatiquement',
  export: 'Exporter', exportTitle: 'Exporter le plan', exportDesc: 'Imprimez le plan pour le briefing ou envoyez l’image sur WhatsApp.',
  exportPrint: 'Imprimer ou PDF', exportPrintDesc: 'Une page A3 paysage par zone, avec les serveurs.',
  exportPng: 'Image PNG', exportPngDesc: (z) => `La zone « ${z} », en haute définition.`,
  exportDone: 'Image téléchargée', exportBlocked: 'Autorisez les fenêtres pour imprimer le plan.',
  exportServers: 'Serveurs', exportPrinted: (d) => `Imprimé le ${d}`,
  versions: 'Versions', versionsTitle: 'Versions du plan',
  versionsDesc: 'Gardez plusieurs dispositions (été, Ramadan, privatisation) et passez de l’une à l’autre.',
  versionSave: 'Enregistrer la disposition actuelle', versionName: 'Nom de la version', versionNamePh: 'ex. Terrasse été',
  versionSaved: (n) => `Version « ${n} » enregistrée`, versionApply: 'Utiliser', versionDelete: 'Supprimer',
  versionApplied: (n) => `Version « ${n} » chargée`, versionAppliedDesc: 'Votre plan précédent est gardé dans Versions.',
  versionEmpty: 'Aucune version enregistrée.', versionAuto: (d) => `Avant réinitialisation · ${d}`,
  versionBefore: (n) => `Avant « ${n} »`, versionMeta: (t, c) => `${t} table${t > 1 ? 's' : ''} · ${c} couvert${c > 1 ? 's' : ''}`,
  resetTitle: 'Réinitialiser le plan ?',
  resetDesc: (t, z) => `Le plan est remplacé par ${t ? `le modèle de départ (${t} tables, ${z} zone${z > 1 ? 's' : ''})` : 'une salle vide'}. Une copie du plan actuel est gardée dans Versions.`,
  resetDoneDesc: 'Une copie de l’ancien plan est dans Versions.',
  rotateDesc: 'Les serveurs changent de zone ou de tables à chaque période, pour que personne ne garde les mêmes tables des mois durant.',
  rotateAuto: (p) => `S’applique ${p}, dès que le plan de salle s’ouvre sur un appareil.`,
  rotateAutoShift: 'à chaque service (midi, soir)', rotateAutoDaily: 'chaque jour', rotateAutoWeekly: 'chaque semaine',
  rotateOff: 'Rotation automatique désactivée', rotateEnable: 'Rotation automatique', rotateLast: (d) => `Dernière rotation · ${d}`,
  rotateNever: 'Aucune rotation encore', rotateShift: 'Chaque service',
  rotPairsDesc: 'Deux serveurs échangent leurs tables à chaque rotation.',
  rotPairsPick: 'Binômes', rotPairsAdd: '+ Ajouter un binôme', rotPairsNone: 'Ajoutez au moins un binôme.',
  rotApplied: 'Rotation enregistrée',
  rotAppliedDesc: 'L’app serveur affiche les nouvelles tables à sa prochaine synchronisation.',
  rotNowDone: 'Rotation effectuée', rotNowDoneDesc: 'Nouvelles affectations publiées pour l’app serveur.',
  rotAutoDone: 'Rotation du service appliquée', rotNeedStaff: 'Il faut au moins deux serveurs pour tourner.',
  rotHistoryTitle: 'Historique des rotations', rotHistoryEmpty: 'L’historique se remplit à chaque rotation.',
  fairnessEmpty: 'Pas encore assez d’historique pour mesurer l’équité.',
  services: { midi: 'midi', soir: 'soir' },
  versionsCount: (n) => n ? `${n}` : '',
  liveSoon: (t) => `à ${t}`,
});
Object.assign(PDS_STR.en, {
  modeLayoutDesc: 'Drag to place · click to edit.',
  modeAssignDesc: 'Drag a server onto a table or a zone tab.',
  modeRotateDesc: 'Servers change zone every period.',
  snapOn: 'Grid', snapOff: 'Free', snapHint: 'Align objects to a 16 cm grid',
  statusFree: 'Free', statusOrdering: 'To order', statusOccupied: 'Seated', statusBill: 'Bill',
  statusPaid: 'Paid', statusReserved: 'Reserved', statusOut: 'Out of service', statusCleaning: 'Paid',
  kpiTablesD: (free, n) => `${free} free of ${n}`,
  kpiCoversLive: 'COVERS SEATED', kpiCoversD: (cap) => `capacity ${cap}`,
  kpiCoversPlan: 'CAPACITY', kpiCoversPlanD: (n) => `${n} table${n === 1 ? '' : 's'}`,
  kpiBills: 'OPEN BILLS', kpiBillsD: (n) => n ? `${n} bill${n > 1 ? 's' : ''} requested` : 'none requested',
  kpiZonesD: (n) => n > 1 ? `${n} zones` : '1 zone',
  kpiServersD: (on, n) => on == null ? `${n} on the plan` : `${on} on shift of ${n}`,
  mad: (v) => `${Math.round(v).toLocaleString('en-GB')} MAD`,
  liveOn: 'Till live', liveStale: (t) => `Offline · seen at ${t}`, liveDemo: 'Demo · statuses set by hand',
  liveOffline: 'Till unreachable · plan statuses', liveNone: 'Statuses set by hand',
  liveNoTill: 'No till connected', liveTillAway: (t) => `Till offline · seen at ${t}`,
  liveTitle: 'Right now', liveBills: 'Bills requested', liveCheck: 'Open for more than 4 h',
  liveCheckHint: 'Probably left open on the till. Check, then free them from the till.',
  liveUpcoming: 'Today’s bookings', liveUnplaced: 'No table', livePlace: 'Seat',
  livePlaced: (n, t) => `${n} placed at table ${t}`, liveNoFit: 'No free table fits',
  liveNoBookings: 'No bookings today.', liveToday: 'Today',
  liveTurns: (n) => `${n} turn${n > 1 ? 's' : ''}`, liveOpen: (n) => `${n} in progress`, liveAvg: (m) => `${m} min on average`,
  liveRevSeat: (v) => `${v} per seat`, liveNoStats: 'Turns and revenue per table appear after the first bill is paid.',
  checkTable: 'check', since: (l) => `for ${l}`, nextAt: (t, n) => `${t} · ${n}`,
  tillStatus: 'Till status', tillStatusHint: 'This status comes from the till. It changes when the team opens or settles the table.',
  holdLabel: 'Booking or block', holdNone: 'None', holdReserved: 'Reserved', holdOut: 'Out of service',
  coversNow: (c, s) => `${c} / ${s} covers`, billNow: 'Current bill', liveAllFree: 'Every table is free.',
  filterAll: 'Show all', heatLabel: 'Show', heatStatus: 'Status', heatRevenue: 'Revenue', heatTurns: 'Turns',
  heatNeedsLive: 'Available once the till is connected',
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomFit: 'Fit', zoomFitHint: 'Fit the room to the screen',
  shapeRound: 'Round', shapeSquare: 'Square', shapeRect: 'Long', shapeBar: 'Counter', shapeHigh: 'High',
  paletteSeats: 'Seats', paletteHint: 'Pick the number of seats, then the shape.',
  editHint: 'Click an object to edit it. Shift or ⌘ to pick several, or drag a frame.',
  bulkHintNone: 'Drag a frame on the plan, or Shift/⌘ + click, to select several tables.',
  kbdHint: 'Arrows to move · ⌘D duplicate · ⌘C / ⌘V · Delete to remove',
  renumber: 'Renumber', renumberTitle: 'Renumber tables',
  renumberDesc: 'Numbers follow each zone’s reading order, left to right then top to bottom.',
  renumberFlat: 'Continuous numbers', renumberFlatDesc: '1, 2, 3… across every zone',
  renumberPrefix: 'A hundred per zone', renumberPrefixDesc: 'First zone 1, 2…, then 101, 102…, then 201… Easy on the till keypad.',
  renumberOk: 'Renumber', renumberDone: (n) => `${n} tables renumbered`,
  dupNums: (nums) => `Duplicate numbers: ${nums}`, dupNumField: 'This number is already used',
  zoneMoveL: 'Move left', zoneMoveR: 'Move right', zoneDuplicate: 'Duplicate zone',
  zoneDuplicated: (n) => `Zone “${n}” duplicated`, zoneColor: 'Zone colour', zoneCopy: (n) => `${n} (copy)`,
  zoneTools: 'Zone', copied: (n) => `${n} object${n > 1 ? 's' : ''} copied`,
  pasted: (n) => `${n} object${n > 1 ? 's' : ''} pasted`,
  maxServersTitle: '3 servers maximum', maxServersDesc: 'Remove a server from this table before adding another.',
  zoneAssigned: (s, z) => `${s} → ${z}`, zoneAssignedDesc: (n) => `${n} table${n > 1 ? 's' : ''} assigned.`,
  assignDoneDesc: 'The server app shows their tables at its next sync.',
  onShift: 'On shift', offShift: 'Off', onPause: 'On break',
  rosterShiftNow: (n) => `${n} on shift now`,
  footMeta: (t, z, c) => `${t} table${t === 1 ? '' : 's'} · ${z} zone${z === 1 ? '' : 's'} · ${c} cover${c === 1 ? '' : 's'}`,
  autosaved: 'Saved automatically',
  export: 'Export', exportTitle: 'Export the plan', exportDesc: 'Print the plan for the briefing or send the image on WhatsApp.',
  exportPrint: 'Print or PDF', exportPrintDesc: 'One A3 landscape page per zone, with servers.',
  exportPng: 'PNG image', exportPngDesc: (z) => `The “${z}” zone, in high definition.`,
  exportDone: 'Image downloaded', exportBlocked: 'Allow pop-ups to print the plan.',
  exportServers: 'Servers', exportPrinted: (d) => `Printed ${d}`,
  versions: 'Versions', versionsTitle: 'Plan versions',
  versionsDesc: 'Keep several layouts (summer, Ramadan, private event) and switch between them.',
  versionSave: 'Save the current layout', versionName: 'Version name', versionNamePh: 'e.g. Summer terrace',
  versionSaved: (n) => `Version “${n}” saved`, versionApply: 'Use', versionDelete: 'Delete',
  versionApplied: (n) => `Version “${n}” loaded`, versionAppliedDesc: 'Your previous plan is kept in Versions.',
  versionEmpty: 'No saved versions.', versionAuto: (d) => `Before reset · ${d}`,
  versionBefore: (n) => `Before “${n}”`, versionMeta: (t, c) => `${t} table${t === 1 ? '' : 's'} · ${c} cover${c === 1 ? '' : 's'}`,
  resetTitle: 'Reset the plan?',
  resetDesc: (t, z) => `The plan is replaced by ${t ? `the starter layout (${t} tables, ${z} zone${z > 1 ? 's' : ''})` : 'an empty room'}. A copy of the current plan is kept in Versions.`,
  resetDoneDesc: 'A copy of the old plan is in Versions.',
  rotateDesc: 'Servers change zone or tables every period, so nobody keeps the same tables for months.',
  rotateAuto: (p) => `Applies ${p}, as soon as the floor plan is opened on any device.`,
  rotateAutoShift: 'every service (lunch, dinner)', rotateAutoDaily: 'every day', rotateAutoWeekly: 'every week',
  rotateOff: 'Automatic rotation off', rotateEnable: 'Automatic rotation', rotateLast: (d) => `Last rotation · ${d}`,
  rotateNever: 'No rotation yet', rotateShift: 'Every service',
  rotPairsDesc: 'Two servers swap tables at each rotation.',
  rotPairsPick: 'Pairs', rotPairsAdd: '+ Add a pair', rotPairsNone: 'Add at least one pair.',
  rotApplied: 'Rotation saved',
  rotAppliedDesc: 'The server app shows the new tables at its next sync.',
  rotNowDone: 'Rotation done', rotNowDoneDesc: 'New assignments published for the server app.',
  rotAutoDone: 'Service rotation applied', rotNeedStaff: 'At least two servers are needed to rotate.',
  rotHistoryTitle: 'Rotation history', rotHistoryEmpty: 'History fills up with each rotation.',
  fairnessEmpty: 'Not enough history yet to measure fairness.',
  services: { midi: 'lunch', soir: 'dinner' },
  versionsCount: (n) => n ? `${n}` : '',
  liveSoon: (t) => `at ${t}`,
});
Object.assign(PDS_STR.ar, {
  modeLayoutDesc: 'اسحب للوضع · انقر للتعديل.',
  modeAssignDesc: 'اسحب نادلاً فوق طاولة أو تبويب منطقة.',
  modeRotateDesc: 'يغيّر النُّدُل المنطقة في كل فترة.',
  snapOn: 'الشبكة', snapOff: 'حر', snapHint: 'محاذاة العناصر على شبكة 16 سم',
  statusFree: 'فارغة', statusOrdering: 'في انتظار الطلب', statusOccupied: 'مشغولة', statusBill: 'الحساب',
  statusPaid: 'مدفوعة', statusReserved: 'محجوزة', statusOut: 'خارج الخدمة', statusCleaning: 'مدفوعة',
  kpiTablesD: (free, n) => `${free} فارغة من ${n}`,
  kpiCoversLive: 'الزبائن في القاعة', kpiCoversD: (cap) => `السعة ${cap}`,
  kpiCoversPlan: 'السعة', kpiCoversPlanD: (n) => `${n} طاولة`,
  kpiBills: 'الحسابات المفتوحة', kpiBillsD: (n) => n ? `${n} طلب حساب` : 'لا طلبات',
  kpiZonesD: (n) => `${n} منطقة`,
  kpiServersD: (on, n) => on == null ? `${n} في المخطط` : `${on} في الخدمة من ${n}`,
  mad: (v) => `${Math.round(v).toLocaleString('ar-MA')} درهم`,
  liveOn: 'الصندوق مباشر', liveStale: (t) => `غير متصل · آخر ظهور ${t}`, liveDemo: 'عرض تجريبي · حالات يدوية',
  liveOffline: 'تعذّر الوصول إلى الصندوق · حالات المخطط', liveNone: 'حالات يدوية',
  liveNoTill: 'لا يوجد صندوق متصل', liveTillAway: (t) => `الصندوق غير متصل · آخر ظهور ${t}`,
  liveTitle: 'الآن', liveBills: 'طلبات الحساب', liveCheck: 'مفتوحة منذ أكثر من 4 ساعات',
  liveCheckHint: 'على الأرجح نُسيت في الصندوق. تحقّق ثم حرّرها من الصندوق.',
  liveUpcoming: 'حجوزات اليوم', liveUnplaced: 'بدون طاولة', livePlace: 'إجلاس',
  livePlaced: (n, t) => `${n} على الطاولة ${t}`, liveNoFit: 'لا توجد طاولة فارغة مناسبة',
  liveNoBookings: 'لا حجوزات اليوم.', liveToday: 'اليوم',
  liveTurns: (n) => `${n} دورة`, liveOpen: (n) => `${n} جارية`, liveAvg: (m) => `${m} د في المتوسط`,
  liveRevSeat: (v) => `${v} لكل مقعد`, liveNoStats: 'تظهر الدورات ورقم المعاملات لكل طاولة بعد أول حساب مدفوع.',
  checkTable: 'للتحقق', since: (l) => `منذ ${l}`, nextAt: (t, n) => `${t} · ${n}`,
  tillStatus: 'حالة الصندوق', tillStatusHint: 'هذه الحالة تأتي من الصندوق وتتغيّر عندما يفتح الفريق الطاولة أو يدفع الحساب.',
  holdLabel: 'حجز أو إيقاف', holdNone: 'لا شيء', holdReserved: 'محجوزة', holdOut: 'خارج الخدمة',
  coversNow: (c, s) => `${c} / ${s} مقعد`, billNow: 'الحساب الحالي', liveAllFree: 'كل الطاولات فارغة.',
  filterAll: 'عرض الكل', heatLabel: 'عرض', heatStatus: 'الحالة', heatRevenue: 'المداخيل', heatTurns: 'الدورات',
  heatNeedsLive: 'متاح عند ربط الصندوق',
  zoomIn: 'تكبير', zoomOut: 'تصغير', zoomFit: 'ملاءمة', zoomFitHint: 'ملاءمة القاعة مع الشاشة',
  shapeRound: 'دائرية', shapeSquare: 'مربعة', shapeRect: 'طويلة', shapeBar: 'كونتوار', shapeHigh: 'عالية',
  paletteSeats: 'المقاعد', paletteHint: 'اختر عدد المقاعد ثم الشكل.',
  editHint: 'انقر عنصرًا لتعديله. Shift أو ⌘ لاختيار عدة عناصر، أو ارسم إطارًا.',
  bulkHintNone: 'ارسم إطارًا على المخطط، أو Shift/⌘ + نقرة، لاختيار عدة طاولات.',
  kbdHint: 'الأسهم للتحريك · ⌘D تكرار · ⌘C / ⌘V · Delete للحذف',
  renumber: 'إعادة الترقيم', renumberTitle: 'إعادة ترقيم الطاولات',
  renumberDesc: 'تتبع الأرقام ترتيب القراءة في كل منطقة، من اليسار إلى اليمين ثم من الأعلى إلى الأسفل.',
  renumberFlat: 'أرقام متتالية', renumberFlatDesc: '1، 2، 3… في كل المناطق',
  renumberPrefix: 'مئة لكل منطقة', renumberPrefixDesc: 'المنطقة الأولى 1، 2…، ثم 101، 102…، ثم 201… سهل على لوحة الصندوق.',
  renumberOk: 'إعادة الترقيم', renumberDone: (n) => `أُعيد ترقيم ${n} طاولة`,
  dupNums: (nums) => `أرقام مكرّرة: ${nums}`, dupNumField: 'هذا الرقم مستعمل',
  zoneMoveL: 'نقل إلى اليسار', zoneMoveR: 'نقل إلى اليمين', zoneDuplicate: 'تكرار المنطقة',
  zoneDuplicated: (n) => `تم تكرار منطقة «${n}»`, zoneColor: 'لون المنطقة', zoneCopy: (n) => `${n} (نسخة)`,
  zoneTools: 'المنطقة', copied: (n) => `نُسخ ${n} عنصر`, pasted: (n) => `أُلصق ${n} عنصر`,
  maxServersTitle: '3 نُدُل كحد أقصى', maxServersDesc: 'أزل نادلاً من هذه الطاولة قبل إضافة آخر.',
  zoneAssigned: (s, z) => `${s} ← ${z}`, zoneAssignedDesc: (n) => `أُسندت ${n} طاولة.`,
  assignDoneDesc: 'يعرض تطبيق النادل طاولاته عند المزامنة التالية.',
  onShift: 'في الخدمة', offShift: 'غائب', onPause: 'في استراحة',
  rosterShiftNow: (n) => `${n} في الخدمة الآن`,
  footMeta: (t, z, c) => `${t} طاولة · ${z} منطقة · ${c} مقعد`,
  autosaved: 'حُفظ تلقائيًا',
  export: 'تصدير', exportTitle: 'تصدير المخطط', exportDesc: 'اطبع المخطط للاجتماع أو أرسل الصورة عبر واتساب.',
  exportPrint: 'طباعة أو PDF', exportPrintDesc: 'صفحة A3 أفقية لكل منطقة مع النُّدُل.',
  exportPng: 'صورة PNG', exportPngDesc: (z) => `منطقة «${z}» بدقة عالية.`,
  exportDone: 'تم تنزيل الصورة', exportBlocked: 'اسمح بالنوافذ المنبثقة لطباعة المخطط.',
  exportServers: 'النُّدُل', exportPrinted: (d) => `طُبع في ${d}`,
  versions: 'النسخ', versionsTitle: 'نسخ المخطط',
  versionsDesc: 'احتفظ بعدة ترتيبات (الصيف، رمضان، حفلة خاصة) وانتقل بينها.',
  versionSave: 'حفظ الترتيب الحالي', versionName: 'اسم النسخة', versionNamePh: 'مثال: تراس الصيف',
  versionSaved: (n) => `حُفظت نسخة «${n}»`, versionApply: 'استعمال', versionDelete: 'حذف',
  versionApplied: (n) => `حُمّلت نسخة «${n}»`, versionAppliedDesc: 'مخططك السابق محفوظ في النسخ.',
  versionEmpty: 'لا توجد نسخ محفوظة.', versionAuto: (d) => `قبل إعادة التعيين · ${d}`,
  versionBefore: (n) => `قبل «${n}»`, versionMeta: (t, c) => `${t} طاولة · ${c} مقعد`,
  resetTitle: 'إعادة تعيين المخطط؟',
  resetDesc: (t, z) => `سيُستبدل المخطط ${t ? `بالترتيب الأولي (${t} طاولة، ${z} منطقة)` : 'بقاعة فارغة'}. تُحفظ نسخة من المخطط الحالي في النسخ.`,
  resetDoneDesc: 'نسخة من المخطط القديم في النسخ.',
  rotateDesc: 'يغيّر النُّدُل المنطقة أو الطاولات في كل فترة، حتى لا يبقى أحد على الطاولات نفسها لأشهر.',
  rotateAuto: (p) => `تُطبَّق ${p} بمجرد فتح مخطط القاعة على أي جهاز.`,
  rotateAutoShift: 'في كل خدمة (غداء، عشاء)', rotateAutoDaily: 'كل يوم', rotateAutoWeekly: 'كل أسبوع',
  rotateOff: 'التدوير التلقائي متوقف', rotateEnable: 'التدوير التلقائي', rotateLast: (d) => `آخر تدوير · ${d}`,
  rotateNever: 'لا تدوير بعد', rotateShift: 'كل خدمة',
  rotPairsDesc: 'يتبادل نادلان طاولاتهما في كل تدوير.',
  rotPairsPick: 'الثنائيات', rotPairsAdd: '+ إضافة ثنائي', rotPairsNone: 'أضف ثنائيًا واحدًا على الأقل.',
  rotApplied: 'حُفظ التدوير',
  rotAppliedDesc: 'يعرض تطبيق النادل الطاولات الجديدة عند المزامنة التالية.',
  rotNowDone: 'تم التدوير', rotNowDoneDesc: 'نُشرت الإسنادات الجديدة لتطبيق النادل.',
  rotAutoDone: 'طُبّق تدوير الخدمة', rotNeedStaff: 'يلزم نادلان على الأقل للتدوير.',
  rotHistoryTitle: 'سجل التدوير', rotHistoryEmpty: 'يمتلئ السجل مع كل تدوير.',
  fairnessEmpty: 'لا يوجد سجل كافٍ لقياس العدالة بعد.',
  services: { midi: 'غداء', soir: 'عشاء' },
  versionsCount: (n) => n ? `${n}` : '',
  liveSoon: (t) => `على ${t}`,
});

/* ─── Default roster — used when no team data is provided ────────────────── */
const PDS_DEFAULT_STAFF = [
  { id: 'KR', name: 'Karim Rifai',     color: '#0B6E4F' },
  { id: 'YS', name: 'Yasmine Senhaji', color: '#D99A2B' },
  { id: 'OM', name: 'Omar Maalouf',    color: '#053B2C' },
  { id: 'SK', name: 'Soukaina Belkadi',color: '#A85F00' },
  { id: 'MH', name: 'Mehdi Mansouri',  color: '#1A8FE3' },
  { id: 'NR', name: 'Nora Akkari',     color: '#C0306E' },
  { id: 'AY', name: 'Ayoub Tazi',      color: '#5A6CDB' },
  { id: 'IM', name: 'Imane Lahlou',    color: '#0B8A7B' },
];

/* ─── Le vrai personnel ─────────────────────────────────────────────────────
 * Un magasin réel démarre sur pdsTemplate('blank') : roster VIDE, pour que
 * « Karim Rifai » et les sept autres noms de démonstration ne s'affichent
 * jamais chez un commerçant. Sauf qu'aucun écran ne permettait ensuite d'y
 * ajouter qui que ce soit — l'onglet Affectation restait sans une seule
 * pastille à glisser et les vingt-et-une tables lisaient « non affecté » à
 * vie. La page Équipe, elle, connaît le personnel : KiwiTeam.roster() est la
 * source, ce fichier ne fait que la refléter. */
const PDS_STAFF_COLORS = ['#0B6E4F', '#D99A2B', '#053B2C', '#A85F00', '#1A8FE3', '#C0306E', '#5A6CDB', '#0B8A7B'];
function pdsStaffColor(seed) {
  const s = String(seed || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PDS_STAFF_COLORS[h % PDS_STAFF_COLORS.length];
}
const PDS_MAX_TABLE_SERVERS = 3;
function pdsServerIds(table) {
  if (!table) return [];
  const ids = Array.isArray(table.servers) ? table.servers : [table.server];
  return Array.from(new Set(ids.filter(Boolean).map(String))).slice(0, PDS_MAX_TABLE_SERVERS);
}
function pdsSetServerIds(table, ids) {
  const clean = Array.from(new Set((ids || []).filter(Boolean).map(String))).slice(0, PDS_MAX_TABLE_SERVERS);
  table.servers = clean;
  /* Keep the historical scalar as the primary waiter so caisse and older
     clients continue to work while multi-assignment-aware clients use servers. */
  table.server = clean[0] || null;
  return clean;
}
function pdsHasServer(table, sid) { return pdsServerIds(table).includes(String(sid || '')); }
function pdsIsFloorRole(role) {
  const plain = String(role || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /(^|\b)(serveur|serveuse|server|waiter|waitress|chef de rang|maitre d[' ]hotel|responsable de salle|floor manager)(\b|$)/.test(plain)
    || /(?:نادل|نادلة|رئيس القاعة|مشرف القاعة)/.test(String(role || ''));
}
function pdsTeamStaff() {
  try {
    const roster = (window.KiwiTeam && window.KiwiTeam.roster) ? window.KiwiTeam.roster() : [];
    return (roster || []).filter(m => m && m.id && pdsIsFloorRole(m.role)).map(m => ({
      id: 'tm-' + m.id,
      name: (m.name && m.name !== '·') ? m.name : String(m.role || '').trim() || '·',
      color: pdsStaffColor(m.id),
      role: m.role || '',
      from: 'team',
    }));
  } catch (e) { return []; }
}
/* Un vrai magasin, c'est soit une session réelle, soit un établissement créé
 * par le commerçant : les deux doivent voir leur équipe, pas la nôtre. */
function pdsIsRealStore() {
  try {
    if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
    if (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()) return true;
  } catch (e) {}
  return false;
}
/* Rapproche le roster du plan de l'équipe réelle : les fiches Équipe font
 * autorité sur le nom, les pastilles ajoutées à la main ici (id « sv- »)
 * survivent, et les serveurs de démonstration disparaissent dès qu'un vrai
 * magasin est ouvert. Une table qui pointait sur un serveur disparu est
 * libérée — sinon elle porterait une pastille sans nom ni couleur. */
function pdsSyncStaff(state) {
  if (!state || !Array.isArray(state.staff) || !Array.isArray(state.tables)) return state;
  if (!pdsIsRealStore()) return state;
  const demo = new Set(PDS_DEFAULT_STAFF.map(s => s.id));
  const team = pdsTeamStaff();
  const byId = new Map(team.map(s => [s.id, s]));
  const kept = state.staff.filter(s => s && s.id && !demo.has(s.id) && (s.from !== 'team' || byId.has(s.id))).map(s => {
    const t = byId.get(s.id);
    return t ? Object.assign({}, s, { name: t.name, role: t.role, color: s.color || t.color }) : s;
  });
  const have = new Set(kept.map(s => s.id));
  team.forEach(t => { if (!have.has(t.id)) kept.push(t); });
  const live = new Set(kept.map(s => s.id));
  state.tables.forEach(t => pdsSetServerIds(t, pdsServerIds(t).filter(id => live.has(id))));
  state.staff = kept;
  return state;
}

/* ─── Table types — each has a default size + shape + seats ─────────────── */

/* ─── Structural elements (purely visual) ──────────────────────────────── */
const PDS_EL_TYPES = {
  wall:   { w: 200, h: 8,  color: '#2C2520' },
  door:   { w: 64,  h: 8,  color: '#0B6E4F' },
  window: { w: 96,  h: 6,  color: '#1A8FE3' },
  column: { w: 22,  h: 22, color: '#2C2520' },
  plant:  { w: 30,  h: 30, color: '#0B8A7B' },
};

/* ─── State manager · loaded from localStorage on demand ──────────────── */
/* ─── v1 → v2 migration ───────────────────────────────────────────────────
 *   v1 stored size and seats on the KIND and drew the comptoir, cuisine,
 *   stairs, plant and entrance inside a frozen SVG scene. v2 stores geometry
 *   on the instance and makes those fixtures real objects.
 *
 *   The scene → fixture step matters more than it looks: a merchant who had
 *   the "salle" backdrop had a counter and a kitchen on their plan. Dropping
 *   the scenes without replacing them would delete both from their floor. So
 *   each retired scene is reconstituted as the objects it used to depict —
 *   this time movable, resizable and deletable.                            */
const PDS_SCENE_MIGRATION = {
  salle: {
    room: { floor: '#FBF7EE', wall: '#2C2520', finish: 'terrazzo' },
    fix: [
      { type: 'comptoir', x: 40,  y: 470, w: 420, h: 42 },
      { type: 'cuisine',  x: 700, y: 48,  w: 150, h: 300 },
      { type: 'porte',    x: 6,   y: 228, w: 80,  h: 14, rot: 90 },
      { type: 'plante',   x: 792, y: 466, w: 46,  h: 46 },
    ],
  },
  terrasse: {
    room: { floor: '#E0D7C4', wall: '#8A6A45', finish: 'carreaux' },
    fix: [
      { type: 'garde',  x: 20,  y: 506, w: 840, h: 10 },
      { type: 'plante', x: 28,  y: 30,  w: 46,  h: 46 },
      { type: 'plante', x: 806, y: 30,  w: 46,  h: 46 },
    ],
  },
  bar: {
    room: { floor: '#EFE7D6', wall: '#1F2820', finish: 'bois' },
    fix: [
      { type: 'comptoir', x: 60,  y: 118, w: 520, h: 54 },
      { type: 'vitrine',  x: 640, y: 110, w: 150, h: 66 },
      { type: 'fenetre',  x: 120, y: 6,   w: 200, h: 10 },
    ],
  },
  etage: {
    room: { floor: '#FBF7EE', wall: '#2C2520', finish: 'zellige' },
    fix: [
      { type: 'escalier',  x: 44, y: 44,  w: 130, h: 96 },
      { type: 'banquette', x: 40, y: 452, w: 300, h: 66 },
    ],
  },
  prive: {
    room: { floor: '#EFE7D6', wall: '#053B2C', finish: 'zellige' },
    fix: [{ type: 'tapis', x: 260, y: 170, w: 360, h: 220 }],
  },
  blank: { room: { floor: '#FBF7EE', wall: '#2C2520', finish: 'plain' }, fix: [] },
};
const PDS_EL_RENAME = { wall: 'mur', door: 'porte', window: 'fenetre', column: 'colonne', plant: 'plante' };

/* Statuts que seule la caisse connaît pour de vrai. */
const PDS_SERVICE_STATUSES = ['occupied', 'ordering', 'bill', 'paid'];
/* Le début de la journée de service : 5 h, comme la caisse (« deux
 * horloges », CLAUDE.md §5). Avant 5 h on est encore dans la veille. */
function pdsBusinessDayStart(now) {
  const d = new Date(now == null ? Date.now() : now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 5, 0, 0, 0);
  if (d.getHours() < 5) start.setDate(start.getDate() - 1);
  return start.getTime();
}

function pdsNormalize(state) {
  if (!state || !Array.isArray(state.zones)) return state;
  if (!state.gone || typeof state.gone !== 'object' || Array.isArray(state.gone)) state.gone = {};
  const fresh = state.v !== 2;
  let nextEl = 1;
  const elId = () => 'em' + (nextEl++) + '_' + Math.random().toString(36).slice(2, 6);

  state.zones.forEach(z => {
    const scene = z.scene;
    const mig = PDS_SCENE_MIGRATION[scene] || PDS_SCENE_MIGRATION.blank;
    z.room = Object.assign({}, mig.room, z.room || {});
    if (z.room.w == null) z.room.w = PDS_CANVAS_W;
    if (z.room.h == null) z.room.h = PDS_CANVAS_H;
    if (z.room.wallW == null) z.room.wallW = 2;
    if (fresh && scene) {
      /* Reconstitute what the scene used to draw, once. */
      state.elements = state.elements || [];
      mig.fix.forEach((f, i) => {
        state.elements.push(Object.assign({
          id: elId(), zone: z.id, rot: 0, color: (PDS_FIX[f.type] || {}).color,
          label: null, z: i, locked: false,
        }, f));
      });
    }
    delete z.scene;
  });

  (state.tables || []).forEach(t => {
    const cfg = PDS_TABLE_TYPES[t.type] || PDS_TABLE_TYPES.round4;
    if (t.w == null) t.w = cfg.w;
    if (t.h == null) t.h = cfg.h;
    if (t.seats == null) t.seats = cfg.seats;
    if (t.shape == null) t.shape = cfg.shape;
    if (t.color === undefined) t.color = null;
    if (t.locked == null) t.locked = false;
    pdsSetServerIds(t, pdsServerIds(t));
    /* « À nettoyer » est devenu « Réglée » : le khlass de la caisse. */
    if (t.status === 'cleaning') t.status = 'paid';
    /* Un statut de service tapé à la main ne survit pas à sa journée. C'est
     * ce qui affichait « 1514 h 59 » sur la table 03 d'un vrai restaurant :
     * cochée « Occupée » un soir, jamais décochée. Dans un vrai magasin la
     * caisse fait foi (KiwiFloorLive) et le plan ne garde que ce qu'elle ne
     * sait pas — réservée, hors service. Sur une démo, la marque à la main
     * reste le jeu, mais expire au changement de journée (5 h). */
    if (PDS_SERVICE_STATUSES.includes(t.status)) {
      if (pdsIsRealStore() || (t.since > 0 && t.since < pdsBusinessDayStart())) {
        t.status = 'free';
        delete t.since;
      }
    }
  });

  state.elements = (state.elements || []).map((e, i) => {
    const type = PDS_EL_RENAME[e.type] || e.type;
    const cfg = PDS_FIX[type];
    if (!cfg) return null;          /* unknown kind — drop rather than crash */
    return Object.assign({}, e, {
      type,
      w: e.w != null ? e.w : cfg.w,
      h: e.h != null ? e.h : cfg.h,
      color: e.color || cfg.color,
      label: e.label !== undefined ? e.label : null,
      z: e.z != null ? e.z : i,
      locked: !!e.locked,
    });
  }).filter(Boolean);

  if (state.showChairs == null) state.showChairs = true;
  pdsSyncStaff(state);
  state.v = 2;
  return state;
}

function pdsLoad() {
  const key = pdsKey();
  if (key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.zones && parsed.tables && parsed.staff) return pdsNormalize(parsed);
      }
    } catch (e) { /* fall through to default */ }
  }
  return pdsNormalize(pdsDefaultState());
}
/* The live state carries the editor's own wiring (_selection, _openInspector,
   _rebind …). Functions vanish in JSON but a Set survived as `_selection: {}`
   on every saved plan, local and server. Persist the plan, not the editor. */
function pdsSerialize(state) {
  return JSON.stringify(state, function (k, v) { return this === state && k.charAt(0) === '_' ? undefined : v; });
}
function pdsWriteLocal(state, noStamp) {
  /* Horodatage par élément (merge dernier-écrivain-gagnant, floorplan-core.js).
   * Pas sur une copie qui nous arrive du serveur ni sur une resynchronisation du
   * personnel : ce ne sont pas des modifications faites ici. */
  if (!noStamp && typeof pdsStampPlan === 'function') {
    try { const k0 = pdsKey(); if (k0) pdsStampPlan(state, localStorage.getItem(k0)); } catch (e) {}
  }
  const key = pdsKey();
  const json = pdsSerialize(state);
  if (key) {
    try { localStorage.setItem(key, json); } catch (e) {}
  }
  /* Mirror the layout under the merchant SLUG. The caisse has no KiwiVenue to
   * resolve pdsKey(), so it reads the plan by slug (storePaired().merchant) —
   * the same identity spine the boutique/menu already share, so a design made
   * here shows up on the till. Real custom stores only — a demo venue never
   * mirrors, so its seeded plan can't leak into a paired till. */
  try {
    var vd = window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData();
    if (vd && vd.custom && vd.name) {
      var vid = (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || '';
      var transients = (window.KiwiVenue && window.KiwiVenue.TRANSIENT_IDS) || PDS_TRANSIENT_IDS;
      if (transients.indexOf(vid) >= 0 && !key) return;
      var slug = vd.slug || (window.KiwiVenue && window.KiwiVenue.slugOf && window.KiwiVenue.slugOf(vid)) || _bqxSlug(vd.name);
      if (slug) localStorage.setItem(PDS_LS_KEY + ':slug:' + slug, json);
    }
  } catch (e) {}
}
function pdsSave(state) {
  pdsWriteLocal(state);
  var c = pdsCloud();
  if (c) c.push();
}

/* ── LA COPIE SERVEUR DU PLAN DE SALLE ──────────────────────────────────────
 * « le serveur lightera ça cross-device » disait le commentaire ci-dessus. Il
 * n'existait pas. Une heure passée à placer trente tables, leurs zones et leurs
 * serveurs ne quittait pas ce navigateur : le patron dessinait la salle sur son
 * portable, le maître d'hôtel ouvrait l'iPad du comptoir et retrouvait une
 * salle vide. C'est assets/cloud-doc.js qui porte les trois règles ; on ne
 * câble ici que le read / write / merge propres au plan.
 *
 * `pdsRawState` lit le document TEL QU'IL EST RANGÉ, jamais `pdsDefaultState()`
 * : le gabarit par défaut d'un magasin neuf porte déjà une zone, donc le
 * proposer au serveur créerait une ligne que le commerçant n'a jamais dessinée,
 * et le deuxième appareil la recevrait comme un vrai plan.
 *
 * « Vide » = aucune table. Une salle SANS table n'est pas une salle dessinée —
 * c'est la zone unique que le gabarit pose tout seul à la première ouverture de
 * la page. Poser sa première table suffit à tout faire partir. */
var pdsLive = null;    // l'état actuellement ouvert à l'écran, s'il y en a un
var pdsDoc = null;

function pdsRefreshLiveStaff() {
  if (!pdsLive || !pdsIsRealStore()) return;
  const before = JSON.stringify({
    staff: (pdsLive.staff || []).map(s => [s.id, s.name, s.role]),
    tables: (pdsLive.tables || []).map(t => [t.id, pdsServerIds(t)]),
  });
  pdsSyncStaff(pdsLive);
  const after = JSON.stringify({
    staff: (pdsLive.staff || []).map(s => [s.id, s.name, s.role]),
    tables: (pdsLive.tables || []).map(t => [t.id, pdsServerIds(t)]),
  });
  if (before === after) return;
  pdsWriteLocal(pdsLive, true);
  if (pdsLive._refresh) pdsLive._refresh();
}
window.addEventListener('kiwi-team-ready', pdsRefreshLiveStaff);
window.addEventListener('kiwi-team-changed', pdsRefreshLiveStaff);

function pdsRawState() {
  const key = pdsKey();
  if (!key) return { zones: [], tables: [], staff: [] };
  try {
    var raw = localStorage.getItem(key);
    var p = raw ? JSON.parse(raw) : null;
    if (p && p.zones && p.tables) return p;
  } catch (e) {}
  return { zones: [], tables: [], staff: [] };
}

/* Union par identifiant, cet appareil prioritaire (le défaut de cloud-doc.js),
 * SAUF que le plan porte aussi des réglages scalaires (mode, snap, zone
 * courante) : ceux-là restent les nôtres, changer la zone affichée sur l'iPad
 * n'a pas à déplacer la vue du portable.
 *
 * `epoch` : l'union ne sait pas supprimer — une table effacée sur le serveur
 * ressuscite dès qu'un appareil qui la garde en local refusionne (vécu : le
 * plan empoisonné à 33 tables se réinstallait après réparation). Un plan qui
 * porte une époque STRICTEMENT supérieure remplace donc l'autre copie en bloc,
 * au lieu de s'y unir. L'époque ne bouge jamais sur une sauvegarde ordinaire ;
 * elle n'est incrémentée que par une réparation délibérée qui doit s'imposer à
 * tous les appareils. À époque égale (le quotidien), l'union protège comme
 * avant les saisies concurrentes. */
function pdsMerge(mine, theirs) {
  var M = window.KiwiCloudDoc && window.KiwiCloudDoc.mergeDefault;
  if (!M || !theirs) return mine;
  /* La fusion vit désormais dans floorplan-core.js (pdsMergePlans : époque +
     pierres tombales), partagée avec la caisse. Le code ci-dessous n'est plus
     qu'un repli sans tombales pour un chargement sans floorplan-core. */
  if (typeof pdsMergePlans === 'function') return pdsMergePlans(mine, theirs, M);
  var mEp = (mine && isFinite(+mine.epoch)) ? +mine.epoch : 0;
  var tEp = (theirs && isFinite(+theirs.epoch)) ? +theirs.epoch : 0;
  var out;
  if (tEp !== mEp) {
    var win = tEp > mEp ? theirs : mine;
    out = {};
    Object.keys(win).forEach(function (k) { out[k] = win[k]; });
  } else {
    out = M(mine, theirs);
  }
  ['mode', 'snap', 'zone', 'zoneId'].forEach(function (k) {
    if (mine && Object.prototype.hasOwnProperty.call(mine, k)) out[k] = mine[k];
  });
  return out;
}

/* Le plan a la même faiblesse d'identifiant que le reste : celui qui a créé le
 * restaurant l'a rangé sous `v`+horloge, une ré-adoption le range sous
 * `v-<slug>`, et le dessin d'origine reste en place sans lecteur. Le miroir par
 * slug (`kiwiPlanDeSalle:slug:<slug>`) partage ce préfixe mais n'est pas un
 * identifiant de venue : slugFor() ne le reconnaît pas et l'écarte. */
function pdsCarryForward() {
  if (!window.KiwiCloudDoc) return;
  var vid = (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || '';
  var slug = window.KiwiCloudDoc.currentSlug();
  if (!vid || !slug) return;
  var transients = (window.KiwiVenue && window.KiwiVenue.TRANSIENT_IDS) || PDS_TRANSIENT_IDS;
  if (transients.indexOf(vid) >= 0) return;
  window.KiwiCloudDoc.carryForward('floorplan', vid, slug, function (raw) {
    try { var d = JSON.parse(raw || 'null'); return !!(d && d.tables && d.tables.length); }
    catch (e) { return false; }
  }, PDS_LS_KEY + ':');
}

function pdsCloud() {
  if (pdsDoc || !window.KiwiCloudDoc) return pdsDoc;
  pdsDoc = window.KiwiCloudDoc.attach({
    feature: 'floorplan',
    slug: function () { return window.KiwiCloudDoc.currentSlug(); },
    /* Le signet de révision doit nommer la copie qu'il décrit. Ici la copie
     * locale est rangée sous l'ID d'établissement (`kiwiPlanDeSalle:<venueId>`)
     * alors que la caisse range la sienne sous le slug — sans cette ligne les
     * deux partagent un seul signet, et l'une des deux se déclare à jour en
     * portant l'ancienne révision. C'est exactement la panne du reçu, réglée
     * une première fois pour `business`/`receipt` (voir assets/cloud-doc.js). */
    localKey: pdsKey,
    read: pdsRawState,
    write: function (d) {
      d = pdsSyncStaff(d);
      pdsWriteLocal(d, true);
      /* La page est ouverte : on remplace le contenu de l'état VIVANT (les
       * gestionnaires de glisser-déposer tiennent cette référence) plutôt que
       * l'objet lui-même, puis on repeint par son propre `_refresh`. */
      if (!pdsLive) return;
      try {
        Object.keys(d).forEach(function (k) { if (k.charAt(0) !== '_') pdsLive[k] = d[k]; });
        if (pdsLive._refresh) pdsLive._refresh();
      } catch (e) {}
    },
    merge: pdsMerge,
    isEmpty: function (d) { return !d || !(d.tables && d.tables.length); },
  });
  return pdsDoc;
}
/* Les noms de zone semés par Kiwi (plan de démo et gabarits) sont stockés en
   français. À l'écran, sous EN et AR, ils se lisent dans la langue de
   l'interface ; un nom tapé par le commerçant reste tel quel, et l'état
   stocké ne change pas (la caisse et le cloud lisent le même document). */
const PDS_SEED_ZONES = {
  'Salle principale': { en: 'Main room', ar: 'القاعة الرئيسية' },
  'Salle':            { en: 'Dining room', ar: 'القاعة' },
  'Terrasse':         { en: 'Terrace', ar: 'التراس' },
  'Terrasse XL':      { en: 'Large terrace', ar: 'التراس الكبير' },
  'Salon privé':      { en: 'Private room', ar: 'الصالون الخاص' },
  'Comptoir':         { en: 'Counter', ar: 'الكونتوار' },
  'Bar':              { en: 'Bar', ar: 'البار' },
};
function pdsZoneName(z) {
  const n = z && z.name != null ? String(z.name) : '';
  const tr = Object.prototype.hasOwnProperty.call(PDS_SEED_ZONES, n) ? PDS_SEED_ZONES[n] : null;
  return (tr && tr[trLang()]) || n;
}
/* Libellé par défaut d'un élément de décor : COMPTOIR et CUISINE sont des mots
   français écrits en dur dans floorplan-core ; sous EN et AR ils prennent le
   nom traduit de l'élément. Le français et un libellé saisi restent tels quels. */
function pdsFixLabel(e, K, T) {
  if (e && e.label != null) return e.label;
  const base = (K && K.label) || '';
  if (!base || trLang() === 'fr' || !(e && (e.type === 'comptoir' || e.type === 'cuisine'))) return base;
  const loc = T && T['fix' + e.type];
  return loc ? loc.toLocaleUpperCase(trLang()) : base;
}
function pdsDefaultState() {
  /* A merchant-created store starts with an empty floor to design (one zone,
     no tables, no staff). The pre-seeded stores keep their full layout. */
  if (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()) return pdsTemplate('blank');
  const zones = [
    { id: 'z1', name: 'Salle principale', scene: 'salle' },
    { id: 'z2', name: 'Terrasse',         scene: 'terrasse' },
    { id: 'z3', name: 'Bar',              scene: 'bar' },
  ];
  const mk = (id, zone, type, x, y, num, status, server, notes) => ({
    id, zone, type, x, y, num, status: status || 'free', server: server || null, notes: notes || '', rot: 0,
  });
  const tables = [
    mk('t1',  'z1', 'round4', 80,  80,  '1', 'occupied', 'KR', ''),
    mk('t2',  'z1', 'round4', 240, 80,  '2', 'free', 'KR', ''),
    mk('t3',  'z1', 'round2', 400, 80,  '3', 'reserved', 'KR', 'Famille El Idrissi · 20:00'),
    mk('t4',  'z1', 'sq4',    560, 80,  '4', 'occupied', 'YS', ''),
    mk('t5',  'z1', 'round6', 80,  240, '5', 'free', 'YS', ''),
    mk('t6',  'z1', 'round4', 256, 240, '6', 'cleaning', 'YS', ''),
    mk('t7',  'z1', 'rect6',  416, 240, '7', 'occupied', 'OM', ''),
    mk('t8',  'z1', 'round2', 624, 240, '8', 'free', 'OM', ''),
    mk('t9',  'z1', 'rect8',  176, 400, '9', 'occupied', 'OM', ''),
    mk('t10', 'z1', 'round4', 416, 400, '10', 'free', 'SK', ''),
    mk('t11', 'z1', 'sq2',    576, 400, '11', 'occupied', 'SK', ''),
    mk('t12', 'z1', 'round4', 720, 400, '12', 'reserved', 'SK', 'M. Benani · 20:30'),
    mk('t13', 'z2', 'round2', 96,  96,  'T1', 'occupied', 'MH', ''),
    mk('t14', 'z2', 'round4', 240, 96,  'T2', 'free', 'MH', ''),
    mk('t15', 'z2', 'round4', 400, 96,  'T3', 'occupied', 'NR', ''),
    mk('t16', 'z2', 'round6', 576, 96,  'T4', 'free', 'NR', ''),
    mk('t17', 'z2', 'rect4',  144, 256, 'T5', 'free', 'AY', ''),
    mk('t18', 'z2', 'rect4',  368, 256, 'T6', 'occupied', 'AY', ''),
    mk('t19', 'z2', 'round4', 576, 256, 'T7', 'free', 'IM', ''),
    mk('t20', 'z3', 'bar',    96,  120, 'B1', 'occupied', 'KR', ''),
    mk('t21', 'z3', 'bar',    176, 120, 'B2', 'occupied', 'KR', ''),
    mk('t22', 'z3', 'bar',    256, 120, 'B3', 'free', 'KR', ''),
    mk('t23', 'z3', 'high',   400, 200, 'B4', 'occupied', 'YS', ''),
    mk('t24', 'z3', 'high',   500, 200, 'B5', 'free', 'YS', ''),
  ];
  /* No seeded history: fairness and the rotation log are measured from
     rotations that really happened, on a demo as on a real floor. */
  return {
    zones,
    activeZone: 'z1',
    tables,
    elements: [],
    staff: PDS_DEFAULT_STAFF.slice(),
    rotation: { period: 'shift', strategy: 'zones', enabled: true, auto: false },
    history: [],
    snap: true,
    mode: 'layout',
  };
}

/* ─── Templates catalog — wipes state, repopulates ────────────────────── */
function pdsTemplate(key) {
  const mk = (id, zone, type, x, y, num) => ({ id, zone, type, x, y, num, status: 'free', server: null, notes: '', rot: 0 });
  const blank = {
    /* scene 'blank', not 'salle': pdsNormalize() expands a 'salle' scene into
       a counter, a kitchen, a door and a plant (the v1 migration). A new
       store's empty room arrived furnished with things its owner never
       placed, and the till drew them as COMPTOIR and CUISINE. */
    zones: [{ id: 'z1', name: 'Salle', scene: 'blank' }],
    activeZone: 'z1', tables: [], elements: [],
    /* A real store fills its own roster; only pre-seeded stores get sample servers. */
    staff: (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()) ? [] : PDS_DEFAULT_STAFF.slice(),
    rotation: { period: 'shift', strategy: 'zones', enabled: false },
    history: [],
    snap: true,
    mode: 'layout',
  };
  if (key === 'blank') return blank;
  if (key === 'bistro') {
    return {
      ...blank,
      zones: [
        { id: 'z1', name: 'Salle',    scene: 'salle' },
        { id: 'z2', name: 'Terrasse', scene: 'terrasse' },
        { id: 'z3', name: 'Bar',      scene: 'bar' },
      ],
      tables: [
        mk('t1','z1','round4', 96,  96,  '1'),
        mk('t2','z1','round4', 256, 96,  '2'),
        mk('t3','z1','sq2',    416, 96,  '3'),
        mk('t4','z1','round4', 96,  256, '4'),
        mk('t5','z1','sq4',    256, 256, '5'),
        mk('t6','z1','rect6',  416, 256, '6'),
        mk('t7','z1','round2', 96,  400, '7'),
        mk('t8','z1','round4', 256, 400, '8'),
        mk('t9','z2','round2', 96,  96,  'T1'),
        mk('t10','z2','round2',240, 96, 'T2'),
        mk('t11','z2','round4',384, 96, 'T3'),
        mk('t12','z3','bar',   96, 120, 'B1'),
        mk('t13','z3','bar',  176, 120, 'B2'),
        mk('t14','z3','high', 320, 200, 'B3'),
      ],
    };
  }
  if (key === 'resto') {
    return {
      ...blank,
      zones: [
        { id: 'z1', name: 'Salle principale', scene: 'salle' },
        { id: 'z2', name: 'Terrasse',         scene: 'terrasse' },
        { id: 'z3', name: 'Salon privé',      scene: 'prive' },
      ],
      tables: [
        ...Array.from({ length: 12 }, (_, i) => mk(`m${i+1}`, 'z1', i%3===0?'round6':i%3===1?'round4':'sq4',
          96 + (i%4)*180, 96 + Math.floor(i/4)*150, String(i+1))),
        ...Array.from({ length: 8 }, (_, i) => mk(`te${i+1}`, 'z2', i<4?'round2':'round4',
          96 + (i%4)*150, 96 + Math.floor(i/4)*150, `T${i+1}`)),
        mk('p1','z3','rect10',144,144,'P1'),
        mk('p2','z3','round4',160,330,'P2'),
        mk('p3','z3','round4',440,330,'P3'),
      ],
    };
  }
  if (key === 'cafe') {
    return {
      ...blank,
      zones: [
        { id: 'z1', name: 'Salle',    scene: 'salle' },
        { id: 'z2', name: 'Comptoir', scene: 'bar' },
      ],
      tables: [
        mk('h1','z1','high',96,96,'1'),
        mk('h2','z1','high',208,96,'2'),
        mk('h3','z1','high',320,96,'3'),
        mk('h4','z1','high',96,208,'4'),
        mk('h5','z1','high',208,208,'5'),
        mk('h6','z1','high',320,208,'6'),
        mk('r1','z1','round4',464,128,'7'),
        mk('r2','z1','round4',464,288,'8'),
        mk('r3','z1','round4',624,208,'9'),
        mk('b1','z2','bar',96,80,'C1'),
        mk('b2','z2','bar',176,80,'C2'),
        mk('b3','z2','bar',256,80,'C3'),
        mk('b4','z2','bar',336,80,'C4'),
      ],
    };
  }
  if (key === 'brasserie') {
    return {
      ...blank,
      zones: [
        { id: 'z1', name: 'Salle',       scene: 'salle' },
        { id: 'z2', name: 'Terrasse XL', scene: 'terrasse' },
        { id: 'z3', name: 'Bar',         scene: 'bar' },
      ],
      tables: [
        ...Array.from({ length: 8 }, (_, i) => mk(`s${i+1}`, 'z1', i%2 ? 'round4' : 'sq4',
          96 + (i%4)*160, 96 + Math.floor(i/4)*180, String(i+1))),
        ...Array.from({ length: 10 }, (_, i) => mk(`te${i+1}`, 'z2', i%3===0 ? 'round6' : 'round4',
          80 + (i%5)*160, 96 + Math.floor(i/5)*200, `T${i+1}`)),
        mk('b1','z3','bar', 96,120,'B1'),
        mk('b2','z3','bar',176,120,'B2'),
        mk('b3','z3','bar',256,120,'B3'),
        mk('b4','z3','bar',336,120,'B4'),
        mk('h1','z3','high',480,200,'H1'),
        mk('h2','z3','high',576,200,'H2'),
      ],
    };
  }
  return blank;
}

/* ─── Stylesheet, injected once at the document level ──────────────────
 * NOT inside the drawer body. The `.pds-*` sheet used to ship as
 * `<style>${PDS_INLINE_CSS}</style>` at the top of pdsRenderBody()'s HTML
 * string, so its lifetime was tied to that body — and `open-templates`
 * opens a SECOND drawer over the first, replacing the body and taking the
 * only copy of the stylesheet with it. The template picker then rendered
 * with no CSS at all: no card fill, no border, no padding, just stacked
 * text bleeding through the glass. Anything that reuses `.pds-*` markup
 * outside the main drawer depends on this being document-level. */
function pdsEnsureCss() {
  if (document.getElementById('pds-css')) return;
  const s = document.createElement('style');
  s.id = 'pds-css';
  s.textContent = PDS_INLINE_CSS;
  document.head.appendChild(s);
}

/* ─── Phone: table assignment without the floor plan (ticket #0113) ─────
 * Drawing a room with a finger on a 6-inch screen does not work, and neither
 * does dragging a server chip onto a 30 px table. On a phone the owner gets
 * the one job that matters mid-service: pick a server, tap their tables.
 * Same state, same pdsSetServerIds / pdsSave as the full editor, so the till
 * and the desktop plan see the change at once. The layout itself stays on a
 * computer or tablet. */
/* v4 · la page dans le cadre du dashboard (2026-10-10). */
Object.assign(PDS_STR.fr, {
  more: 'Plus', dupShort: (n) => `${n} en double`, furnitureTitle: 'Mobilier',
  renameShort: 'Renommer', duplicateShort: 'Dupliquer', roomTitle: 'Style de la salle',
});
Object.assign(PDS_STR.en, {
  more: 'More', dupShort: (n) => `${n} duplicated`, furnitureTitle: 'Furniture',
  renameShort: 'Rename', duplicateShort: 'Duplicate', roomTitle: 'Room style',
});
Object.assign(PDS_STR.ar, {
  more: 'المزيد', dupShort: (n) => `${n} مكرّرة`, furnitureTitle: 'الأثاث',
  renameShort: 'إعادة تسمية', duplicateShort: 'نسخ', roomTitle: 'طابع القاعة',
});

const PDS_PHONE_STR = {
  fr: { tables: 'tables', title: 'Affectation des tables', sub: (n, u) => `${n} table${n > 1 ? 's' : ''} · ${u} sans serveur`,
        note: 'Le plan de salle se dessine sur ordinateur ou tablette. Ici, touchez un serveur, puis ses tables.',
        noStaff: 'Aucun serveur dans l’équipe. Ajoutez-en un depuis Équipe, avec le rôle Serveur.',
        noTables: 'Aucune table sur le plan. Dessinez la salle depuis un ordinateur.',
        count: (n, c) => `${n} table${n > 1 ? 's' : ''} · ${c} couverts`, none: 'Aucune table',
        pick: 'Touchez les tables de ce serveur. Une table peut avoir jusqu’à 3 serveurs.',
        full: 'Cette table a déjà 3 serveurs', unassigned: 'Sans serveur', close: 'Fermer' },
  en: { tables: 'tables', title: 'Table assignment', sub: (n, u) => `${n} table${n === 1 ? '' : 's'} · ${u} unassigned`,
        note: 'The floor plan is drawn on a computer or tablet. Here, tap a server, then their tables.',
        noStaff: 'No servers in the team yet. Add one from Team with the Server role.',
        noTables: 'No tables on the plan yet. Draw the room from a computer.',
        count: (n, c) => `${n} table${n === 1 ? '' : 's'} · ${c} covers`, none: 'No tables',
        pick: 'Tap this server’s tables. A table can have up to 3 servers.',
        full: 'This table already has 3 servers', unassigned: 'Unassigned', close: 'Close' },
  ar: { tables: 'طاولات', title: 'توزيع الطاولات', sub: (n, u) => `${n} طاولة · ${u} بدون نادل`,
        note: 'يُرسم مخطط القاعة من الحاسوب أو اللوحة. هنا اختر نادلاً ثم طاولاته.',
        noStaff: 'لا يوجد نُدُل في الفريق بعد. أضف واحداً من صفحة الفريق بدور نادل.',
        noTables: 'لا توجد طاولات في المخطط بعد. ارسم القاعة من الحاسوب.',
        count: (n, c) => `${n} طاولة · ${c} مقعد`, none: 'لا طاولات',
        pick: 'اختر طاولات هذا النادل. يمكن أن يكون للطاولة حتى 3 نُدُل.',
        full: 'لهذه الطاولة 3 نُدُل بالفعل', unassigned: 'بدون نادل', close: 'إغلاق' },
};
function pdsPhoneWanted() {
  try { return !!(window.matchMedia && matchMedia('(max-width: 640px)').matches); } catch (_) { return false; }
}
function pdsInitials(name) {
  return String(name || '·').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase() || '·';
}
function pdsTableNum(t) { return /^\d$/.test(String(t.num)) ? '0' + t.num : String(t.num || '·'); }
/* Sur le téléphone du patron, la salle en direct passe avant l'affectation :
   les additions demandées d'abord, puis chaque table ouverte. Rien sans
   caisse (démo, hors ligne) · le badge le dit. */
function pdsPhoneLive(state) {
  const T = PDS_STR[trLang()] || PDS_STR.fr;
  if (!(PDS_LIVE && PDS_LIVE.live)) {
    return `<div class="pdsp-live" data-pdsp-live>${pdsLiveBadge(T)}</div>`;
  }
  const rank = { bill: 0, ordering: 1, occupied: 2, paid: 3, reserved: 4 };
  const open = state.tables.map(t => ({ t, e: pdsEff(t) }))
    .filter(r => rank[r.e.status] != null)
    .sort((a, b) => rank[a.e.status] - rank[b.e.status]
      || String(pdsTableNum(a.t)).localeCompare(String(pdsTableNum(b.t)), undefined, { numeric: true }));
  const rows = open.map(({ t, e }) => {
    const si = e.since && e.status !== 'reserved' ? pdsSince(e.since) : null;
    const meta = [pdsStatusLabel(e.status, T)];
    if (e.covers && e.status !== 'reserved') meta.push(T.coversNow(e.covers, pdsGeom(t).seats));
    if (si) meta.push(si.check ? T.checkTable : si.label);
    return `<div class="pdsp-lrow is-${e.status}"><b>${pdsEsc(pdsTableNum(t))}</b><span>${pdsEsc(meta.join(' · '))}</span>${e.billCents ? `<em>${pdsEsc(T.mad(e.billCents / 100))}</em>` : ''}</div>`;
  }).join('');
  return `<div class="pdsp-live" data-pdsp-live>
    <div class="pdsp-lhead"><b>${pdsEsc(T.liveTitle)}</b>${pdsLiveBadge(T)}</div>
    ${rows || `<p class="pdsp-lnone">${pdsEsc(T.liveAllFree)}</p>`}
  </div>`;
}
function pdsPhoneBody(state, P, openSid) {
  const byNum = (a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true });
  const free = state.tables.filter(t => !pdsServerIds(t).length).length;
  const staffById = new Map(state.staff.map(s => [String(s.id), s]));
  let html = `<div class="pdsp">
    ${pdsPhoneLive(state)}
    <p class="pdsp-note">${pdsEsc(P.note)}</p>
    <div class="pdsp-sum"><b>${state.tables.length}</b> ${pdsEsc(P.tables)}<span>·</span><b>${free}</b> ${pdsEsc(P.unassigned.toLowerCase())}</div>`;
  if (!state.tables.length) return html + `<div class="pdsp-empty">${pdsEsc(P.noTables)}</div></div>`;
  if (!state.staff.length) return html + `<div class="pdsp-empty">${pdsEsc(P.noStaff)}</div></div>`;
  html += '<div class="pdsp-list">';
  state.staff.forEach(s => {
    const sid = String(s.id);
    const mine = state.tables.filter(t => pdsHasServer(t, sid)).sort(byNum);
    const covers = mine.reduce((n, t) => n + pdsGeom(t).seats, 0);
    const open = openSid === sid;
    const mini = mine.length
      ? mine.slice(0, 5).map(t => `<span class="pdsp-chip">${pdsEsc(pdsTableNum(t))}</span>`).join('') + (mine.length > 5 ? `<span class="pdsp-chip more">+${mine.length - 5}</span>` : '')
      : `<span class="pdsp-none">${pdsEsc(P.none)}</span>`;
    const paint = pdsBadge(s.color);
    html += `<div class="pdsp-srv${open ? ' open' : ''}" role="group" style="--c:${pdsEsc(s.color)};--c-bg:${pdsEsc(paint.bg)};--c-ink:${paint.ink}">
      <button type="button" class="pdsp-head" data-pdsp-srv="${pdsEsc(sid)}" aria-expanded="${open}">
        <span class="pdsp-av">${pdsEsc(pdsInitials(s.name))}</span>
        <span class="pdsp-who"><b>${pdsEsc(s.name)}</b><small>${pdsEsc(P.count(mine.length, covers))}</small></span>
        <span class="pdsp-chev" aria-hidden="true"></span>
      </button>
      <div class="pdsp-mini">${mini}</div>`;
    if (open) {
      html += `<div class="pdsp-pick"><p>${pdsEsc(P.pick)}</p>`;
      state.zones.forEach(z => {
        const ts = state.tables.filter(t => t.zone === z.id).sort(byNum);
        if (!ts.length) return;
        html += `<div class="pdsp-zone">${pdsEsc(pdsZoneName(z))}</div><div class="pdsp-grid">`;
        ts.forEach(t => {
          const ids = pdsServerIds(t);
          const on = ids.includes(sid);
          const others = ids.filter(id => id !== sid).map(id => staffById.get(id)).filter(Boolean);
          html += `<button type="button" class="pdsp-t${on ? ' on' : ''}" data-pdsp-t="${pdsEsc(t.id)}" aria-pressed="${on}">
            <b>${pdsEsc(pdsTableNum(t))}</b><small>${pdsGeom(t).seats} p.</small>${others.length ? `<i>${others.map(o => pdsEsc(pdsInitials(o.name))).join(' ')}</i>` : ''}</button>`;
        });
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
  });
  return html + '</div></div>';
}
const PDS_PHONE_CSS = `
.pdsp :focus-visible{outline:2px solid var(--atlas);outline-offset:-2px}
.pdsp{display:flex;flex-direction:column;gap:12px;padding-bottom:8px}
.pdsp-live{display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:16px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--n-200)}
.pdsp-live > .pds-live-badge{align-self:flex-start}
.pdsp-lhead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px}
.pdsp-lhead b{font-size:15px;font-weight:600}
.pdsp-lrow{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:10px;min-height:44px;padding:6px 10px;border-radius:12px;background:var(--paper)}
.pdsp-lrow b{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}
.pdsp-lrow span{font-size:13px;color:var(--n-600);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdsp-lrow em{font-style:normal;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.pdsp-lrow.is-bill{background:rgba(194,69,111,0.10);box-shadow:inset 3px 0 0 #C2456F}
.pdsp-lrow.is-bill span,.pdsp-lrow.is-bill em{color:#A0335A}
.pdsp-lrow.is-ordering{box-shadow:inset 3px 0 0 #C89235}
.pdsp-lrow.is-occupied{box-shadow:inset 3px 0 0 #0B6E4F}
.pdsp-lnone{margin:0;font-size:13px;color:var(--n-600)}
.pdsp-note{margin:0;font-size:14px;line-height:1.45;color:var(--n-600)}
.pdsp-sum{display:flex;gap:6px;align-items:baseline;font-size:14px;color:var(--n-600)}
.pdsp-sum b{font-size:17px;color:var(--ink);font-variant-numeric:tabular-nums}
.pdsp-empty{padding:28px 18px;border-radius:16px;background:var(--surface);text-align:center;font-size:14px;line-height:1.45;color:var(--n-600)}
.pdsp-list{display:flex;flex-direction:column;gap:8px}
.pdsp-srv{min-height:0;margin:0;padding:0;border-radius:16px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--n-200);overflow:hidden}
.pdsp-srv.open{box-shadow:inset 0 0 0 1.5px var(--c)}
.pdsp-head{display:flex;align-items:center;gap:12px;width:100%;min-height:60px;padding:10px 14px 4px;border:0;background:none;color:inherit;text-align:start;font:inherit;cursor:pointer}
.pdsp-av{flex:0 0 auto;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--c-bg,var(--c));color:var(--c-ink,#fff);font-weight:600;font-size:13px}
.pdsp-who{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.pdsp-who b{font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pdsp-who small{font-size:13px;color:var(--n-600)}
.pdsp-chev{width:9px;height:9px;border-right:2px solid var(--n-500);border-bottom:2px solid var(--n-500);transform:rotate(45deg);transition:transform .2s}
.pdsp-srv.open .pdsp-chev{transform:rotate(-135deg)}
.pdsp-mini{display:flex;flex-wrap:wrap;gap:5px;padding:4px 14px 12px 64px}
[dir="rtl"] .pdsp-mini{padding:4px 64px 12px 14px}
.pdsp-chip{padding:3px 8px;border-radius:8px;background:color-mix(in srgb,var(--c) 16%,transparent);color:var(--ink);font:600 12px/1.3 "JetBrains Mono",monospace}
.pdsp-chip.more{background:var(--n-100,rgba(10,15,13,.06))}
.pdsp-none{font-size:13px;color:var(--n-500)}
.pdsp-pick{padding:4px 14px 16px;border-top:1px solid var(--n-200)}
.pdsp-pick p{margin:12px 0 4px;font-size:13px;line-height:1.4;color:var(--n-600)}
.pdsp-zone{margin:12px 0 8px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}
.pdsp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px}
.pdsp-t{position:relative;min-height:56px;border-radius:12px;border:1px solid var(--n-200);background:var(--paper);color:var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font:inherit;cursor:pointer;transition:transform .12s,background .15s}
.pdsp-t:active{transform:scale(.95)}
.pdsp-t b{font:600 16px/1.1 "JetBrains Mono",monospace}
.pdsp-t small{font-size:11px;color:var(--n-500)}
.pdsp-t i{position:absolute;top:3px;inset-inline-end:5px;font-size:11px;font-weight:600;color:var(--n-500)}
.pdsp-t.on{background:var(--c-bg,var(--c));border-color:var(--c-bg,var(--c));color:var(--c-ink,#fff)}
.pdsp-t.on small,.pdsp-t.on i{color:var(--c-ink,#fff)}
html[data-theme="dark"] .pdsp-t:not(.on){background:rgba(255,255,255,.04)}
@media (prefers-reduced-motion: reduce){.pdsp-chev,.pdsp-t{transition:none}}
`;
function pdsOpenPhoneAssign(state, v) {
  const P = PDS_PHONE_STR[trLang()] || PDS_PHONE_STR.fr;
  if (!document.getElementById('pdsp-css')) {
    const st = document.createElement('style'); st.id = 'pdsp-css'; st.textContent = PDS_PHONE_CSS; document.head.appendChild(st);
  }
  const free = () => state.tables.filter(t => !pdsServerIds(t).length).length;
  let openSid = state.staff.length === 1 ? String(state.staff[0].id) : null;
  const dr = fullpage({
    title: P.title,
    subtitle: `${v.name} · ${P.sub(state.tables.length, free())}`,
    width: 640,
    body: pdsPhoneBody(state, P, openSid),
    foot: `<div class="pds-foot"><div class="pds-foot-actions"><button class="kb atlas" data-dismiss>${pdsEsc(P.close)}</button></div></div>`,
  });
  wireDismiss(dr);
  if (!dr || !dr.el) return;
  window.Kiwi?.setActivePage?.('tables');
  /* La salle en direct : seul le bloc du haut est remplacé, jamais la
     liste qu'on est en train de toucher (un rebuild sous le doigt avale
     le tap). */
  const repaintLive = () => {
    const host = dr.el.querySelector('[data-pdsp-live]');
    if (!host) return;
    const html = pdsPhoneLive(state);
    if (html === lastLive) return;
    lastLive = html;
    host.outerHTML = html;
  };
  let lastLive = '';
  pdsIndexBookings(state);
  const unwatch = window.KiwiFloorLive ? window.KiwiFloorLive.watch((d) => { PDS_LIVE = d; repaintLive(); }) : null;
  const prevClose = dr.close;
  dr.close = () => {
    try { unwatch && unwatch(); } catch (_) {}
    try { pdsSave(state); } catch (_) {}
    if (pdsLive === state) pdsLive = null;
    window.Kiwi?.setActivePage?.('accueil');
    prevClose();
  };
  const paint = () => {
    const restoreFocus = pdsRememberFocus(dr.el);
    const body = dr.el.querySelector('.kiwi-drawer-body');
    if (body) body.innerHTML = pdsPhoneBody(state, P, openSid);
    const sub = dr.el.querySelector('.kiwi-drawer-head p');
    if (sub) sub.textContent = `${v.name} · ${P.sub(state.tables.length, free())}`;
    restoreFocus();
  };
  dr.el.addEventListener('click', (e) => {
    const head = e.target.closest('[data-pdsp-srv]');
    if (head) {
      const sid = head.getAttribute('data-pdsp-srv');
      openSid = openSid === sid ? null : sid;
      paint();
      const sec = dr.el.querySelector(`[data-pdsp-srv="${CSS.escape(sid)}"]`);
      if (sec && openSid) sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    const cell = e.target.closest('[data-pdsp-t]');
    if (!cell || !openSid) return;
    const tid = cell.getAttribute('data-pdsp-t');
    const t = state.tables.find(o => String(o.id) === tid);
    if (!t) return;
    const ids = pdsServerIds(t);
    if (ids.includes(openSid)) pdsSetServerIds(t, ids.filter(id => id !== openSid));
    else if (ids.length >= PDS_MAX_TABLE_SERVERS) { Kiwi.toast(P.full, { type: 'info', duration: 1600 }); return; }
    else pdsSetServerIds(t, ids.concat(openSid));
    /* A chip toggle is a Choose, on the confirmed tap (design 2027, §20.3). */
    try { if (window.KiwiHaptics) window.KiwiHaptics.play('Choose', window.KiwiHaptics.gid('table-servers'), { trigger: 'tap', eventTimeStamp: e.timeStamp }); } catch (_) {}
    try { pdsSave(state); } catch (_) {}
    const y = dr.el.querySelector('.kiwi-drawer-body')?.scrollTop || 0;
    paint();
    const b = dr.el.querySelector('.kiwi-drawer-body'); if (b) b.scrollTop = y;
  });
}

/* ─── nav-tables handler — main entry point ────────────────────────── */
handlers['nav-tables'] = () => {
  pdsEnsureCss();
  const T = PDS_STR[trLang()] || PDS_STR.fr;
  const v = window.KiwiVenue?.getCurrentVenueData?.() || { name: '', type: 'restaurant' };
  /* Avant de lire : récupérer un dessin laissé sous un ancien identifiant. */
  try { pdsCarryForward(); } catch (_) {}
  const state = pdsLoad();
  let dirty = pdsExpireReservations(state);
  /* La rotation programmée s'applique ici aussi : ouvrir la page au début
     d'un service montre déjà les tables du service. */
  if (pdsAutoRotate(state)) dirty = true;
  if (dirty) { try { pdsSave(state); } catch (_) {} }
  /* L'état vivant, pour que la copie serveur qui arrive pendant qu'on dessine
   * repeigne la salle au lieu de se contenter du localStorage. */
  pdsLive = state;
  { const c = pdsCloud(); if (c) c.bind(); }
  pdsIndexBookings(state);

  if (pdsPhoneWanted()) { pdsOpenPhoneAssign(state, v); return; }

  /* A page in the dashboard frame like every 3.0 destination (Inventaire,
     Promotions…): sidebar kept, the room under a real h1, no overlay, no
     close button, no footer bar. Leaving the page is navigating away. */
  const dr = window.Kiwi.appPage('tables', {
    title: T.title,
    subtitle: pdsSubtitle(state, T, v),
    body: `<div class="pds-page" data-pds-body>${pdsRenderBody(state, T)}</div>`,
  });
  if (!dr || !dr.el) return;
  dr.el.classList.add('pds-host');
  pdsSetSubtitle(dr.el, pdsSubtitle(state, T, v));

  pdsAttach(dr.el, state, T, dr);
};

function pdsSubtitle(state, T, v) {
  v = v || window.KiwiVenue?.getCurrentVenueData?.() || {};
  const effs = state.tables.map(pdsEff);
  const busy = effs.filter(e => e.status === 'occupied' || e.status === 'ordering' || e.status === 'bill').length;
  return T.subtitle(v.name || '', state.tables.length, busy);
}

/* Today's bookings onto plan tables. Cheap, recomputed on open and whenever
   Réservations changes (kiwi-reservations-changed). */
function pdsIndexBookings(state) {
  try {
    const doc = window.KiwiReservations && window.KiwiReservations.get ? window.KiwiReservations.get() : null;
    PDS_BOOK = (window.KiwiFloorLive && doc)
      ? window.KiwiFloorLive.bookings(doc, state.tables, Date.now(), pdsBusinessDayStart())
      : { byTable: {}, unplaced: [] };
  } catch (_) { PDS_BOOK = { byTable: {}, unplaced: [] }; }
}

/* Who is on shift right now, from Équipe. null = the team page has no live
   attendance for this store (demo, or not loaded), so we say nothing rather
   than guess. */
function pdsOnShift() {
  try {
    const roster = window.KiwiTeam && window.KiwiTeam.roster ? window.KiwiTeam.roster() : null;
    if (!roster || !roster.length) return null;
    const map = {};
    roster.forEach(m => { if (m && m.id) map['tm-' + m.id] = m.status || 'off-duty'; });
    return map;
  } catch (_) { return null; }
}

/* ═══ RENDERER ══════════════════════════════════════════════════════ */
function pdsKpis(state, T) {
  const effs = state.tables.map(pdsEff);
  const nTables = state.tables.length;
  const capacity = state.tables.reduce((s, t) => s + pdsGeom(t).seats, 0);
  const free = effs.filter(e => e.status === 'free').length;
  const live = !!(PDS_LIVE && PDS_LIVE.live);
  const seated = effs.reduce((s, e) => s + (e.status !== 'free' && e.status !== 'out' && e.status !== 'reserved' ? (e.covers || 0) : 0), 0);
  const billCents = effs.reduce((s, e) => s + (e.billCents || 0), 0);
  const asked = effs.filter(e => e.status === 'bill').length;
  const duty = pdsOnShift();
  const floorStaff = state.staff.filter(x => x.from === 'team' || !duty);
  const onShift = duty ? state.staff.filter(x => duty[x.id] === 'on-duty').length : null;
  return `
    <div class="kx-kpi-strip pds-kpis" data-pds-kpis>
      <div class="kx-kpi"><div class="l">${T.kpiTables}</div><div class="v">${nTables}</div><div class="d">${pdsEsc(T.kpiTablesD(free, nTables))}</div></div>
      ${live
        ? `<div class="kx-kpi"><div class="l">${T.kpiCoversLive}</div><div class="v">${seated}</div><div class="d">${pdsEsc(T.kpiCoversD(capacity))}</div></div>
           <div class="kx-kpi${asked ? ' warn' : ''}"><div class="l">${T.kpiBills}</div><div class="v">${pdsEsc(T.mad(billCents / 100))}</div><div class="d">${pdsEsc(T.kpiBillsD(asked))}</div></div>`
        : `<div class="kx-kpi"><div class="l">${T.kpiCoversPlan}</div><div class="v">${capacity}</div><div class="d">${pdsEsc(T.kpiCoversPlanD(nTables))}</div></div>
           <div class="kx-kpi"><div class="l">${T.kpiZones}</div><div class="v">${state.zones.length}</div><div class="d">${pdsEsc(state.zones.map(pdsZoneName).slice(0, 2).join(' · '))}${state.zones.length > 2 ? ' …' : ''}</div></div>`}
      <div class="kx-kpi"><div class="l">${T.kpiServers}</div><div class="v">${onShift == null ? state.staff.length : onShift}</div><div class="d">${pdsEsc(T.kpiServersD(onShift, onShift == null ? state.staff.length : floorStaff.length))}</div></div>
    </div>`;
}

/* A till polls its queue every ~6 s; a backgrounded tab can stretch that to a
   minute. Past this, saying "en direct" would be a guess. */
const PDS_TILL_FRESH_MS = 90 * 1000;
function pdsLiveBadge(T) {
  const L = PDS_LIVE;
  let cls = 'is-demo', txt = pdsIsRealStore() ? T.liveNone : T.liveDemo;
  /* `live` only means /api/floor/live answered. "Caisse en direct" is a claim
     about the till, so it needs the till's own heartbeat (order_desk, stamped
     by its authenticated queue poll every few seconds). */
  if (L && L.live && !L.stale) {
    const serverNow = (L.at || Date.now()) + (L.skew || 0);
    const seen = Number(L.tillSeen) || 0;
    if (seen && serverNow - seen < PDS_TILL_FRESH_MS) { cls = 'is-live'; txt = T.liveOn; }
    else if (seen) { cls = 'is-stale'; txt = T.liveTillAway(pdsClock(seen - (L.skew || 0)).replace('h', ':')); }
    else { cls = 'is-demo'; txt = T.liveNoTill; }
  }
  else if (L && L.live && L.stale) { cls = 'is-stale'; txt = T.liveStale(pdsClock(L.at).replace('h', ':')); }
  else if (L && L.reason === 'offline') { cls = 'is-stale'; txt = T.liveOffline; }
  return `<span class="pds-live-badge ${cls}" data-pds-live-badge><i aria-hidden="true"></i>${pdsEsc(txt)}</span>`;
}

function pdsRenderBody(state, T) {
  return `
    ${pdsKpis(state, T)}

    <div class="pds-toolbar">
      <div class="pds-modes" role="tablist" data-pds-modes>
        <button data-activation=write class="pds-mode ${state.mode==='layout'?'active':''}" role="tab" aria-selected="${state.mode==='layout'}" data-pds-mode="layout">${T.modeLayout}</button>
        <button data-activation=write class="pds-mode ${state.mode==='assign'?'active':''}" role="tab" aria-selected="${state.mode==='assign'}" data-pds-mode="assign">${T.modeAssign}</button>
        <button data-activation=write class="pds-mode ${state.mode==='rotate'?'active':''}" role="tab" aria-selected="${state.mode==='rotate'}" data-pds-mode="rotate">${T.modeRotate}</button>
      </div>
      <div class="pds-zone-tabs" data-pds-zones>
        ${state.zones.map(z => `
          <button data-activation=write class="pds-zone ${z.id===state.activeZone?'active':''}" data-pds-zone="${pdsEsc(z.id)}"${z.color ? ` style="--zone:${pdsEsc(z.color)};"` : ''}>
            ${z.color ? '<i class="pds-zone-dot" aria-hidden="true"></i>' : ''}
            <span>${pdsEsc(pdsZoneName(z))}</span>
            <em>${state.tables.filter(t => t.zone === z.id).length}</em>
          </button>
        `).join('')}
        <button data-activation=write class="pds-zone pds-zone-add" data-pds-action="add-zone" title="${pdsEsc(T.addZone)}" aria-label="${pdsEsc(T.addZone)}">+</button>
      </div>
      <span class="pds-toolbar-gap" aria-hidden="true"></span>
      ${pdsLiveBadge(T)}
      ${pdsRenderActions(state, T)}
    </div>

    <div class="pds-stage" data-pds-stage>
      ${pdsRenderStage(state, T)}
    </div>
  `;
}


/* Selection lives in pdsAttach's closure; the renderer needs to read it to
   draw handles on the selected object. This is the same Set, not a copy —
   pdsAttach assigns it — so there is still exactly one source of truth. */
let PDS_SEL = new Set();

/* Find any object by id across both arrays. Tables and fixtures use disjoint
   id prefixes, so one lookup serves both and the inspector, handles and
   keyboard nudge don't need to know which array they're editing. */
function pdsFind(state, id) {
  const t = state.tables.find(o => o.id === id);
  if (t) return { o: t, table: true };
  const e = state.elements.find(o => o.id === id);
  if (e) return { o: e, table: false };
  return null;
}
function pdsPlane(zone) {
  const r = (zone && zone.room) || {};
  return { w: Math.max(240, +r.w || PDS_CANVAS_W), h: Math.max(200, +r.h || PDS_CANVAS_H) };
}
/* Plane of the zone currently on screen — the clamp bound for drag and resize.
   PDS_CANVAS_W/H are now only the default room size, not a global. */
function pdsPlaneOf(state) {
  return pdsPlane(state.zones.find(z => z.id === state.activeZone) || state.zones[0]);
}

/* ─── Undo ────────────────────────────────────────────────────────────────
 *   Snapshots of the three mutable arrays. A designer who cannot undo does
 *   not experiment, and an editor nobody experiments in gets used once.
 *   pdsPush is called BEFORE a mutation, by the action that performs it. */
const PDS_UNDO = { stack: [], redo: [] };
function pdsSnap(state) {
  return JSON.stringify({ zones: state.zones, tables: state.tables, elements: state.elements, staff: state.staff, gone: state.gone || {} });
}
function pdsApplySnap(state, s) {
  const d = JSON.parse(s);
  state.zones = d.zones; state.tables = d.tables; state.elements = d.elements;
  /* Le roster fait partie de l'instantané : sans lui, annuler le retrait d'un
     serveur rendrait ses tables à un identifiant qui n'existe plus. */
  if (d.staff) state.staff = d.staff;
  state.gone = (d.gone && typeof d.gone === 'object') ? d.gone : {};
  if (!state.zones.some(z => z.id === state.activeZone)) state.activeZone = state.zones[0]?.id;
}
function pdsPush(state) {
  PDS_UNDO.stack.push(pdsSnap(state));
  if (PDS_UNDO.stack.length > 40) PDS_UNDO.stack.shift();
  PDS_UNDO.redo.length = 0;
}
/* sessionStorage, keyed by the plan's own storage key: per tab, per store.
   A plan that changed underneath (another device, a reset) makes the stored
   history meaningless, so it is only restored when its tip matches the plan
   as loaded — otherwise it is dropped. */
function pdsUndoKey() { const k = pdsKey(); return k ? 'kiwiPdsUndo:' + k : ''; }
function pdsUndoPersist() {
  const k = pdsUndoKey();
  if (!k || !pdsLive) return;
  try {
    sessionStorage.setItem(k, JSON.stringify({ tip: pdsSnap(pdsLive), stack: PDS_UNDO.stack.slice(-40), redo: PDS_UNDO.redo.slice(-40) }));
  } catch (_) {}
}
function pdsUndoRestore() {
  PDS_UNDO.stack.length = 0;
  PDS_UNDO.redo.length = 0;
  const k = pdsUndoKey();
  if (!k || !pdsLive) return;
  try {
    const d = JSON.parse(sessionStorage.getItem(k) || 'null');
    if (d && d.tip === pdsSnap(pdsLive) && Array.isArray(d.stack)) {
      PDS_UNDO.stack.push(...d.stack.slice(-40));
      PDS_UNDO.redo.push(...(Array.isArray(d.redo) ? d.redo.slice(-40) : []));
    }
  } catch (_) {}
}
function pdsUndo(state) {
  if (!PDS_UNDO.stack.length) return false;
  PDS_UNDO.redo.push(pdsSnap(state));
  pdsApplySnap(state, PDS_UNDO.stack.pop());
  return true;
}
function pdsRedo(state) {
  if (!PDS_UNDO.redo.length) return false;
  PDS_UNDO.stack.push(pdsSnap(state));
  pdsApplySnap(state, PDS_UNDO.redo.pop());
  return true;
}

/* First grid position where a w×h object clears everything already placed,
   with an 8-unit breathing gap. Beats the old "centre + n×16 offset", which
   stacked the 7th item straight back onto the 1st. */
function pdsFreeSpot(state, w, h, plane) {
  const zone = state.activeZone;
  const boxes = state.tables.filter(t => t.zone === zone).map(t => ({ x: t.x, y: t.y, g: pdsGeom(t) }))
    .concat(state.elements.filter(e => e.zone === zone).map(e => ({ x: e.x, y: e.y, g: pdsGeom(e) })));
  /* Chairs stick PDS_PAD out of every table, so a gap smaller than two chair
     bands puts one table's chairs inside its neighbour's. Add walking room on
     top of that: this is a restaurant floor, not a packing problem. */
  const gap = PDS_PAD * 2 + 24;
  const hit = (x, y) => boxes.some(b =>
    x < b.x + b.g.w + gap && x + w + gap > b.x && y < b.y + b.g.h + gap && y + h + gap > b.y);
  /* How much this position actually covers other objects (no gap allowance) —
     used only to rank fallbacks. */
  const overlapArea = (x, y) => boxes.reduce((sum, b) => {
    const ox = Math.min(x + w, b.x + b.g.w) - Math.max(x, b.x);
    const oy = Math.min(y + h, b.y + b.g.h) - Math.max(y, b.y);
    return sum + (ox > 0 && oy > 0 ? ox * oy : 0);
  }, 0);
  const step = PDS_GRID * 2;
  /* Clear of the room's own name plate INCLUDING the chair band: chairs
     stick PDS_PAD above a table, so a table at y=48 put its top chairs
     across the "SALLE" label. 64 stays on the grid and leaves 45px. */
  const top = 64;
  let best = null, bestArea = Infinity;
  for (let y = top; y + h <= plane.h - PDS_GRID; y += step) {
    for (let x = PDS_GRID * 2; x + w <= plane.w - PDS_GRID; x += step) {
      if (!hit(x, y)) return { x, y };
      /* Remember the least-crowded spot in case nothing is fully clear. */
      const a = overlapArea(x, y);
      if (a < bestArea) { bestArea = a; best = { x, y }; }
    }
  }
  /* A full floor used to dump the new object dead-centre, straight on top of
     whatever was already there. Land on the emptiest patch instead — still
     visible, still draggable, but not hidden under a table. */
  return best || { x: Math.max(0, Math.round((plane.w - w) / 2)), y: Math.max(0, Math.round((plane.h - h) / 2)) };
}

/* ─── Resize + rotate ─────────────────────────────────────────────────────
 *   Eight edge/corner handles plus a rotation grip, on tables and fixtures
 *   alike. Two things make this correct rather than approximately correct:
 *
 *   1. Screen deltas are divided by the stage scale k (pdsK) and then rotated
 *      into the object's LOCAL frame, so dragging the east handle of a table
 *      turned 30° widens it along its own axis instead of along the screen's.
 *   2. The handle opposite the one being dragged stays put. Because rotation
 *      is about the centre, holding an edge still means moving the centre to
 *      compensate: with A the anchor in local coords and c the local centre,
 *      C1 = C0 + R·((A0 − A1) + (c1 − c0)). Without that term a rotated
 *      object crawls across the floor as you resize it.                    */
/* Free movement that PULLS to a value within `tol`, instead of the hard
   Math.round(v / grid) * grid that made every drag feel notched. */
function pdsMagnet(v, grid, tol) {
  const n = Math.round(v / grid) * grid;
  return Math.abs(v - n) <= tol ? n : v;
}

/* Repaint ONE cell from state and re-arm its handlers. The old code called
   refresh() on pointerup, which rebuilt the whole drawer body plus both
   rails and reopened the inspector — that rebuild is the hitch you feel at
   the end of every resize. Nothing outside this cell changed, so nothing
   outside it needs to be rebuilt. */
function pdsRepaintCell(root, state, T, id, refresh, selection) {
  const f = pdsFind(state, id);
  const old = root.querySelector(`[data-pds-table="${id}"], [data-pds-el="${id}"]`);
  if (!f || !old) { refresh(); return; }
  const holder = document.createElement('div');
  holder.innerHTML = (f.table ? pdsRenderTable(f.o, state, T) : pdsRenderElement(f.o, state, T)).trim();
  const fresh = holder.firstElementChild;
  if (!fresh) { refresh(); return; }
  old.replaceWith(fresh);
  if (f.table) pdsAttachDrag(fresh, id, state, T, root, refresh, selection);
  else pdsAttachElDrag(fresh, id, state, T, root, refresh);
  pdsBindHandles(fresh, root, state, T, refresh, selection);
  try { pdsSave(state); } catch (_) {}
}

/* Push geometry back into the inspector's number fields without rebuilding
   it — never clobbering a field the merchant is currently typing in. */
function pdsSyncInspector(root, o) {
  const g = pdsGeom(o);
  /* querySelectorAll, not querySelector — rotation has both a dial and a
     number box, and they must not drift apart. */
  const set = (f, v) => {
    root.querySelectorAll(`[data-pds-field="${f}"]`).forEach(el => {
      if (document.activeElement !== el) el.value = v;
    });
  };
  set('w', Math.round(g.w)); set('h', Math.round(g.h));
  set('x', Math.round(o.x));  set('y', Math.round(o.y));
  set('rot', Math.round(o.rot || 0));
  const out = root.querySelector('[data-pds-rotout]');
  if (out) out.textContent = `${Math.round(o.rot || 0)}°`;
}

function pdsAttachResize(root, state, T, refresh, selection) {
  pdsBindHandles(root, root, state, T, refresh, selection);
}

function pdsBindHandles(scope, root, state, T, refresh, selection) {
  scope.querySelectorAll('[data-pds-handle]').forEach(hd => {
    /* bind() runs again on every inspector open: wire each handle once, or a
       resize pushes N undo steps and applies N times. */
    if (hd.getAttribute('data-pds-hwired') === '1') return;
    hd.setAttribute('data-pds-hwired', '1');
    const dir = hd.getAttribute('data-pds-handle');
    const id  = hd.getAttribute('data-pds-hid');
    hd.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const f = pdsFind(state, id);
      if (!f || f.o.locked) return;
      const o = f.o;
      const g0 = pdsGeom(o);
      const K = (f.table ? PDS_TABLE_TYPES[o.type] : PDS_FIX[o.type]) || {};
      const minW = K.minW || 28, minH = K.minH || 28;
      /* A column and a plant are round in plan — they resize, but keeping
         their ratio by default stops them turning into ovals. Shift inverts. */
      const ratioKind = (o.type === 'colonne' || o.type === 'plante');
      const plane = pdsPlaneOf(state);
      const k = pdsK(root);
      const rot0 = o.rot || 0;
      const rad = rot0 * Math.PI / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const R = (vx, vy) => [vx * cos - vy * sin, vx * sin + vy * cos];
      const w0 = g0.w, h0 = g0.h;
      const C0 = [o.x + w0 / 2, o.y + h0 / 2];
      const sx = ev.clientX, sy = ev.clientY;
      const cell = root.querySelector(`[data-pds-table="${id}"], [data-pds-el="${id}"]`);
      const badge = cell ? cell.querySelector('.pds-dim') : null;
      const pad = f.table ? PDS_PAD : 0;

      /* Last geometry that broke nothing — what a blocked frame falls back
         to, so the growing edge visibly stops at the blocker. */
      let last = { x: o.x, y: o.y, w: w0, h: h0, rot: rot0 };
      let lastRot = rot0;
      let live = false, frame = 0, ptr = null;

      const paint = () => {
        if (!cell) return;
        cell.style.left = (o.x - pad) + 'px';
        cell.style.top = (o.y - pad) + 'px';
        cell.style.width = (pdsGeom(o).w + pad * 2) + 'px';
        cell.style.height = (pdsGeom(o).h + pad * 2) + 'px';
        cell.style.transform = `rotate(${o.rot || 0}deg)`;
      };

      const apply = () => {
        frame = 0;
        if (!ptr) return;
        const ddx = (ptr.x - sx) / k, ddy = (ptr.y - sy) / k;
        if (!live) {
          if (Math.abs(ddx) < 2 && Math.abs(ddy) < 2) return;
          live = true;
          pdsPush(state);
          if (cell) cell.classList.add('is-resizing');
        }

        if (dir === 'rot') {
          if (!cell) return;
          const r = cell.getBoundingClientRect();
          let deg = Math.atan2(ptr.y - (r.top + r.height / 2),
                               ptr.x - (r.left + r.width / 2)) * 180 / Math.PI + 90;
          deg = (deg + 360) % 360;
          if (ptr.shift) {
            deg = Math.round(deg / 15) * 15;
          } else {
            /* Magnetic square angles. Free rotation is the default — every
               angle in between stays reachable — but you can still land on
               exactly 90° without aiming for it. */
            const near = Math.round(deg / 90) * 90;
            if (Math.abs(deg - near) <= 3) deg = near;
          }
          o.rot = Math.round(deg) % 360;
          const hits = pdsBlockers(state, o, null);
          const clean = hits.length === 0;
          if (clean) lastRot = o.rot;
          /* Name what is in the way, same as a drag does — "it went red" is
             half an answer without "and this is what it hit". */
          root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
          hits.forEach(b => {
            const n = root.querySelector(`[data-pds-table="${b.id}"], [data-pds-el="${b.id}"]`);
            if (n) n.classList.add('pds-blocker');
          });
          /* THE live preview. The old code returned before this line, so the
             angle updated in state and the screen never moved — which is why
             rotation felt like it snapped to a handful of positions on
             release rather than following the cursor. */
          cell.style.transform = `rotate(${o.rot}deg)`;
          cell.classList.toggle('is-blocked', !clean);
          if (badge) badge.textContent = `${o.rot}°`;
          return;
        }

        /* Screen delta → the object's own axes. */
        const ldx = ddx * cos + ddy * sin;
        const ldy = -ddx * sin + ddy * cos;
        const fromCentre = ptr.alt;
        const m = fromCentre ? 2 : 1;

        let w1 = w0, h1 = h0;
        if (dir.includes('e')) w1 = w0 + ldx * m;
        if (dir.includes('w')) w1 = w0 - ldx * m;
        if (dir.includes('s')) h1 = h0 + ldy * m;
        if (dir.includes('n')) h1 = h0 - ldy * m;

        /* Shift locks the aspect ratio (and unlocks it for the round kinds). */
        if (ptr.shift !== ratioKind) {
          const ar = w0 / h0;
          if (dir === 'n' || dir === 's') w1 = h1 * ar;
          else if (dir === 'e' || dir === 'w') h1 = w1 / ar;
          else if (Math.abs(w1 - w0) / ar >= Math.abs(h1 - h0)) h1 = w1 / ar;
          else w1 = h1 * ar;
        }

        if (state.snap) {
          w1 = pdsMagnet(w1, PDS_GRID, 6);
          h1 = pdsMagnet(h1, PDS_GRID, 6);
        }
        w1 = Math.max(minW, Math.min(plane.w, Math.round(w1)));
        h1 = Math.max(minH, Math.min(plane.h, Math.round(h1)));

        /* Hold the opposite edge — see the note above. Resizing from the
           centre holds the centre instead, so neither edge is an anchor. */
        let C1 = C0;
        if (!fromCentre) {
          const A0 = [dir.includes('w') ? w0 : 0, dir.includes('n') ? h0 : 0];
          const A1 = [dir.includes('w') ? w1 : 0, dir.includes('n') ? h1 : 0];
          const [rx, ry] = R((A0[0] - A1[0]) + (w1 - w0) / 2,
                             (A0[1] - A1[1]) + (h1 - h0) / 2);
          C1 = [C0[0] + rx, C0[1] + ry];
        }

        const at = { x: Math.round(C1[0] - w1 / 2), y: Math.round(C1[1] - h1 / 2), w: w1, h: h1, rot: rot0 };
        if (!rot0) {   /* clamping to the room is only meaningful axis-aligned */
          at.x = Math.max(0, Math.min(plane.w - w1, at.x));
          at.y = Math.max(0, Math.min(plane.h - h1, at.y));
        }

        /* A fixture may not grow through a table. Accept-or-reject is not
           enough: pointermoves are coalesced to one frame, so a fast drag
           can jump a long way between samples and a single rejected frame
           would freeze the whole gesture at its starting size. Bisect
           between the last legal geometry and the requested one instead, so
           the edge lands exactly ON the blocker whatever the frame rate. */
        const hits = pdsBlockers(state, o, at);
        if (!hits.length) {
          last = at;
        } else {
          const lerp = (t) => ({
            x: Math.round(last.x + (at.x - last.x) * t),
            y: Math.round(last.y + (at.y - last.y) * t),
            w: Math.round(last.w + (at.w - last.w) * t),
            h: Math.round(last.h + (at.h - last.h) * t),
            rot: rot0,
          });
          let lo = 0, hi = 1;
          for (let i = 0; i < 8; i++) {
            const mid = (lo + hi) / 2;
            if (pdsBlockers(state, o, lerp(mid)).length) hi = mid; else lo = mid;
          }
          const edge = lerp(lo);
          if (edge.w >= minW && edge.h >= minH) last = edge;
        }
        o.x = last.x; o.y = last.y; o.w = last.w; o.h = last.h;

        /* Name what stopped it — an edge that halts for no visible reason
           reads as a bug, not as a rule. */
        root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
        hits.forEach(b => {
          const n = root.querySelector(`[data-pds-table="${b.id}"], [data-pds-el="${b.id}"]`);
          if (n) n.classList.add('pds-blocker');
        });

        paint();
        if (badge) badge.textContent = `${last.w}×${last.h}`;
      };

      const move = (e2) => {
        /* Snapshot rather than retain the event, and coalesce to one style
           write per frame instead of one per pointermove. */
        ptr = { x: e2.clientX, y: e2.clientY, shift: e2.shiftKey, alt: e2.altKey };
        if (!frame) frame = requestAnimationFrame(apply);
      };

      const up = () => {
        hd.removeEventListener('pointermove', move);
        hd.removeEventListener('pointerup', up);
        hd.removeEventListener('pointercancel', up);
        if (frame) { cancelAnimationFrame(frame); frame = 0; }
        if (cell) cell.classList.remove('is-resizing', 'is-blocked');
        root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
        if (!live) return;          /* a click, not a drag — leave state alone */
        /* Rotation is free to preview through a neighbour; committing is not.
           The angle is what the merchant was aiming at, so honour it and move
           the table to the nearest spot where it fits — reverting the angle
           reads as "the rotation didn't take", which is worse than a nudge.
           Only when the floor has genuinely no room does the angle go back. */
        if (dir === 'rot' && pdsBlockers(state, o, null).length) {
          const spot = pdsNearestFree(state, o, o.x, o.y, plane);
          if (spot) { o.x = spot.x; o.y = spot.y; }
          else { o.rot = lastRot; if (window.Kiwi && Kiwi.toast) Kiwi.toast(T.noRoom); }
          paint();
        }
        selection.clear(); selection.add(id);
        pdsRepaintCell(root, state, T, id, refresh, selection);
        pdsSyncInspector(root, o);
      };

      try { hd.setPointerCapture(ev.pointerId); } catch (_) {}
      hd.addEventListener('pointermove', move);
      hd.addEventListener('pointerup', up);
      hd.addEventListener('pointercancel', up);
    });
  });
}

function pdsRenderStage(state, T) {
  if (state.mode === 'rotate') return pdsRenderRotateStage(state, T);
  /* Layout + Assignation share the same canvas; Assignation overlays a roster. */
  const tablesInZone = state.tables.filter(t => t.zone === state.activeZone);
  const elsInZone = state.elements.filter(e => e.zone === state.activeZone);
  const isEmpty = tablesInZone.length === 0 && elsInZone.length === 0;
  const zone = state.zones.find(z => z.id === state.activeZone) || state.zones[0];
  const P = pdsPlane(zone);
  /* Fixtures paint under tables, and within fixtures a rug must sit under a
     comptoir. z is explicit so the merchant can reorder. */
  const ordered = elsInZone.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
  const noir = pdsNoir();
  return `
    <div class="pds-stage-grid pds-stage-${state.mode}">
      <div class="pds-rail" data-pds-rail>
        ${state.mode === 'layout' ? pdsRenderLayoutRail(state, T) : pdsRenderAssignRail(state, T)}
      </div>
      <div class="pds-canvas-wrap">
        <div class="pds-canvas-bar">
          ${pdsRenderHeatSwitch(T)}
          <div class="pds-bar-tools">
            <span class="pds-zoom" role="group" aria-label="Zoom">
              <button class="pds-tool" data-pds-action="zoom-out" title="${pdsEsc(T.zoomOut)}" aria-label="${pdsEsc(T.zoomOut)}">${pdsIcon('remove')}</button>
              <button class="pds-tool pds-zoom-val" data-pds-action="zoom-fit" title="${pdsEsc(T.zoomFitHint)}">${PDS_ZOOM ? Math.round(PDS_ZOOM * 100) + ' %' : pdsEsc(T.zoomFit)}</button>
              <button class="pds-tool" data-pds-action="zoom-in" title="${pdsEsc(T.zoomIn)}" aria-label="${pdsEsc(T.zoomIn)}">${pdsIcon('add')}</button>
            </span>
            ${state.mode === 'layout' ? `
              <button class="pds-tool" data-pds-action="undo" title="${pdsEsc(T.undo)} (⌘Z)" aria-label="${pdsEsc(T.undo)}"${PDS_UNDO.stack.length ? '' : ' disabled'}>${pdsIcon('undo')}</button>
              <button class="pds-tool" data-pds-action="redo" title="${pdsEsc(T.redo)} (⇧⌘Z)" aria-label="${pdsEsc(T.redo)}"${PDS_UNDO.redo.length ? '' : ' disabled'}>${pdsIcon('redo')}</button>` : ''}
            <button class="pds-tool pds-tool-view" data-pds-action="toggle-view"
                    title="${pdsEsc(noir ? T.viewJour : T.viewNuit)}" aria-label="${pdsEsc(noir ? T.viewJour : T.viewNuit)}">
              ${pdsIcon(noir ? 'light_mode' : 'dark_mode')}
            </button>
            ${state.mode === 'layout' ? `
            <label class="pds-snap" title="${pdsEsc(T.snapHint)}">
              <input type="checkbox" role="switch" data-pds-snap ${state.snap?'checked':''}/>
              <span>${T.snapOn}</span>
            </label>` : ''}
          </div>
        </div>
        <div class="pds-plan-canvas${PDS_ZOOM ? ' is-zoomed' : ''}" data-pds-backdrop
             style="${!noir && pdsRoom(zone).backdrop ? `background:${pdsRoom(zone).backdrop};` : ''}">
          <div class="pds-plan-room" data-pds-room style="${pdsRoomSize(P)} aspect-ratio:${P.w} / ${P.h};">
            <div class="pds-plan-label"${zone && zone.color ? ` style="--zone:${pdsEsc(zone.color)};"` : ''}>${pdsEsc(pdsZoneName(zone))}</div>
            <div class="pds-plan-scale" data-pds-scale
                 style="width:${P.w}px; height:${P.h}px; transform:scale(calc(100cqw / ${P.w}px));">
              <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
                <linearGradient id="pdsNoirBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#101312"/><stop offset="100%" stop-color="#050605"/></linearGradient>
                <radialGradient id="pdsNoirCall"><stop offset="0%" stop-color="#00FFAE" stop-opacity="0.20"/><stop offset="100%" stop-color="#00FFAE" stop-opacity="0"/></radialGradient>
                <filter id="pdsNoirLift" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.8"/></filter>
                <radialGradient id="pdsJourCall"><stop offset="0%" stop-color="#0B6E4F" stop-opacity="0.16"/><stop offset="100%" stop-color="#0B6E4F" stop-opacity="0"/></radialGradient>
                <radialGradient id="pdsNoirBill"><stop offset="0%" stop-color="#FF7DA9" stop-opacity="0.22"/><stop offset="100%" stop-color="#FF7DA9" stop-opacity="0"/></radialGradient>
                <radialGradient id="pdsJourBill"><stop offset="0%" stop-color="#C2456F" stop-opacity="0.16"/><stop offset="100%" stop-color="#C2456F" stop-opacity="0"/></radialGradient>
                <filter id="pdsJourLift" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0A0F0D" flood-opacity="0.20"/></filter>
              </defs></svg>
              ${noir ? pdsRoomShellNoir(zone) : pdsRoomShellJour(zone)}
              <div class="pds-canvas" data-pds-canvas style="width:${P.w}px; height:${P.h}px;">
                ${isEmpty ? pdsRenderEmpty(state, T) : ''}
                ${ordered.map(e => pdsRenderElement(e, state, T)).join('')}
                ${pdsRenderGroups(tablesInZone, state, T)}
                ${tablesInZone.map(t => pdsRenderTable(t, state, T)).join('')}
                <div class="pds-marquee" data-pds-marquee hidden></div>
                <div class="pds-bulk" data-pds-bulk hidden></div>
              </div>
            </div>
          </div>
        </div>
        <div class="pds-plan-footer">
          ${pdsRenderLegend(state, T)}
          <span class="pds-plan-meta">
            <span class="pds-plan-floor-count" data-pds-floor-count>${pdsEsc(pdsFloorCount(tablesInZone, T))}</span>
            <span class="pds-plan-dims" title="${state.mode === 'layout' ? pdsEsc(T.kbdHint) : ''}">${P.w} × ${P.h} ${T.unitCm}</span>
          </span>
        </div>
      </div>
      <div class="pds-inspector" data-pds-inspector>
        ${pdsRenderInspectorEmpty(state, T)}
      </div>
    </div>
  `;
}

/* Material Symbols, outlined 400 (assets/icons/material), inlined so the
   toolbar does not wait on eight requests. The paths are the vendored files'
   own `d`, unedited. */
const PDS_ICONS = {
  add: 'M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z',
  remove: 'M200-440v-80h560v80H200Z',
  undo: 'M280-200v-80h284q63 0 109.5-40T720-420q0-60-46.5-100T564-560H312l104 104-56 56-200-200 200-200 56 56-104 104h252q97 0 166.5 63T800-420q0 94-69.5 157T564-200H280Z',
  redo: 'M396-200q-97 0-166.5-63T160-420q0-94 69.5-157T396-640h252L544-744l56-56 200 200-200 200-56-56 104-104H396q-63 0-109.5 40T240-420q0 60 46.5 100T396-280h284v80H396Z',
  light_mode: 'M565-395q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Zm-226.5 56.5Q280-397 280-480t58.5-141.5Q397-680 480-680t141.5 58.5Q680-563 680-480t-58.5 141.5Q563-280 480-280t-141.5-58.5ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-650l-101-97 57-59 96 100-52 56Zm492 496-97-101 53-55 101 97-57 59Zm-98-550 97-101 59 57-100 96-56-52ZM154-212l101-97 55 53-97 101-59-57Zm326-268Z',
  dark_mode: 'M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Zm0-80q88 0 158-48.5T740-375q-20 5-40 8t-40 3q-123 0-209.5-86.5T364-660q0-20 3-40t8-40q-78 32-126.5 102T200-480q0 116 82 198t198 82Zm-10-270Z',
  chevron_left: 'M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z',
  chevron_right: 'M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z',
  print: 'M640-640v-120H320v120h-80v-200h480v200h-80Zm-480 80h640-640Zm560 100q17 0 28.5-11.5T760-500q0-17-11.5-28.5T720-540q-17 0-28.5 11.5T680-500q0 17 11.5 28.5T720-460Zm-80 260v-160H320v160h320Zm80 80H240v-160H80v-240q0-51 35-85.5t85-34.5h560q51 0 85.5 34.5T880-520v240H720v160Zm80-240v-160q0-17-11.5-28.5T760-560H200q-17 0-28.5 11.5T160-520v160h80v-80h480v80h80Z',
  image: 'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Zm-40 80v-560 560Z',
};
function pdsIcon(name) {
  const d = PDS_ICONS[name];
  return d ? `<svg viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>` : '';
}

/* Zoom. 0 = ajusté : la salle tient en entier, en largeur ET en hauteur —
   c'est ce qui coupait le bas de la salle sur un portable. Au-delà, la
   salle grandit et le cadre défile (molette, trackpad, ou espace + glisser). */
let PDS_ZOOM = 0;
function pdsRoomSize(P) {
  if (!PDS_ZOOM) return `width:min(100%, calc((100dvh - var(--pds-chrome, 330px)) * ${P.w} / ${P.h})); max-width:${P.w * 1.6}px;`;
  return `width:${Math.round(P.w * PDS_ZOOM)}px; max-width:none;`;
}
function pdsFloorCount(tables, T) {
  const busy = tables.map(pdsEff).filter(e => e.status === 'occupied' || e.status === 'ordering' || e.status === 'bill').length;
  return T.floorCount(busy, tables.length);
}

/* La légende EST le filtre : chaque statut porte son compte et se clique. */
function pdsRenderLegend(state, T) {
  const counts = {};
  state.tables.filter(t => t.zone === state.activeZone).forEach(t => {
    const st = pdsEff(t).status; counts[st] = (counts[st] || 0) + 1;
  });
  const live = !!(PDS_LIVE && PDS_LIVE.live);
  /* Sans caisse, « à commander / addition / réglée » ne sont que du bruit :
     on n'affiche que les statuts qui existent dans cette salle, plus les
     trois de base. */
  const shown = PDS_LEGEND.filter(st => counts[st] || ['free', 'occupied', 'reserved'].includes(st) || (live && st === 'bill'));
  return `<div class="pds-legend" role="group" aria-label="${pdsEsc(T.legendTitle)}">
    ${shown.map(st => `
      <button type="button" class="pds-legend-item${PDS_FILTER.has(st) ? ' on' : ''}" data-pds-filter="${st}" aria-pressed="${PDS_FILTER.has(st)}">
        <span class="pds-legend-swatch pds-sw-${st}"></span>${pdsEsc(pdsStatusLabel(st, T))}<b>${counts[st] || 0}</b>
      </button>`).join('')}
    ${PDS_FILTER.size ? `<button type="button" class="pds-legend-clear" data-pds-filter="">${pdsEsc(T.filterAll)}</button>` : ''}
  </div>`;
}

function pdsRenderHeatSwitch(T) {
  const live = !!(PDS_LIVE && PDS_LIVE.live);
  const opt = (k, l) => `<button type="button" class="pds-heat-opt${PDS_HEAT === k ? ' on' : ''}" data-pds-heat="${k}"${!live && k !== 'status' ? ` disabled title="${pdsEsc(T.heatNeedsLive)}"` : ''}>${pdsEsc(l)}</button>`;
  return `<span class="pds-heat" role="group" aria-label="${pdsEsc(T.heatLabel)}">${opt('status', T.heatStatus)}${opt('revenue', T.heatRevenue)}${opt('turns', T.heatTurns)}</span>`;
}

/* Merchant-authored strings (zone names, fixture labels) reach innerHTML, so
   they get escaped. `${zone.name}` used to interpolate raw. */

function pdsRenderEmpty(state, T) {
  return `
    <div class="pds-empty">
      <h4>${T.emptyTitle}</h4>
      <p>${T.emptyDesc}</p>
      <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
        <button class="kb atlas" data-pds-action="scan-salle">${T.scanSalle}</button>
        <button data-activation=write class="kb atlas" data-pds-action="open-wizard">${T.wizGenerate}</button>
        <button data-activation=write class="kb ghost" data-pds-action="add-table-default">${T.emptyBlank}</button>
      </div>
    </div>
  `;
}

/* Layout rail — table palette + every fixture kind + the room panel.
   The fixture list is generated from PDS_FIX, so adding a kind there makes it
   placeable here with no second edit. */
/* Pick a seat count, then a shape: five buttons instead of twelve tiles
   (« Ronde 2 », « Ronde 4 »…). The seat count picks the size class, so the
   table that lands is the one a merchant would have chosen from the grid. */
let PDS_PAL_SEATS = 4;
const PDS_SHAPES = ['round', 'square', 'rect', 'bar', 'high'];
/* What each palette shape can actually seat. The palette's "Places" stepper
   applied to every shape, so a counter stool (56×56) and a mange-debout came
   out with 4 seats, a square with 8: chairs the till then counted as covers. */
const PDS_SHAPE_MAX_SEATS = { round: 8, square: 4, rect: 10, bar: 1, high: 4 };
function pdsPalSeats(shape) {
  return Math.max(1, Math.min(PDS_PAL_SEATS, PDS_SHAPE_MAX_SEATS[shape] || PDS_PAL_SEATS));
}
function pdsTypeFor(shape, seats) {
  seats = Math.max(1, +seats || 4);
  if (shape === 'round') return seats <= 2 ? 'round2' : seats <= 4 ? 'round4' : seats <= 6 ? 'round6' : 'round8';
  if (shape === 'square') return seats <= 2 ? 'sq2' : 'sq4';
  if (shape === 'rect') return seats <= 4 ? 'rect4' : seats <= 6 ? 'rect6' : seats <= 8 ? 'rect8' : 'rect10';
  return shape === 'bar' ? 'bar' : 'high';
}
/* Table numbers used more than once. The till and the waiter app address a
   table by its number, so two « 4 » send one order to the wrong table. */
/* The key a number is known by. On a real store it is the till's own key
   (functions/api/service/events.js › tableKey), which reads « T4 » and
   « Table 4 » as table 4: a plan holding both « 4 » and « T4 » sends the
   counter's orders for one to both. A demo has no till behind it, so only
   identical numbers count there. */
function pdsNumKey(num) {
  const raw = String(num == null ? '' : num).trim().toLowerCase();
  if (!pdsIsRealStore()) return raw;
  return raw.replace(/^table\s*/, '').replace(/^t(?=\d+$)/, '');
}
function pdsDuplicateNums(state) {
  const groups = {};
  state.tables.forEach(t => {
    const k = pdsNumKey(t.num);
    if (!k) return;
    (groups[k] = groups[k] || new Set()).add(String(t.num));
  });
  const out = [];
  Object.keys(groups).forEach(k => {
    const n = state.tables.filter(t => pdsNumKey(t.num) === k).length;
    if (n > 1) out.push([...groups[k]].join(' = '));
  });
  return out;
}
const PDS_ZONE_COLORS = ['#0B6E4F', '#053B2C', '#C89235', '#B5653A', '#7A8B6F', '#5A6CDB', '#C0306E', '#2C2520'];
/* Folded sections (« Style de la salle ») keep their state across the
   re-renders that every edit triggers. */
const PDS_FOLD = {};
function pdsRenderLayoutRail(state, T) {
  const groups = {};
  Object.entries(PDS_FIX).forEach(([k, v]) => { (groups[v.grp] = groups[v.grp] || []).push([k, v]); });
  const zone = state.zones.find(z => z.id === state.activeZone) || state.zones[0];
  const zi = state.zones.indexOf(zone);
  const dups = pdsDuplicateNums(state);
  /* Les clés sont en minuscules (grpsalle) : la recherche capitalisée tombait
     toujours sur PDS_FIX_GRP, en français sous EN et AR. */
  const grpName = (grp) => T['grp' + grp] || PDS_FIX_GRP[grp];
  return `
    ${dups.length ? `<div class="pds-rail-warn" role="status">
      <span>${pdsEsc(T.dupNums(dups.join(', ')))}</span>
      <button class="pds-link" data-pds-action="renumber">${pdsEsc(T.renumber)}</button>
    </div>` : ''}
    <section class="pds-rail-card">
      <h3 class="pds-rail-title">${T.paletteTitle}</h3>
      <div class="pds-pal-seats">
        <span>${pdsEsc(T.paletteSeats)}</span>
        <div class="pds-step">
          <button class="pds-step-btn" data-pds-action="pal-seats" data-pds-delta="-1" aria-label="${pdsEsc(T.inspectorSeats)} −">−</button>
          <output class="pds-step-out" data-pds-pal-seats>${PDS_PAL_SEATS}</output>
          <button class="pds-step-btn" data-pds-action="pal-seats" data-pds-delta="1" aria-label="${pdsEsc(T.inspectorSeats)} +">+</button>
        </div>
      </div>
      <div class="pds-palette pds-palette-shapes">
        ${PDS_SHAPES.map(sh => {
          const t = PDS_TABLE_TYPES[pdsTypeFor(sh, PDS_PAL_SEATS)];
          const label = T['shape' + sh.charAt(0).toUpperCase() + sh.slice(1)];
          return `
            <button data-activation=write class="pds-pal-item" data-pds-action="add-shape" data-pds-shape="${sh}" title="${pdsEsc(label)} · ${pdsPalSeats(sh)} ${pdsEsc(T.seats)}">
              <span class="pds-pal-shape pds-pal-${t.shape}" style="width:${Math.min(t.w/2, 30)}px; height:${Math.min(t.h/2, 26)}px;"></span>
              <span class="pds-pal-label">${pdsEsc(label)}</span>
            </button>`;
        }).join('')}
      </div>
    </section>
    <section class="pds-rail-card">
      <h3 class="pds-rail-title">${pdsEsc(T.furnitureTitle)}</h3>
      ${Object.entries(groups).map(([grp, items], gi) => {
        const key = 'grp-' + grp;
        const open = PDS_FOLD[key] == null ? gi === 0 : PDS_FOLD[key];
        return `
        <details class="pds-fold pds-fold-sub" data-pds-fold="${key}"${open ? ' open' : ''}>
          <summary class="pds-rail-sub">${pdsEsc(grpName(grp))}<em>${items.length}</em></summary>
          <div class="pds-palette pds-palette-el">
            ${items.map(([k, v]) => `
              <button data-activation=write class="pds-pal-item pds-pal-el" data-pds-action="add-el" data-pds-eltype="${k}" title="${T['fix' + k] || k}">
                <span class="pds-pal-mini">${pdsFixMini(k, v)}</span>
                <span class="pds-pal-label">${T['fix' + k] || k}</span>
              </button>`).join('')}
          </div>
        </details>`;
      }).join('')}
    </section>
    <section class="pds-rail-card">
      <div class="pds-rail-head">
        <h3 class="pds-rail-title">${pdsEsc(zone ? pdsZoneName(zone) : '')}</h3>
        <span class="pds-rail-head-tools">
          <button class="pds-tool" data-pds-action="zone-move" data-pds-delta="-1" title="${pdsEsc(T.zoneMoveL)}" aria-label="${pdsEsc(T.zoneMoveL)}"${zi <= 0 ? ' disabled' : ''}>${pdsIcon('chevron_left')}</button>
          <button class="pds-tool" data-pds-action="zone-move" data-pds-delta="1" title="${pdsEsc(T.zoneMoveR)}" aria-label="${pdsEsc(T.zoneMoveR)}"${zi >= state.zones.length - 1 ? ' disabled' : ''}>${pdsIcon('chevron_right')}</button>
        </span>
      </div>
      <div class="pds-zone-tools">
        <button class="kb ghost" data-pds-action="rename-zone">${pdsEsc(T.renameShort)}</button>
        <button class="kb ghost" data-pds-action="zone-duplicate">${pdsEsc(T.duplicateShort)}</button>
      </div>
      <div class="pds-rail-sub">${pdsEsc(T.zoneColor)}</div>
      <div class="pds-sw-row">
        <button data-activation=write class="pds-sw pds-sw-none ${zone && zone.color ? '' : 'active'}" data-pds-action="zone-color" data-pds-val="" title="${pdsEsc(T.backdropNone)}" aria-label="${pdsEsc(T.backdropNone)}"></button>
        ${PDS_ZONE_COLORS.map(c => `<button data-activation=write class="pds-sw ${zone && zone.color === c ? 'active' : ''}" data-pds-action="zone-color" data-pds-val="${c}" style="background:${c};" aria-label="${c}"></button>`).join('')}
      </div>
      <button data-activation=write class="pds-link pds-link-danger" data-pds-action="delete-zone">${T.deleteZone}</button>
    </section>
    ${pdsRenderRoomCard(state, T)}
  `;
}

/* Palette thumbnail — the fixture drawn by its own draw() at a small size, so
   the button always shows what will actually be placed. No second artwork to
   keep in sync. */
function pdsFixMini(kind, K) {
  const box = 26;
  const ar = K.w / K.h;
  const w = ar >= 1 ? box : Math.max(6, box * ar);
  const h = ar >= 1 ? Math.max(6, box / ar) : box;
  const g = { w, h };
  /* La vignette passe par le MÊME renderer au trait que la scène
     (pdsNoirFixture, qui choisit son encre selon la vue) : le bouton montre
     ce qui sera réellement posé. Le texte n'a pas de dessin — un Aa suffit. */
  const inkAa = pdsNoir() ? 'rgba(255,255,255,0.45)' : 'rgba(10,15,13,0.55)';
  if (K.render === 'none') {
    return `<span style="font:600 9px/1 var(--font-mono,monospace);color:${inkAa};">Aa</span>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${pdsNoirFixture({ type: kind }, K, g)}</svg>`;
}

/* Thumbnail drawn from the candidate's OWN objects. The five templates
   shipped hand-drawn previews next to a stored cover count, which is how
   a card advertising 60 covers could load a plan holding 98 — two sources
   of truth for one number. Here there is only the plan. */
function pdsPlanThumb(plan) {
  const z = plan.zones[0];
  if (!z) return '';
  const W = z.room.w, H = z.room.h;
  const r = pdsRoom(z);
  const items = plan.elements.filter(e => e.zone === z.id)
    .map(e => ({ o: e, c: pdsShade(pdsColor(e), -0.04) }))
    .concat(plan.tables.filter(t => t.zone === z.id).map(t => ({ o: t, c: pdsColor(t) })));
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect x="0" y="0" width="${W}" height="${H}" fill="${r.floor}" stroke="${r.wall}" stroke-width="10"/>
    ${items.map(({ o, c }) => {
      const g = pdsGeom(o);
      const round = (g.shape === 'round');
      return round
        ? `<ellipse cx="${o.x + g.w / 2}" cy="${o.y + g.h / 2}" rx="${g.w / 2}" ry="${g.h / 2}" fill="${c}"/>`
        : `<rect x="${o.x}" y="${o.y}" width="${g.w}" height="${g.h}" rx="6" fill="${c}"/>`;
    }).join('')}
  </svg>`;
}

/* Room panel — floor, walls, finish, dimensions. Replaces the six-scene
   dropdown: instead of picking one of six frozen drawings, the merchant sets
   the four properties those drawings differed by. */
function pdsRenderRoomCard(state, T) {
  const zone = state.zones.find(z => z.id === state.activeZone) || state.zones[0];
  const r = pdsRoom(zone);
  const P = pdsPlane(zone);
  const sw = (val, field) => PDS_MAT.map(m => `
    <button data-activation=write class="pds-sw ${m.c.toLowerCase() === String(val).toLowerCase() ? 'active' : ''}"
            data-pds-room-field="${field}" data-pds-val="${m.c}"
            style="background:${m.c};" title="${T['mat' + m.id] || m.id}"
            aria-label="${T['mat' + m.id] || m.id}"></button>`).join('');
  /* A free picker alongside the 16 tokens. Any hex is allowed, but the
     handler pulls it back into a legible luminance band so pdsInk() can
     always find readable ink for a table number — see pdsSafeColor. */
  const custom = (val, field) => `
    <label class="pds-sw pds-sw-custom" title="${T.customColor}">
      <input type="color" data-pds-room-field="${field}" value="${pdsHexOf(val)}"/>
    </label>`;
  /* En vue nuit le rendu aplatit toute matière vers le charbon (pdsNoirC) :
     ambiance, sol, murs, fond et finition n'auraient aucun effet visible.
     On ne montre que les dimensions. La vue jour trace murs et sol à l'encre
     (pdsRoomShellJour) : seuls ambiance, teinte du sol et fond jouent encore —
     murs et finition ont suivi le même sort que la nuit. */
  const noir = pdsNoir();
  return `
    <details class="pds-rail-card pds-fold" data-pds-fold="room"${PDS_FOLD.room ? ' open' : ''}>
      <summary class="pds-rail-title">${T.roomTitle}</summary>
      <div class="pds-rail-hint">${noir ? T.roomHintNuit : T.roomHint}</div>
      ${noir ? '' : `
      <label class="pds-mini-label">${T.ambianceLabel}</label>
      <div class="pds-amb-row">
        ${Object.keys(PDS_AMBIANCE).map(k => {
          const A = PDS_AMBIANCE[k];
          return `<button data-activation=write class="pds-amb ${zone && zone.ambiance === k ? 'active' : ''}"
                          data-pds-action="ambiance" data-pds-amb="${k}" title="${T['amb'+k]}">
            <span class="pds-amb-chips" aria-hidden="true">
              <i style="background:${A.room.floor}"></i><i style="background:${A.room.wall}"></i>
              <i style="background:${A.table}"></i><i style="background:${A.backdrop}"></i>
            </span>
            <span class="pds-amb-name">${T['amb'+k]}</span>
          </button>`;
        }).join('')}
      </div>
      <label class="pds-mini-label">${T.roomFloor}</label>
      <div class="pds-sw-row">${sw(r.floor, 'floor')}${custom(r.floor, 'floor')}</div>
      <label class="pds-mini-label">${T.roomBackdrop}</label>
      <div class="pds-sw-row">
        <button data-activation=write class="pds-sw pds-sw-none ${r.backdrop ? '' : 'active'}"
                data-pds-room-field="backdrop" data-pds-val=""
                title="${T.backdropNone}" aria-label="${T.backdropNone}"></button>
        ${sw(r.backdrop, 'backdrop')}${custom(r.backdrop || '#F7F5F0', 'backdrop')}
      </div>`}
      <div class="pds-num-grid">
        <label>${T.roomW}<input class="kf-input pds-input" type="number" min="240" max="2400" step="20" data-pds-room-field="w" value="${P.w}"/></label>
        <label>${T.roomH}<input class="kf-input pds-input" type="number" min="200" max="2000" step="20" data-pds-room-field="h" value="${P.h}"/></label>
        <label>${T.roomWallW}<input class="kf-input pds-input" type="number" min="0" max="14" step="1" data-pds-room-field="wallW" value="${r.wallW}"/></label>
      </div>
    </details>
  `;
}

/* Assignation rail — roster of servers */
function pdsRenderAssignRail(state, T) {
  /* Qui est réellement là, d'après le pointage d'Équipe. Un serveur absent
     garde ses tables, mais la pastille le dit. */
  const duty = pdsOnShift();
  const nOn = duty ? state.staff.filter(x => duty[x.id] === 'on-duty').length : null;
  const dutyLabel = (st) => st === 'on-duty' ? T.onShift : st === 'on-pause' ? T.onPause : T.offShift;
  return `
    <div class="pds-rail-card">
      <div class="pds-rail-title">${T.rosterTitle}</div>
      <div class="pds-rail-hint">${pdsEsc(nOn == null ? T.rosterHint : T.rosterShiftNow(nOn))}</div>
      <div class="pds-roster">
        ${state.staff.length ? state.staff.map(s => {
          const tbls = state.tables.filter(t => pdsHasServer(t, s.id));
          const seats = tbls.reduce((acc, t) => acc + pdsGeom(t).seats, 0);
          const st = duty && s.from === 'team' ? (duty[s.id] || 'off-duty') : null;
          return `
            <div class="pds-chip${st && st !== 'on-duty' ? ' is-off' : ''}" draggable="false" data-pds-chip="${pdsEsc(s.id)}" style="--chip:${pdsEsc(s.color)};">
              <span class="pds-chip-dot"></span>
              <span class="pds-chip-body">
                <b>${pdsEsc(s.name)}</b>
                <em>${st ? `<span class="pds-duty pds-duty-${st}">${pdsEsc(dutyLabel(st))}</span> · ` : ''}${T.rosterTables(tbls.length)} · ${T.rosterCovers(seats)}</em>
              </span>
              ${s.from === 'team' ? '' : `<button class="pds-chip-x" type="button" title="${T.rosterRemove}" aria-label="${T.rosterRemove}" data-pds-action="del-server" data-pds-sid="${pdsEsc(s.id)}">×</button>`}
            </div>
          `;
        }).join('') : `<div class="pds-roster-empty">${T.rosterEmpty}</div>`}
      </div>
      <button data-activation=write class="kb ghost pds-rail-cta" data-pds-action="add-server">${T.rosterAdd}</button>
    </div>
    <div class="pds-rail-card">
      <button class="kb ghost pds-rail-cta pds-rail-danger" data-pds-action="clear-assign">${T.clearAssign}</button>
    </div>
  `;
}

/* Empty inspector */
function pdsRenderInspectorEmpty(state, T) {
  const head = state.mode === 'assign'
    ? `<div class="pds-rail-card pds-inspect-empty">
        <div class="pds-rail-title">${T.modeAssign}</div>
        <div class="pds-rail-hint">${T.modeAssignDesc}</div>
        ${pdsRenderAssignSummary(state, T)}
      </div>`
    : `<div class="pds-rail-card pds-inspect-empty pds-inspect-hint">
        <div class="pds-rail-title">${T.selection}</div>
        <div class="pds-rail-hint">${pdsEsc(T.bulkHintNone)}</div>
        ${state.mode === 'layout' ? `<p class="pds-kbd-hint">${pdsEsc(T.kbdHint)}</p>` : ''}
      </div>`;
  return pdsRenderLivePanel(state, T) + head;
}

/* « En ce moment » — what the inspector column shows when nothing is
   selected, instead of a lone hint in 240 px of blank paper. Everything here
   is read from the till and from Réservations; nothing is typed. */
function pdsRenderLivePanel(state, T) {
  const now = Date.now();
  const zoneName = (id) => (state.zones.find(z => z.id === id) || {}).name || '';
  const num = (t) => pdsTableNum(t);
  const rows = state.tables.map(t => ({ t, e: pdsEff(t) }));
  const bills = rows.filter(r => r.e.status === 'bill');
  const check = rows.filter(r => r.e.since && (r.e.status === 'occupied' || r.e.status === 'ordering' || r.e.status === 'bill') && pdsSince(r.e.since)?.check);
  const goto = (t, body) => `<button type="button" class="pds-live-row" data-pds-goto="${pdsEsc(t.id)}">${body}</button>`;
  let html = `<div class="pds-rail-card pds-live" data-pds-live-panel>
    <div class="pds-live-head"><div class="pds-rail-title">${pdsEsc(T.liveTitle)}</div></div>`;
  if (bills.length) {
    html += `<div class="pds-live-sec is-urgent"><div class="pds-live-sub">${pdsEsc(T.liveBills)} · ${bills.length}</div>
      ${bills.map(({ t, e }) => goto(t, `<b>${pdsEsc(num(t))}</b><span>${pdsEsc(zoneName(t.zone))}</span><em>${e.billCents ? pdsEsc(T.mad(e.billCents / 100)) : ''}</em>`)).join('')}
    </div>`;
  }
  if (check.length) {
    html += `<div class="pds-live-sec is-check"><div class="pds-live-sub">${pdsEsc(T.liveCheck)} · ${check.length}</div>
      <p class="pds-live-note">${pdsEsc(T.liveCheckHint)}</p>
      ${check.map(({ t, e }) => goto(t, `<b>${pdsEsc(num(t))}</b><span>${pdsEsc(zoneName(t.zone))}</span><em>${pdsEsc(pdsSince(e.since).label)}</em>`)).join('')}
    </div>`;
  }
  /* Today's bookings: placed first by time, then the ones without a table. */
  const placed = [];
  Object.keys(PDS_BOOK.byTable || {}).forEach(id => {
    const t = state.tables.find(x => x.id === id);
    (PDS_BOOK.byTable[id] || []).forEach(b => { if (t && b.startAt >= now - 15 * 60000) placed.push({ b, t }); });
  });
  placed.sort((a, b) => a.b.startAt - b.b.startAt);
  const unplaced = (PDS_BOOK.unplaced || []).filter(b => b.startAt >= now - 15 * 60000);
  html += `<div class="pds-live-sec"><div class="pds-live-sub">${pdsEsc(T.liveUpcoming)}${placed.length + unplaced.length ? ' · ' + (placed.length + unplaced.length) : ''}</div>`;
  if (!placed.length && !unplaced.length) html += `<p class="pds-live-note">${pdsEsc(T.liveNoBookings)}</p>`;
  html += placed.slice(0, 8).map(({ b, t }) => goto(t,
    `<b>${pdsEsc(pdsClock(b.startAt))}</b><span>${pdsEsc(b.name)}${b.partySize ? ` · ${b.partySize}p` : ''}</span><em>${pdsEsc(num(t))}</em>`)).join('');
  html += unplaced.slice(0, 6).map(b => `<div class="pds-live-row is-unplaced">
      <b>${pdsEsc(pdsClock(b.startAt))}</b><span>${pdsEsc(b.name)}${b.partySize ? ` · ${b.partySize}p` : ''}</span>
      <button type="button" class="kb ghost pds-live-place" data-pds-action="place-booking" data-pds-booking="${pdsEsc(b.id)}">${pdsEsc(T.livePlace)}</button>
    </div>`).join('');
  html += `</div>`;
  /* Today, per zone: turns, average time at table, revenue per seat. */
  if (PDS_LIVE && PDS_LIVE.live) {
    const zones = state.zones.map(z => {
      const ts = state.tables.filter(t => t.zone === z.id);
      let turns = 0, open = 0, minutes = 0, timed = 0, rev = 0;
      ts.forEach(t => {
        const st = pdsStatsOf(t);
        if (!st) return;
        turns += st.turns || 0; open += st.open || 0; rev += st.revenueCents || 0;
        if (st.avgMinutes) { minutes += st.avgMinutes * (st.turns || 1); timed += st.turns || 1; }
      });
      const seats = ts.reduce((n, t) => n + pdsGeom(t).seats, 0);
      return { z, turns, open, avg: timed ? Math.round(minutes / timed) : 0, perSeat: seats ? rev / 100 / seats : 0 };
    }).filter(x => x.turns || x.open);
    html += `<div class="pds-live-sec"><div class="pds-live-sub">${pdsEsc(T.liveToday)}</div>`;
    html += zones.length
      ? zones.map(x => `<div class="pds-live-stat"><b>${pdsEsc(pdsZoneName(x.z))}</b>
          <span>${pdsEsc(T.liveTurns(x.turns))}${x.open ? ' · ' + pdsEsc(T.liveOpen(x.open)) : ''}${x.avg ? ' · ' + pdsEsc(T.liveAvg(x.avg)) : ''}</span>
          <em>${pdsEsc(T.liveRevSeat(T.mad(x.perSeat)))}</em></div>`).join('')
      : `<p class="pds-live-note">${pdsEsc(T.liveNoStats)}</p>`;
    html += `</div>`;
  }
  return html + `</div>`;
}

function pdsRenderAssignSummary(state, T) {
  /* Tables per server — quick overview when no table is selected */
  return `
    <div class="pds-assign-sum">
      ${state.staff.map(s => {
        const tbls = state.tables.filter(t => pdsHasServer(t, s.id));
        return `<div class="pds-asum-row" style="--chip:${s.color};">
          <span class="pds-asum-dot"></span>
          <span class="pds-asum-name">${pdsEsc(s.name.split(' ')[0])}</span>
          <span class="pds-asum-n">${tbls.length}</span>
        </div>`;
      }).join('')}
      ${state.tables.filter(t => !pdsServerIds(t).length).length > 0 ? `
        <div class="pds-asum-row pds-asum-unassigned">
          <span class="pds-asum-dot" style="--chip:#9CA3AF;"></span>
          <span class="pds-asum-name">${T.rosterUnassigned}</span>
          <span class="pds-asum-n">${state.tables.filter(t => !pdsServerIds(t).length).length}</span>
        </div>
      ` : ''}
    </div>
  `;
}

/* ─── Inspector ───────────────────────────────────────────────────────────
 *   One inspector serves tables and fixtures. Geometry (X/Y/W/H/rotation) is
 *   editable numerically as well as by handle, because "make both banquettes
 *   exactly 240 wide" is not a drag gesture.                               */
function pdsRenderInspector(state, T, obj) {
  const found = pdsFind(state, obj.id) || { o: obj, table: true };
  const isT = found.table;
  const g = pdsGeom(obj);
  const c = pdsColor(obj);
  const K = isT ? (PDS_TABLE_TYPES[obj.type] || {}) : (PDS_FIX[obj.type] || {});
  const title = isT ? T.inspectorTitle(obj.num)
                    : (T['fix' + obj.type] || obj.type);
  const swatches = PDS_MAT.map(m => `
    <button data-activation=write class="pds-sw ${m.c.toLowerCase() === String(c).toLowerCase() ? 'active' : ''}"
            data-pds-field="color" data-pds-val="${m.c}" style="background:${m.c};"
            title="${T['mat' + m.id] || m.id}" aria-label="${T['mat' + m.id] || m.id}"></button>`).join('')
    /* Free picker per object. Choosing one sets colorLock, so a later
       ambiance repaints the room around this piece and leaves it alone. */
    + `<label class="pds-sw pds-sw-custom ${obj.colorLock ? 'active' : ''}" title="${T.customColor}">
         <input type="color" data-pds-field="color" value="${pdsHexOf(c)}"/>
       </label>`;
  return `
    <div class="pds-rail-card pds-inspect" data-pds-inspect-id="${obj.id}">
      <div class="pds-inspect-head">
        <div class="pds-rail-title">${pdsEsc(title)}</div>
        <button class="pds-inspect-close" data-pds-action="deselect" title="${T.bulkClear}" aria-label="${T.bulkClear}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      ${isT ? `
        <div class="pds-form-row">
          <label>${T.inspectorNum}</label>
          <input class="kf-input pds-input" data-pds-field="num" value="${pdsEsc(obj.num)}"/>
          ${state.tables.some(o => o.id !== obj.id && pdsNumKey(o.num) && pdsNumKey(o.num) === pdsNumKey(obj.num))
            ? `<span class="pds-field-warn" role="status">${pdsEsc(T.dupNumField)}</span>` : ''}
        </div>
        <div class="pds-form-row">
          <label>${T.inspectorType}</label>
          <select class="kf-input pds-input" data-pds-field="type">
            ${Object.entries(PDS_TABLE_TYPES).map(([k,v]) => `<option value="${k}" ${k===obj.type?'selected':''}>${v.label(T)}</option>`).join('')}
          </select>
        </div>
        <div class="pds-form-row">
          <label>${T.inspectorSeats}</label>
          <div class="pds-step">
            <button class="pds-step-btn" data-pds-action="seats-down" data-pds-id="${obj.id}" aria-label="${pdsEsc(T.inspectorSeats)} −">−</button>
            <input class="kf-input pds-input pds-step-val" type="number" min="0" max="24" data-pds-field="seats" value="${g.seats}"/>
            <button class="pds-step-btn" data-pds-action="seats-up" data-pds-id="${obj.id}" aria-label="${pdsEsc(T.inspectorSeats)} +">+</button>
          </div>
        </div>
      ` : `
        <div class="pds-form-row">
          <label>${T.inspectorLabel}</label>
          <input class="kf-input pds-input" data-pds-field="label"
                 value="${pdsEsc(pdsFixLabel(obj, K, T))}" placeholder="·"/>
        </div>
      `}

      <div class="pds-form-row">
        <label>${T.inspectorSize} <span class="pds-unit">${T.unitCm}</span></label>
        <div class="pds-num-grid pds-num-4">
          <label>L<input class="kf-input pds-input" type="number" min="${K.minW||16}" max="2400" data-pds-field="w" value="${Math.round(g.w)}"/></label>
          <label>H<input class="kf-input pds-input" type="number" min="${K.minH||16}" max="2000" data-pds-field="h" value="${Math.round(g.h)}"/></label>
          <label>X<input class="kf-input pds-input" type="number" min="0" max="2400" data-pds-field="x" value="${Math.round(obj.x)}"/></label>
          <label>Y<input class="kf-input pds-input" type="number" min="0" max="2000" data-pds-field="y" value="${Math.round(obj.y)}"/></label>
        </div>
      </div>

      <div class="pds-form-row">
        <label>${T.inspectorRotation} <span class="pds-unit" data-pds-rotout>${Math.round(obj.rot||0)}°</span></label>
        <div class="pds-rot-row">
          <input class="pds-range" type="range" min="0" max="359" step="1" data-pds-field="rot" value="${Math.round(obj.rot||0)}"/>
          <input class="kf-input pds-input pds-rot-num" type="number" min="0" max="359" step="1"
                 data-pds-field="rot" value="${Math.round(obj.rot||0)}" aria-label="${T.inspectorRotation}"/>
          <button class="pds-step-btn" data-pds-action="rot-90" data-pds-id="${obj.id}" title="+90°">90°</button>
        </div>
      </div>

      ${!pdsNoir() && isT ? `
      <div class="pds-form-row">
        <label>${T.inspectorMaterial}</label>
        <div class="pds-sw-row">${swatches}</div>
      </div>` : ''}

      ${isT ? `
        ${pdsRenderStatusRow(state, T, obj)}
        ${obj.status === 'reserved' ? `
        <div class="pds-resv-fields">
          <label class="pds-resv-field">
            <span>${T.reservationName}</span>
            <input class="kf-input pds-input" data-pds-field="reservationName"
                   value="${pdsEsc(obj.reservationName || '')}" placeholder="${pdsEsc(T.reservationNamePlaceholder)}"/>
          </label>
          <label class="pds-resv-field">
            <span>${T.reservationTime}</span>
            <input class="kf-input pds-input" type="time" data-pds-field="reservationTime"
                   value="${pdsEsc(obj.reservationTime || '')}"/>
          </label>
        </div>` : ''}
        <div class="pds-form-row">
          <label>${T.inspectorServer} · ${PDS_MAX_TABLE_SERVERS} max.</label>
          ${(() => {
            /* An empty roster used to render three selects reading
               "Aucun", "·", "·" — a picker with nothing to pick. Say so,
               and otherwise offer one empty slot after the filled ones. */
            if (!state.staff.length) return `<p class="pds-field-hint">${pdsEsc(T.inspectorNoStaff)}</p>`;
            const assigned = pdsServerIds(obj);
            const spare = state.staff.length > assigned.length ? 1 : 0;
            const shown = Math.min(PDS_MAX_TABLE_SERVERS, Math.max(1, assigned.length + spare));
            return Array.from({ length: shown }, (_, slot) => `<select class="kf-input pds-input pds-server-slot" data-pds-server-slot="${slot}">
              <option value="">${slot === 0 ? T.inspectorUnassigned : pdsEsc(T.inspectorAddServer)}</option>
              ${state.staff.filter(s => s.id === assigned[slot] || !assigned.includes(s.id))
                .map(s => `<option value="${s.id}" ${s.id===assigned[slot]?'selected':''}>${pdsEsc(s.name)}</option>`).join('')}
            </select>`).join('');
          })()}
        </div>
        <div class="pds-form-row">
          <label>${T.inspectorNotes}</label>
          <input class="kf-input pds-input" data-pds-field="notes" value="${pdsEsc(obj.notes || '')}" placeholder="·"/>
        </div>
      ` : `
        <div class="pds-form-row">
          <label>${T.inspectorDepth}</label>
          <div class="pds-inspect-actions pds-actions-tight">
            <button class="kb ghost" data-pds-action="layer-back" data-pds-id="${obj.id}">${T.layerBack}</button>
            <button class="kb ghost" data-pds-action="layer-front" data-pds-id="${obj.id}">${T.layerFront}</button>
          </div>
        </div>
      `}

      ${isT && obj.group ? (() => {
        /* La fusion se lit ici aussi : partenaires et capacité partagée. */
        const disp = (n) => /^\d$/.test(String(n)) ? '0' + n : n;
        const peers = state.tables.filter(tt => tt.group === obj.group && tt.id !== obj.id)
          .sort((a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true }));
        const seats = state.tables.filter(tt => tt.group === obj.group)
          .reduce((s, tt) => s + (pdsGeom(tt).seats || 0), 0);
        return `<div class="pds-group-info">${pdsEsc(T.groupedWith(peers.map(p => disp(p.num)).join(' + ')))} · ${pdsEsc(T.groupCovers(seats))}</div>`;
      })() : ''}

      <div class="pds-inspect-actions">
        <button class="kb ghost" data-pds-action="obj-lock" data-pds-id="${obj.id}">${obj.locked ? T.unlock : T.lock}</button>
        ${isT ? `<button class="kb ghost ${state._groupPickFrom === obj.id ? 'pds-group-arming' : ''}" data-pds-action="table-group" data-pds-id="${obj.id}">${T.groupTables}</button>` : ''}
        ${isT && obj.group ? `<button class="kb ghost" data-pds-action="table-ungroup" data-pds-id="${obj.id}">${T.ungroupTables}</button>` : ''}
        <button class="kb ghost" data-pds-action="table-duplicate" data-pds-id="${obj.id}">${T.inspectorDuplicate}</button>
        <button data-activation=write class="kb ghost pds-rail-danger" data-pds-action="table-delete" data-pds-id="${obj.id}">${T.inspectorDelete}</button>
      </div>
    </div>
  `;
}

/* Ce que le patron peut marquer à la main. Dans un vrai magasin, le service
   (en cours, addition, réglée) appartient à la caisse : il ne garde que ce
   qu'elle ignore. Sur une démo, toute la palette, pour montrer la salle. */
function pdsManualStatuses() {
  return pdsIsRealStore() ? ['free', 'reserved', 'out'] : ['free', 'ordering', 'occupied', 'bill', 'paid', 'reserved', 'out'];
}
function pdsRenderStatusRow(state, T, obj) {
  const eff = pdsEff(obj);
  const manual = obj.status === 'out' ? 'out' : pdsStatusKey(obj.status);
  const fromTill = eff.source === 'till' && eff.status !== 'free';
  let html = '';
  if (fromTill || (PDS_LIVE && PDS_LIVE.live)) {
    const si = eff.since ? pdsSince(eff.since) : null;
    const g = pdsGeom(obj);
    html += `<div class="pds-form-row">
      <label>${pdsEsc(T.tillStatus)}</label>
      <div class="pds-till-status pds-till-${eff.status}">
        <span class="pds-legend-swatch pds-sw-${eff.status}"></span>
        <b>${pdsEsc(pdsStatusLabel(eff.status, T))}</b>
        ${eff.covers && eff.status !== 'free' ? `<span>${pdsEsc(T.coversNow(eff.covers, g.seats))}</span>` : ''}
        ${si && eff.status !== 'free' ? `<span>${pdsEsc(si.check ? T.checkTable : T.since(si.label))}</span>` : ''}
        ${eff.billCents ? `<span>${pdsEsc(T.billNow)} · ${pdsEsc(T.mad(eff.billCents / 100))}</span>` : ''}
      </div>
      <p class="pds-field-hint">${pdsEsc(T.tillStatusHint)}</p>
    </div>`;
  }
  const choices = pdsManualStatuses();
  html += `<div class="pds-form-row">
    <label>${pdsEsc(pdsIsRealStore() ? T.holdLabel : T.inspectorStatus)}</label>
    <div class="pds-status-pills" data-pds-status-row>
      ${choices.map(st => `
        <button data-activation=write class="pds-status-pill pds-pill-${st} ${manual === st ? 'active' : ''}" data-pds-status="${st}" aria-pressed="${manual === st}">
          ${pdsEsc(st === 'free' && pdsIsRealStore() ? T.holdNone : pdsStatusLabel(st, T))}
        </button>`).join('')}
    </div>
  </div>`;
  if (eff.booking) {
    html += `<div class="pds-group-info">${pdsEsc(pdsClock(eff.booking.startAt))} · ${pdsEsc(eff.booking.name)}${eff.booking.partySize ? ' · ' + eff.booking.partySize + 'p' : ''}</div>`;
  }
  return html;
}

function pdsRenderBulkInspector(state, T, selectedIds) {
  return `
    <div class="pds-rail-card pds-inspect">
      <div class="pds-inspect-head">
        <div class="pds-rail-title">${T.selection} · ${selectedIds.length}</div>
        <button class="pds-inspect-close" data-pds-action="deselect" title="${T.bulkClear}" aria-label="${T.bulkClear}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="pds-form-row">
        <label>${T.bulkSetStatus}</label>
        <div class="pds-status-pills">
          ${pdsManualStatuses().map(st => `
            <button class="pds-status-pill pds-pill-${st}" data-pds-action="bulk-status" data-pds-status="${st}">
              ${pdsEsc(pdsStatusLabel(st, T))}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="pds-inspect-actions" style="margin-top:6px;">
        <button class="kb ghost" data-pds-action="bulk-align-h">${T.bulkAlignH}</button>
        <button class="kb ghost" data-pds-action="bulk-align-v">${T.bulkAlignV}</button>
        <button class="kb ghost" data-pds-action="bulk-dist-h">${T.bulkDistH}</button>
        <button class="kb ghost" data-pds-action="bulk-dist-v">${T.bulkDistV}</button>
      </div>
      <div class="pds-inspect-actions">
        <button class="kb ghost" data-pds-action="bulk-group">${T.bulkGroup}</button>
        <button class="kb ghost" data-pds-action="bulk-clear">${T.bulkClear}</button>
        <button data-activation=write class="kb ghost pds-rail-danger" data-pds-action="bulk-delete" style="grid-column:1 / -1;">${T.bulkDelete}</button>
      </div>
    </div>
  `;
}

/* ─── Seating ─────────────────────────────────────────────────────────────
 *   Chairs are derived from the table's CURRENT dimensions, not from a fixed
 *   per-type recipe. Each side's capacity comes from its length, so widening
 *   a 4-top puts the new chairs on the long sides instead of cramming them,
 *   and a resize visibly changes the seating — which is the whole point of
 *   being able to resize.                                                  */

/* One chair, anchored at a point ON the table edge and extending outward
   along its local −y. Seat pad + backrest, drawn in logical units. */


/* Compose a fixture's box into CSS.
 *   `bg` may be a solid or a gradient and `overlay` is a second image layer
 *   (brass rail, tile hatch, slats). They cannot both go through the
 *   `background` shorthand: the shorthand resets background-image, so a later
 *   `background-image: <overlay>` silently DELETED the body gradient — which
 *   is why the comptoir rendered as an empty outline with a gold strip. Both
 *   go into one background-image list instead, overlay first (topmost), with
 *   a solid background-color underneath. */

/* Resize/rotate affordances, drawn only on the single selected object.
   Inset by --pad so they hug the tabletop, not the chair band. */
function pdsHandles(o, g, T) {
  if (o.locked) {
    return `<span class="pds-locked" title="${T.lockedHint}" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
    </span>`;
  }
  const dirs = ['nw','n','ne','e','se','s','sw','w'];
  return `<div class="pds-hdl-layer">
    ${dirs.map(d => `<span class="pds-hdl pds-hdl-${d}" data-pds-handle="${d}" data-pds-hid="${o.id}"></span>`).join('')}
    <span class="pds-hdl pds-hdl-rot" data-pds-handle="rot" data-pds-hid="${o.id}" title="${T.rotateHint}"></span>
    <span class="pds-dim">${Math.round(g.w)}×${Math.round(g.h)}</span>
  </div>`;
}

/* ─── Table ───────────────────────────────────────────────────────────────
 *   The viewBox is generated from this table's own w/h, so one SVG unit is
 *   one logical unit and the tabletop cannot be stretched out of shape no
 *   matter what size the merchant drags it to. Number and cover count are an
 *   HTML overlay, never SVG text — SVG text scales with the shape and smears
 *   on a long table.                                                       */
/* ─── Tables groupées, façon accueil ─────────────────────────────────────
 * Le mockup de l'accueil fusionne « 06 + 07 » : une enveloppe capsule qui
 * embrasse les deux tables, un halo doux derrière, et une pastille combinée
 * au-dessus. Ici la même grammaire, pilotée par `t.group` (id partagé,
 * persisté dans le plan) : l'enveloppe se dessine SOUS les tables — c'est
 * un lien, pas un couvercle — et suit les tables quand on les déplace. */
function pdsSweepGroups(state) {
  /* Un groupe réduit à une seule table après suppression n'existe plus. */
  const count = {};
  state.tables.forEach(t => { if (t.group) count[t.group] = (count[t.group] || 0) + 1; });
  state.tables.forEach(t => { if (t.group && count[t.group] < 2) delete t.group; });
}

function pdsTodayKey(now) {
  const d = new Date(now == null ? Date.now() : now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* One place that sets a hand-marked status. Service states (ordering,
   occupied, bill) start the seated clock; everything else stops it. */
function pdsSetStatus(t, st) {
  st = st === 'out' ? 'out' : pdsStatusKey(st);
  t.status = st;
  if (st === 'ordering' || st === 'occupied' || st === 'bill') {
    if (!t.since) t.since = Date.now();
    pdsClearReservation(t);
  } else {
    delete t.since;
    if (st === 'reserved') { if (!t.reservationDate) t.reservationDate = pdsTodayKey(); }
    else pdsClearReservation(t);
  }
}

function pdsClearReservation(t) {
  delete t.reservationName;
  delete t.reservationTime;
  delete t.reservationDate;
}

/* A grouped table is one service object: status, seated time and reservation
   details follow the anchor across every member, regardless of group size. */
function pdsSyncGroupService(state, gid, anchor) {
  if (!gid || !anchor) return;
  state.tables.forEach(t => {
    if (t.group !== gid || t.id === anchor.id) return;
    t.status = anchor.status || 'free';
    if ((anchor.status === 'occupied' || anchor.status === 'ordering' || anchor.status === 'bill') && anchor.since) t.since = anchor.since;
    else delete t.since;
    if (anchor.status === 'reserved') {
      if (anchor.reservationName) t.reservationName = anchor.reservationName;
      else delete t.reservationName;
      if (anchor.reservationTime) t.reservationTime = anchor.reservationTime;
      else delete t.reservationTime;
      if (anchor.reservationDate) t.reservationDate = anchor.reservationDate;
      else delete t.reservationDate;
    } else {
      pdsClearReservation(t);
    }
  });
}

/* Time-only reservations belong to the day on which they were entered. Once
   that instant is over by two hours, the next render returns the whole group
   to libre. Keeping the date internally prevents yesterday's 23:30 booking
   from surviving until tonight when the dashboard opens after midnight. */
function pdsExpireReservations(state, now) {
  now = now == null ? Date.now() : now;
  const expiredGroups = new Set();
  const expiredIds = new Set();
  let changed = false;
  state.tables.forEach(t => {
    if (t.status !== 'reserved' || !/^\d{2}:\d{2}$/.test(t.reservationTime || '')) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.reservationDate || '')) {
      t.reservationDate = pdsTodayKey(now);
      changed = true;
    }
    const day = t.reservationDate;
    const stamp = new Date(`${day}T${t.reservationTime}:00`).getTime();
    if (Number.isFinite(stamp) && now > stamp + 2 * 60 * 60 * 1000) {
      if (t.group) expiredGroups.add(t.group);
      else expiredIds.add(t.id);
    }
  });
  state.tables.forEach(t => {
    if (!expiredIds.has(t.id) && !(t.group && expiredGroups.has(t.group))) return;
    t.status = 'free';
    delete t.since;
    pdsClearReservation(t);
    changed = true;
  });
  return changed;
}

function pdsReservationLabel(t) {
  const time = /^\d{2}:\d{2}$/.test(t.reservationTime || '') ? t.reservationTime.replace(':', 'h') : '';
  const name = String(t.reservationName || '').trim();
  return [time, name].filter(Boolean).join(' · ');
}

/* Destructive toasts restore only the table objects the action touched. This
   avoids rewinding unrelated edits the merchant may make while the five-second
   undo window is open. */
function pdsTableSnapshot(state, tables) {
  return tables.map(t => ({
    index: state.tables.indexOf(t),
    value: JSON.parse(JSON.stringify(t)),
  }));
}

function pdsRestoreTableSnapshot(state, snapshot) {
  snapshot.slice().sort((a, b) => a.index - b.index).forEach(s => {
    const value = JSON.parse(JSON.stringify(s.value));
    const at = state.tables.findIndex(t => t.id === value.id);
    if (at >= 0) state.tables[at] = value;
    else state.tables.splice(Math.max(0, Math.min(s.index, state.tables.length)), 0, value);
    if (typeof pdsUnbury === 'function') pdsUnbury(state, value.id);
  });
}

function pdsOfferTableUndo(state, T, snapshot, refresh, selection, title, restoredTitle, selectId) {
  let restored = false;
  Kiwi.toast(title, {
    type: 'warn', duration: 5200, force: true,
    action: {
      label: T.undoAction,
      onClick: () => {
        if (restored) return;
        restored = true;
        pdsPush(state);
        pdsRestoreTableSnapshot(state, snapshot);
        selection.clear();
        if (selectId && state.tables.some(t => t.id === selectId)) selection.add(selectId);
        refresh();
        if (selectId) setTimeout(() => state._openInspector(selectId), 0);
        Kiwi.toast(restoredTitle, { type: 'success', duration: 1400, force: true });
      },
    },
  });
}

function pdsRenderGroups(tables, state, T) {
  const byGroup = new Map();
  tables.forEach(t => {
    if (!t.group) return;
    if (!byGroup.has(t.group)) byGroup.set(t.group, []);
    byGroup.get(t.group).push(t);
  });
  let out = '';
  byGroup.forEach((members, gid) => {
    if (members.length < 2) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let seats = 0;
    members.forEach(t => {
      const g = pdsGeom(t);
      x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y);
      x1 = Math.max(x1, t.x + g.w); y1 = Math.max(y1, t.y + g.h);
      seats += g.seats || 0;
    });
    const pad = 8;
    const nums = members.slice()
      .sort((a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true }))
      .map(t => /^\d$/.test(String(t.num)) ? '0' + t.num : t.num);
    out += `
      <div class="pds-group-env" data-pds-group="${pdsEsc(gid)}" style="left:${x0 - pad}px; top:${y0 - pad}px; width:${(x1 - x0) + pad * 2}px; height:${(y1 - y0) + pad * 2}px;">
        <span class="pds-group-chip">${pdsEsc(nums.join(' + '))}<span class="pds-group-covers"> · ${pdsEsc(T.groupCovers(seats))}</span></span>
      </div>`;
  });
  return out;
}

/* ─── La salle vivante ────────────────────────────────────────────────────
 *   PDS_LIVE  : la dernière réponse de /api/floor/live (KiwiFloorLive.watch),
 *               null sur une démo ou tant que rien n'est arrivé.
 *   PDS_BOOK  : les réservations du jour posées sur les tables du plan.
 *   PDS_FILTER: les statuts mis en avant par la légende (vide = tous).
 *   PDS_HEAT  : ce que la salle colore — le statut, le chiffre, les tours.
 *   Rien de tout ça n'est rangé dans le plan : c'est l'état du service, pas
 *   le dessin de la salle, et il ne doit jamais partir dans le document. */
let PDS_LIVE = null;
let PDS_BOOK = { byTable: {}, unplaced: [] };
const PDS_FILTER = new Set();
let PDS_HEAT = 'status';
const PDS_LEGEND = ['free', 'ordering', 'occupied', 'bill', 'paid', 'reserved', 'out'];
function pdsStatusKey(s) {
  s = String(s || 'free');
  if (s === 'cleaning') return 'paid';
  return PDS_LEGEND.includes(s) ? s : 'free';
}
function pdsStatusLabel(st, T) {
  return T['status' + st.charAt(0).toUpperCase() + st.slice(1)] || st;
}
function pdsEff(t) {
  if (window.KiwiFloorLive) return window.KiwiFloorLive.resolve(t, PDS_LIVE, PDS_BOOK);
  const st = t && (t.out ? 'out' : pdsStatusKey(t.status));
  return { status: st, source: 'plan', since: st === 'occupied' ? (+t.since || 0) : 0, covers: 0, billCents: 0, booking: null };
}
function pdsSince(ts) {
  if (window.KiwiFloorLive) return window.KiwiFloorLive.since(ts);
  const min = Math.max(0, Math.round((Date.now() - ts) / 60000));
  return { minutes: min, label: min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`, check: min >= 240 };
}
function pdsClock(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
}
function pdsFiltered(st) { return PDS_FILTER.size > 0 && !PDS_FILTER.has(st); }
function pdsStatsOf(t) {
  if (!PDS_LIVE || !PDS_LIVE.live || !PDS_LIVE.stats) return null;
  const k = window.KiwiFloorLive ? window.KiwiFloorLive.tableKey(t.num) : String(t.num);
  return PDS_LIVE.stats[k] || null;
}
/* Carte de chaleur : chaque table teintée par sa part du meilleur de la salle
   aujourd'hui. Rien à teinter sans la caisse — la carte se tait plutôt que
   d'inventer. */
function pdsHeat(t) {
  if (PDS_HEAT === 'status' || !PDS_LIVE || !PDS_LIVE.live) return null;
  const all = Object.values(PDS_LIVE.stats || {});
  const s = pdsStatsOf(t) || { turns: 0, revenueCents: 0 };
  const T = PDS_STR[trLang()] || PDS_STR.fr;
  if (PDS_HEAT === 'revenue') {
    const max = Math.max(1, ...all.map(x => x.revenueCents || 0));
    return { a: 0.06 + 0.54 * ((s.revenueCents || 0) / max), label: s.revenueCents ? T.mad(s.revenueCents / 100) : '' };
  }
  const max = Math.max(1, ...all.map(x => x.turns || 0));
  return { a: 0.06 + 0.54 * ((s.turns || 0) / max), label: s.turns ? T.liveTurns(s.turns) : '' };
}
/* Ce qui, d'un sondage à l'autre, change le dessin d'une table. Une table
   dont la signature ne bouge pas n'est pas repeinte — c'est ce qui permet de
   sonder la caisse sans arracher la table sous le curseur. */
function pdsSig(t) {
  const e = pdsEff(t);
  const si = e.since ? pdsSince(e.since) : null;
  const h = pdsHeat(t);
  return [e.status, si ? (si.check ? 'check' : si.label) : '', e.covers, e.billCents,
    e.booking ? e.booking.id : '', e.next ? e.next.id : '', h ? h.label : '', pdsFiltered(e.status) ? 1 : 0].join('|');
}

function pdsRenderTable(t, state, T) {
  const g = pdsGeom(t);
  /* Les deux vues passent par le MÊME tracé (chaises en tirets, corps posé
     sur son ombre, numéro à deux chiffres) — seule l'encre change : blanc et
     menthe la nuit, encre et atlas le jour, où le corps porte en plus le
     lavis de la matière choisie (pdsJourC) pour que le nuancier MATIÈRE
     reste un vrai choix. Le rendu matières de floorplan-core reste à la
     caisse, intact. */
  const noir = pdsNoir();
  const c = pdsColor(t);
  const P = PDS_PAD;
  const sel = PDS_SEL.has(t.id);
  const only = sel && PDS_SEL.size === 1;
  const assignedServers = pdsServerIds(t).map(id => state.staff.find(s => s.id === id)).filter(Boolean);
  const sv = assignedServers[0];
  const R = noir ? PDS_STATUS_RING_NOIR : PDS_STATUS_RING_JOUR;
  /* Le statut AFFICHÉ n'est plus t.status : c'est la caisse d'abord, puis la
     réservation du jour, puis la marque du patron (KiwiFloorLive.resolve). */
  const eff = pdsEff(t);
  const st = eff.status;
  const ring = R[st] || R.free;
  const ink = ring.t || (noir ? 'rgba(255,255,255,0.5)' : 'rgba(10,15,13,0.60)');
  const body = noir
    ? pdsNoirTableBody(g, ring, st)
    : pdsNoirTableBody(g, ring, st, pdsJourC(c, 0.30));

  const showChairs = state.showChairs !== false;
  const chairs = showChairs ? pdsNoirChairs(g, g.seats, ring) : '';
  const numDisp = /^\d$/.test(String(t.num)) ? '0' + t.num : t.num;
  const serverBadge = assignedServers.length
    ? `<span class="pds-tbl-servers" aria-hidden="true">${assignedServers.map(server => {
        const initials = server.name.split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase();
        const paint = pdsBadge(server.color);
        return `<span class="pds-tbl-server" style="background:${pdsEsc(paint.bg)};color:${paint.ink};" title="${pdsEsc(server.name)}">${initials}</span>`;
      }).join('')}</span>`
    : '';
  /* La pastille « 6 min » du mockup : le temps depuis l'assise, posé
   * au-dessus de la table. Elle n'existe que si la table porte son heure
   * d'occupation (t.since, écrite quand le statut passe à occupée). */
  /* Au-delà de 4 h la pastille ne compte plus : une table ouverte depuis
     si longtemps est presque toujours oubliée sur la caisse. Elle dit
     « à vérifier », jamais « 1514 h 59 ». */
  let sinceChip = '';
  const sinceInfo = eff.since ? pdsSince(eff.since) : null;
  if (sinceInfo && (st === 'occupied' || st === 'ordering' || st === 'bill')) {
    sinceChip = sinceInfo.check
      ? `<span class="pds-tbl-since is-check" aria-hidden="true" title="${pdsEsc(T.liveCheckHint)}">${pdsEsc(T.checkTable)}</span>`
      : `<span class="pds-tbl-since" aria-hidden="true">${pdsEsc(sinceInfo.label)}</span>`;
  }
  let reservationLabel = '';
  if (st === 'reserved') {
    reservationLabel = eff.booking
      ? [pdsClock(eff.booking.startAt), eff.booking.name, eff.booking.partySize ? eff.booking.partySize + 'p' : ''].filter(Boolean).join(' · ')
      : pdsReservationLabel(t);
  } else if (st === 'free' && eff.next) {
    reservationLabel = T.liveSoon(pdsClock(eff.next.startAt));
  }
  const reservationChip = reservationLabel
    ? `<span class="pds-resv-chip${st === 'reserved' ? '' : ' is-next'}" aria-hidden="true">${pdsEsc(reservationLabel)}</span>`
    : '';
  const billChip = (st === 'bill' || st === 'occupied' || st === 'ordering') && eff.billCents > 0
    ? `<span class="pds-bill-chip" aria-hidden="true">${pdsEsc(T.mad(eff.billCents / 100))}</span>` : '';
  const heat = pdsHeat(t);
  /* The button is named by its content: a hidden « Table », the number as
     printed, then seats, status and whatever the chips say. The chips and the
     covers line are drawn for the eye and hidden from the tree, so a screen
     reader hears each fact once and the name starts with the visible number
     (WCAG 2.5.3, no aria-label that could drift from the face). */
  const cellRest = [
    g.seats ? `${eff.covers && st !== 'free' ? eff.covers + '/' : ''}${g.seats} ${T.seats}` : '',
    pdsStatusLabel(st, T),
    assignedServers.map(sv => sv.name).join(', '),
    sinceInfo && sinceChip ? (sinceInfo.check ? T.checkTable : sinceInfo.label) : '',
    reservationLabel,
    billChip ? T.mad(eff.billCents / 100) : '',
    heat && heat.label ? heat.label : '',
  ].filter(Boolean);

  return `
    <div class="pds-tbl-cell ${sel?'is-selected':''} ${state.mode==='assign' && sv?'pds-has-server':''} ${t.locked?'is-locked':''} ${pdsFiltered(st)?'is-dim':''} ${heat?'has-heat':''}"
         data-pds-table="${t.id}" data-status="${st}" data-pds-sig="${pdsEsc(pdsSig(t))}"
         role="button" tabindex="0"
         style="left:${t.x - P}px; top:${t.y - P}px; width:${g.w + P*2}px; height:${g.h + P*2}px;
                --pad:${P}px; transform:rotate(${t.rot||0}deg);${heat ? ` --heat:${heat.a.toFixed(2)};` : ''}">
      <svg class="pds-tbl-svg" viewBox="${-P} ${-P} ${g.w + P*2} ${g.h + P*2}" aria-hidden="true">
        ${chairs}${body}
      </svg>
      <div class="pds-tbl-face" style="color:${ink};">
        <span class="pds-sr">${pdsEsc(T.tableName || 'Table')} </span><span class="pds-tbl-num">${pdsEsc(numDisp)}</span>${cellRest.length ? `<span class="pds-sr">, ${pdsEsc(cellRest.join(', '))}</span>` : ''}
        ${g.seats ? `<span class="pds-tbl-covers" aria-hidden="true">${eff.covers && st !== 'free' ? `${eff.covers}/` : ''}${g.seats}p</span>` : ''}
        ${heat && heat.label ? `<span class="pds-tbl-heat" aria-hidden="true">${pdsEsc(heat.label)}</span>` : ''}
      </div>
      ${serverBadge}
      ${sinceChip}
      ${reservationChip}
      ${billChip}
      ${only ? pdsHandles(t, g, T) : ''}
    </div>
  `;
}

/* ─── Fixture ─────────────────────────────────────────────────────────────
 *   Two render strategies, chosen per kind — see the note on PDS_FIX. Both
 *   are resize-safe; the label is always an HTML overlay.                   */
function pdsRenderElement(e, state, T) {
  const K = PDS_FIX[e.type];
  if (!K) return '';
  const g = pdsGeom(e);
  const noir = pdsNoir();
  const c = pdsColor(e);
  const sel = PDS_SEL.has(e.id);
  const only = sel && PDS_SEL.size === 1;
  const label = pdsFixLabel(e, K, T);

  /* Les deux vues dessinent les mêmes idéogrammes au trait (pdsNoirFixture
     choisit son encre selon la vue) — les gabarits peints de floorplan-core
     restent à la caisse. */
  const inner = K.render === 'none' ? ''
    : `<svg class="pds-el-svg" viewBox="0 0 ${g.w} ${g.h}" aria-hidden="true">${pdsNoirFixture(e, K, g)}</svg>`;

  return `
    <div class="pds-el pds-el-${e.type} ${sel?'is-selected':''} ${e.locked?'is-locked':''}"
         data-pds-el="${e.id}" role="button" tabindex="0"
         aria-label="${pdsEsc(T['fix'+e.type] || e.type)}"
         style="left:${e.x}px; top:${e.y}px; width:${g.w}px; height:${g.h}px;
                --pad:0px; transform:rotate(${e.rot||0}deg); z-index:${10 + (e.z||0)};">
      <div class="pds-el-fill">${inner}</div>
      ${label ? `<span class="pds-el-label" style="color:${noir ? 'rgba(255,255,255,0.62)' : 'rgba(10,15,13,0.55)'};">${pdsEsc(label)}</span>` : ''}
      ${only ? pdsHandles(e, g, T) : ''}
    </div>
  `;
}

/* ─── Rotation ─────────────────────────────────────────────────────────────
 *   It used to promise « servers notified » and a schedule, and did neither:
 *   the period was stored and never read, « par paires » was the same
 *   round-robin as « par tables », and the fairness bars were drawn from a
 *   seeded demo week. Now:
 *     · pdsRotateStep computes one real step for each strategy;
 *     · pdsAutoRotate applies it once per service / day / week, the first
 *       time the plan opens in that period, on any device;
 *     · history only grows from rotations that actually happened. */
function pdsRotationKey(period, now) {
  now = now == null ? Date.now() : now;
  const start = new Date(pdsBusinessDayStart(now));
  const day = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  if (period === 'daily') return day;
  if (period === 'weekly') {
    const d = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
    const wd = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - wd);
    const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
  }
  const h = new Date(now).getHours();
  return day + ((h >= 16 || h < 5) ? '-soir' : '-midi');
}
function pdsTablesInOrder(state, tables) {
  const zi = (z) => state.zones.findIndex(x => x.id === z);
  return (tables || state.tables).slice().sort((a, b) =>
    (zi(a.zone) - zi(b.zone)) || String(a.num).localeCompare(String(b.num), undefined, { numeric: true }));
}
/* The zone a server mostly works in, from the tables they hold. */
function pdsHomeZones(state, tables) {
  const out = {};
  state.staff.forEach(sv => {
    const count = {};
    tables.forEach(t => { if (pdsServerIds(t).includes(sv.id)) count[t.zone] = (count[t.zone] || 0) + 1; });
    let best = null, n = 0;
    Object.keys(count).forEach(z => { if (count[z] > n) { n = count[z]; best = z; } });
    out[sv.id] = best;
  });
  return out;
}
/* One rotation step, on a COPY of the tables. Returns {tableId: [serverIds]}. */
function pdsRotateStep(state, tables, strategy, pairs) {
  const ids = state.staff.map(x => x.id);
  const ordered = pdsTablesInOrder(state, tables);
  const next = {};
  ordered.forEach(t => { next[t.id] = pdsServerIds(t); });
  if (ids.length < 2 && strategy !== 'pairs') return next;
  if (strategy === 'pairs') {
    const swap = {};
    (pairs || []).forEach(p => { if (p && p[0] && p[1] && p[0] !== p[1]) { swap[p[0]] = p[1]; swap[p[1]] = p[0]; } });
    ordered.forEach(t => { next[t.id] = pdsServerIds(t).map(id => swap[id] || id); });
    return next;
  }
  if (strategy === 'tables') {
    ordered.forEach((t, i) => {
      const cur = pdsServerIds(t)[0];
      const at = ids.indexOf(cur);
      next[t.id] = [ids[at >= 0 ? (at + 1) % ids.length : i % ids.length]];
    });
    return next;
  }
  /* zones: the room is a ring of seats, one per server, each zone holding
     seats in proportion to its tables (12 in the salle, 5 at the bar: the
     salle needs more hands). Servers sit on the ring in their current
     order, and every rotation moves everyone the same number of seats, a
     step coprime with the head count, so over a full cycle each server
     passes through every zone for its share of the time. Inside a zone
     each server takes a run of neighbouring tables, not every third one.
     With more zones than servers, an unstaffed zone goes to whoever holds
     the fewest tables. */
  const zones = state.zones.filter(z => ordered.some(t => t.zone === z.id)).map(z => z.id);
  if (!zones.length) return next;
  const n = ids.length;
  const nOf = {};
  zones.forEach(z => { nOf[z] = ordered.filter(t => t.zone === z).length; });
  const floor = n >= zones.length ? 1 : 0;
  const target = {};
  zones.forEach(z => { target[z] = Math.max(floor, Math.round(nOf[z] / ordered.length * n)); });
  const ratio = (z) => nOf[z] / Math.max(target[z], 0.0001);
  let sum = zones.reduce((a, z) => a + target[z], 0);
  while (sum > n) {
    const z = zones.filter(x => target[x] > floor).sort((a, b) => ratio(a) - ratio(b))[0];
    if (!z) break;
    target[z] -= 1; sum -= 1;
  }
  while (sum < n) {
    const z = zones.slice().sort((a, b) => ratio(b) - ratio(a))[0];
    target[z] += 1; sum += 1;
  }
  const slots = [];
  zones.forEach(z => { for (let k = 0; k < target[z]; k++) slots.push(z); });
  /* Where each server sits now: their zone, then their first table. */
  const home = pdsHomeZones(state, ordered);
  const firstAt = {};
  ordered.forEach((t, i) => pdsServerIds(t).forEach(id => { if (firstAt[id] == null) firstAt[id] = i; }));
  const ring = ids.slice().sort((a, b) => {
    const za = zones.indexOf(home[a]), zb = zones.indexOf(home[b]);
    return (za < 0 ? 1e6 : za) - (zb < 0 ? 1e6 : zb) || (firstAt[a] ?? 1e6) - (firstAt[b] ?? 1e6) || ids.indexOf(a) - ids.indexOf(b);
  });
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  let step = Math.max(1, Math.ceil(n / zones.length));
  while (n > 1 && gcd(step, n) !== 1) step += 1;
  const onZone = {};
  zones.forEach(z => { onZone[z] = []; });
  const seated = new Array(slots.length);
  ring.forEach((sid, p) => { if (slots.length) seated[(p + step) % slots.length] = sid; });
  seated.forEach((sid, k) => { if (sid != null) onZone[slots[k]].push(sid); });
  const load = {};
  ids.forEach(id => { load[id] = 0; });
  zones.forEach(z => {
    const ts = ordered.filter(t => t.zone === z);
    const crew = onZone[z];
    ts.forEach((t, i) => {
      const sid = crew.length
        ? crew[Math.min(crew.length - 1, Math.floor(i * crew.length / ts.length))]
        : ids.slice().sort((a, b) => load[a] - load[b])[0];
      load[sid] += 1;
      next[t.id] = [sid];
    });
  });
  return next;
}
function pdsApplyAssignment(state, map) {
  state.tables.forEach(t => { if (map[t.id]) pdsSetServerIds(t, map[t.id]); });
}
function pdsRecordRotation(state, key) {
  const home = pdsHomeZones(state, state.tables);
  state.history = (state.history || []).filter(h => h && h.at);   /* drop the seeded demo week */
  state.history.push({ at: Date.now(), key: key || '', servers: home });
  if (state.history.length > 14) state.history = state.history.slice(-14);
}
function pdsAutoRotate(state) {
  const r = state && state.rotation;
  if (!r || !r.enabled || !r.auto) return false;
  if (r.strategy !== 'pairs' && state.staff.length < 2) return false;
  const key = pdsRotationKey(r.period);
  if (!r.lastKey) { r.lastKey = key; return true; }   /* arm, never rotate on the day it is switched on */
  if (r.lastKey === key) return false;
  pdsApplyAssignment(state, pdsRotateStep(state, state.tables, r.strategy, r.pairs));
  pdsRecordRotation(state, key);
  r.lastKey = key; r.lastAt = Date.now();
  state._autoRotated = true;
  return true;
}
function pdsRotationPreview(state, count) {
  const r = state.rotation || {};
  let tables = JSON.parse(JSON.stringify(state.tables));
  const steps = [];
  for (let i = 0; i < count; i++) {
    const map = pdsRotateStep(state, tables, r.strategy, r.pairs);
    tables.forEach(t => pdsSetServerIds(t, map[t.id] || []));
    const home = pdsHomeZones(state, tables);
    const tablesOf = {};
    state.staff.forEach(sv => { tablesOf[sv.id] = pdsTablesInOrder(state, tables).filter(t => pdsServerIds(t).includes(sv.id)).map(pdsTableNum); });
    steps.push({ home, tablesOf });
  }
  return steps;
}
/* Fairness: of the zones a server could work, how many did they actually
   see over the recorded rotations, and did one zone hog their week. Needs
   real history — two rotations at least — or it says so. */
function pdsFairness(state) {
  const fair = {};
  const history = (state.history || []).filter(h => h && h.at);
  if (history.length < 2) return null;
  const zoneIds = state.zones.filter(z => state.tables.some(t => t.zone === z.id)).map(z => z.id);
  state.staff.forEach(sv => {
    const count = {};
    history.forEach(h => { const z = h.servers && h.servers[sv.id]; if (z) count[z] = (count[z] || 0) + 1; });
    const seen = Object.keys(count).length;
    const total = Object.values(count).reduce((a, b) => a + b, 0);
    if (!total) { fair[sv.id] = null; return; }
    const uniqueRatio = zoneIds.length ? Math.min(1, seen / Math.min(zoneIds.length, total)) : 1;
    const maxRatio = Math.max(...Object.values(count)) / total;
    const score = Math.max(0, Math.min(100, Math.round(uniqueRatio * 70 + (1 - maxRatio) * 30)));
    let hot = null;
    Object.entries(count).forEach(([z, c]) => { if (total >= 3 && c / total >= 0.6) hot = z; });
    fair[sv.id] = { score, hot };
  });
  return fair;
}
function pdsPeriodLabel(T, period) {
  return period === 'daily' ? T.rotateDaily : period === 'weekly' ? T.rotateWeekly : T.rotateShift;
}
function pdsRenderRotateStage(state, T) {
  const rot = state.rotation || { period: 'shift', strategy: 'zones' };
  const zoneName = (id) => (state.zones.find(z => z.id === id) || {}).name || '·';
  const strategyLabel = rot.strategy === 'zones' ? T.rotZones : rot.strategy === 'tables' ? T.rotTables : T.rotPairs;
  const enough = rot.strategy === 'pairs' ? (rot.pairs || []).length > 0 : state.staff.length >= 2;
  const preview = enough ? pdsRotationPreview(state, 3) : [];
  const fairness = pdsFairness(state);
  const history = (state.history || []).filter(h => h && h.at).slice(-7);
  const autoTxt = rot.auto
    ? T.rotateAuto(rot.period === 'daily' ? T.rotateAutoDaily : rot.period === 'weekly' ? T.rotateAutoWeekly : T.rotateAutoShift)
    : T.rotateOff;
  const fmt = (ts) => { const d = new Date(ts); return `${d.toLocaleDateString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ${pdsClock(ts)}`; };
  const zoneTag = (z) => 'abcdefgh'.charAt(Math.max(0, state.zones.findIndex(x => x.id === z)) % 8) || 'd';
  return `
    <div class="pds-rotate">
      <div class="pds-rotate-grid">
        <div class="pds-rail-card">
          <div class="pds-rail-title">${T.rotateTitle}</div>
          <div class="pds-rail-hint">${pdsEsc(T.rotateDesc)}</div>
          <div class="pds-rot-meta">
            <div><span class="pds-rot-lbl">${T.rotatePeriod}</span><span class="pds-rot-val">${pdsEsc(pdsPeriodLabel(T, rot.period))}</span></div>
            <div><span class="pds-rot-lbl">${T.rotateStrategy}</span><span class="pds-rot-val">${pdsEsc(strategyLabel)}</span></div>
          </div>
          <p class="pds-rot-auto${rot.auto ? ' on' : ''}">${pdsEsc(autoTxt)}</p>
          <p class="pds-rail-hint">${pdsEsc(rot.lastAt ? T.rotateLast(fmt(rot.lastAt)) : T.rotateNever)}</p>
          <div class="pds-rot-actions">
            <button class="kb atlas" data-pds-action="rotate-configure">${T.rotateCTA}</button>
            <button class="kb ghost" data-pds-action="rotate-now"${enough ? '' : ' disabled'}>${T.rotNow}</button>
          </div>
          ${enough ? '' : `<p class="pds-rail-hint">${pdsEsc(rot.strategy === 'pairs' ? T.rotPairsNone : T.rotNeedStaff)}</p>`}
        </div>
        <div class="pds-rail-card">
          <div class="pds-rail-title">${T.rotPreview}</div>
          <div class="pds-rail-hint">${pdsEsc(rot.strategy === 'zones' ? T.rotZonesDesc : rot.strategy === 'tables' ? T.rotTablesDesc : T.rotPairsDesc)}</div>
          <div class="pds-rot-preview">
            ${preview.map((step, idx) => `
              <div class="pds-rot-step">
                <div class="pds-rot-step-h">+${idx + 1}</div>
                ${state.staff.slice(0, 8).map(sv => `<div class="pds-rot-line" style="--chip:${pdsEsc(sv.color)};">
                    <span class="pds-asum-dot"></span>
                    <b>${pdsEsc(String(sv.name).split(' ')[0])}</b>
                    <em>${pdsEsc(rot.strategy === 'zones' ? zoneName(step.home[sv.id]) : (step.tablesOf[sv.id] || []).slice(0, 4).join(' · ') || '·')}</em>
                  </div>`).join('')}
              </div>`).join('')}
          </div>
        </div>
        <div class="pds-rail-card">
          <div class="pds-rail-title">${T.rotFairness}</div>
          ${fairness ? `
          <div class="pds-rail-hint">${T.rotHistoryHint}</div>
          <div class="pds-fair">
            ${state.staff.slice(0, 8).map(sv => {
              const f = fairness[sv.id];
              if (!f) return '';
              const cls = f.score >= 70 ? 'high' : f.score >= 50 ? 'mid' : 'low';
              return `
                <div class="pds-fair-row" style="--chip:${pdsEsc(sv.color)};">
                  <span class="pds-asum-dot"></span>
                  <span class="pds-fair-name">${pdsEsc(String(sv.name).split(' ')[0])}</span>
                  <span class="pds-fair-bar"><i class="pds-fair-${cls}" style="width:${f.score}%;"></i></span>
                  <span class="pds-fair-pct">${f.score}%</span>
                </div>
                <div class="pds-fair-note">${f.hot ? `<b>${pdsEsc(zoneName(f.hot))}</b> · ${T.fairnessLow}` : T.fairnessHigh}</div>`;
            }).join('')}
          </div>` : `<p class="pds-rail-hint">${pdsEsc(T.fairnessEmpty)}</p>`}
        </div>
      </div>
      <div class="pds-rail-card pds-rot-history">
        <div class="pds-rail-title">${T.rotHistoryTitle}</div>
        ${history.length ? `
        <div class="pds-history-grid" style="--cols:${history.length};">
          <div class="pds-hist-h">
            <span></span>
            ${history.map(h => `<span title="${pdsEsc(fmt(h.at))}">${pdsEsc(new Date(h.at).toLocaleDateString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'short' }))}</span>`).join('')}
          </div>
          ${state.staff.slice(0, 8).map(sv => `
            <div class="pds-hist-row" style="--chip:${pdsEsc(sv.color)};">
              <span class="pds-hist-name"><span class="pds-asum-dot"></span>${pdsEsc(String(sv.name).split(' ')[0])}</span>
              ${history.map(h => {
                const z = h.servers && h.servers[sv.id];
                const zname = z ? zoneName(z) : '·';
                return `<span class="pds-hist-cell pds-hist-${z ? zoneTag(z) : 'd'}" title="${pdsEsc(zname)}">${pdsEsc(zname.slice(0, 1))}</span>`;
              }).join('')}
            </div>`).join('')}
        </div>` : `<p class="pds-rail-hint">${pdsEsc(T.rotHistoryEmpty)}</p>`}
      </div>
    </div>
  `;
}

/* What the old footer bar carried, in the page's own toolbar: Versions and
   Exporter in reach, the rarer tools (renuméroter, assistant, scan, réinitia-
   liser) behind Plus. Autosave needs no button and no banner. */
function pdsRenderActions(state, T) {
  const nv = pdsVersions(state).length;
  const dups = pdsDuplicateNums(state).length;
  return `
    <button class="kb ghost pds-act" data-pds-action="versions">${pdsEsc(T.versions)}${nv ? ` <span class="pds-count">${nv}</span>` : ''}</button>
    <details class="pds-more" data-pds-more>
      <summary class="kb ghost pds-act" aria-label="${pdsEsc(T.more)}">${pdsEsc(T.more)}${dups ? '<i class="pds-more-dot" aria-hidden="true"></i>' : ''}</summary>
      <div class="pds-more-pop" role="menu">
        <button role="menuitem" data-pds-action="renumber">${pdsEsc(T.renumber)}${dups ? `<em>${pdsEsc(T.dupShort(dups))}</em>` : ''}</button>
        <button role="menuitem" data-pds-action="open-wizard">${pdsEsc(T.wizTitle)}</button>
        <button role="menuitem" data-pds-action="scan-salle">${pdsEsc(T.scanSalle)}</button>
        <button role="menuitem" class="is-danger" data-pds-action="reset">${pdsEsc(T.reset)}</button>
      </div>
    </details>
    <button data-activation=money class="kb primary pds-act" data-pds-action="export">${pdsEsc(T.export)}</button>`;
}

/* The page head's context line, split on « · » into the same dotted spans
   appPage() draws, and only rewritten when the words change (the live room
   repaints every eight seconds). */
function pdsSetSubtitle(root, text) {
  const p = root.querySelector('.genpage-head p');
  if (!p || p.getAttribute('data-pds-sub') === text) return;
  p.setAttribute('data-pds-sub', text);
  p.textContent = '';
  String(text).split(' · ').forEach((seg, i) => {
    if (i) { const d = document.createElement('i'); d.className = 'dot'; d.setAttribute('aria-hidden', 'true'); p.appendChild(d); }
    const sp = document.createElement('span'); sp.className = 'seg'; sp.textContent = seg; p.appendChild(sp);
  });
}

/* ═══ INTERACTIVITY ═════════════════════════════════════════════════ */
/* Keep keyboard focus on the equivalent control when a panel is repainted. */
function pdsRememberFocus(root) {
  const el = document.activeElement;
  if (!el || !root.contains(el)) return () => {};
  const attrs = [...el.attributes].filter(a => /^(data-pds-|data-pdsp-|name$|type$)/.test(a.name) && !/wired|sig/.test(a.name));
  const sel = el.tagName + attrs.map(a => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
  const i = [...root.querySelectorAll(sel)].indexOf(el);
  return () => { if (!el.isConnected) root.querySelectorAll(sel)[i]?.focus(); };
}
function pdsAttach(root, state, T, dr) {
  /* La vue nuit est une classe sur la racine du tiroir : tout le squelette
     pds- en hérite, et la bascule ne re-rend que le corps. */
  root.classList.toggle('pds-noir', pdsNoir());
  /* Re-renders body + foot in-place, then re-binds events. Used after
   * every state mutation. */
  const refresh = () => {
    const restoreFocus = pdsRememberFocus(root);
    pdsExpireReservations(state);
    const body = root.querySelector('[data-pds-body]');
    /* A full re-render keeps the merchant where they were in the page and
       in a zoomed room, instead of snapping both back to the top. */
    const keepY = window.scrollY;
    const cv = root.querySelector('[data-pds-backdrop]');
    const keepX = cv ? [cv.scrollLeft, cv.scrollTop] : null;
    if (body) body.innerHTML = pdsRenderBody(state, T);
    pdsSetSubtitle(root, pdsSubtitle(state, T));
    if (Math.abs(window.scrollY - keepY) > 1) window.scrollTo({ top: keepY });
    const cv2 = root.querySelector('[data-pds-backdrop]');
    if (cv2 && keepX) { cv2.scrollLeft = keepX[0]; cv2.scrollTop = keepX[1]; }
    /* The inspector lives in the body, so a full render empties it while the
       handles still say something is selected (a zoom, a filter). Keep it on
       the selection, without scrolling the page to it. */
    [...selection].forEach(id => { if (!pdsFind(state, id)) selection.delete(id); });
    const insp = root.querySelector('[data-pds-inspector]');
    if (insp && selection.size === 1) insp.innerHTML = pdsRenderInspector(state, T, pdsFind(state, [...selection][0]).o);
    else if (insp && selection.size > 1) insp.innerHTML = pdsRenderBulkInspector(state, T, [...selection]);
    bind();
    restoreFocus();
    pdsMeasureChrome(root);
    try { pdsSave(state); } catch (_) {} /* auto-save every change per store — a design is never lost */
    pdsUndoPersist();
  };

  /* ── Selection store ──────────────────────────────────────────────
   * The renderer needs to know what is selected in order to draw resize
   * handles on it, so the Set is shared with module scope rather than
   * copied — one Set, two readers. */
  PDS_SEL.clear();
  const selection = PDS_SEL;
  /* L'historique d'annulation survit à la fermeture de la page pendant la
     session de l'onglet : refermer le plan par erreur ne perd plus les
     quarante derniers gestes. Il est rangé par plan (pdsKey), jamais
     partagé entre deux magasins. */
  pdsUndoRestore();

  /* ── Event bindings ───────────────────────────────────────────── */
  const bind = () => {
    root.querySelectorAll('input,select,textarea').forEach(el => {
      if (el.getAttribute('aria-label') || [...(el.labels || [])].some(l => l.textContent.trim())) return;
      const row = el.closest('.pds-form-row,.pds-room-row');
      const label = row?.querySelector('label')?.textContent.trim() || el.closest('[title]')?.title;
      if (label) el.setAttribute('aria-label', label);
      if (el.type === 'color' && el.closest('.pds-sw-custom')) {
        const sw = el.closest('.pds-sw-custom');
        el.tabIndex = -1; sw.tabIndex = 0; sw.setAttribute('role', 'button'); sw.setAttribute('aria-label', label || T.customColor);
        sw.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (el.showPicker) el.showPicker(); else el.click(); } };
      }
    });
    root.querySelectorAll('details[data-pds-fold]').forEach(d => {
      d.ontoggle = () => { PDS_FOLD[d.getAttribute('data-pds-fold')] = d.open; };
    });
    /* Mode switcher */
    root.querySelectorAll('[data-pds-mode]').forEach(btn => {
      btn.onclick = () => {
        const m = btn.getAttribute('data-pds-mode');
        if (state.mode === m) return;
        state.mode = m;
        selection.clear();
        refresh();
      };
    });

    /* Zone tabs */
    root.querySelectorAll('[data-pds-zone]').forEach(btn => {
      btn.onclick = () => {
        const z = btn.getAttribute('data-pds-zone');
        if (state.activeZone === z) return;
        state.activeZone = z;
        selection.clear();
        refresh();
      };
    });

    /* Snap toggle */
    const snap = root.querySelector('[data-pds-snap]');
    if (snap) snap.onchange = () => { state.snap = snap.checked; refresh(); };

    /* Action delegation */
    root.querySelectorAll('[data-pds-action]').forEach(btn => {
      btn.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const action = btn.getAttribute('data-pds-action');
        btn.closest('details[data-pds-more]')?.removeAttribute('open');
        const returnId = action === 'deselect' ? [...selection][0] : null;
        pdsHandleAction(action, btn, state, T, root, dr, refresh, selection);
        if (returnId) root.querySelector(`[data-pds-table="${CSS.escape(returnId)}"],[data-pds-el="${CSS.escape(returnId)}"]`)?.focus();
      };
    });

    /* Table click / drag (Layout + Assign) */
    if (state.mode !== 'rotate') {
      root.querySelectorAll('[data-pds-table]').forEach(el => {
        const id = el.getAttribute('data-pds-table');
        /* bind() also runs when only the inspector is redrawn, while these
         * stage nodes survive. Wire each surviving node once: otherwise the
         * Shift toggle and drag-finish closures replay in a stack. A full
         * refresh creates fresh nodes without this marker and wires normally. */
        if (el.getAttribute('data-pds-drag-wired') !== '1') {
          el.setAttribute('data-pds-drag-wired', '1');
          pdsAttachDrag(el, id, state, T, root, refresh, selection);
        }
        el.onclick = (ev) => {
          if (ev.detail === 0) return; /* keyboard-triggered click without coords */
        };
      });
      /* Fixtures are selectable now, not just draggable. Selecting one is what
         opens the inspector that can resize, recolour or delete it — the
         capability that did not exist while they were scene artwork. */
      root.querySelectorAll('[data-pds-el]').forEach(el => {
        const id = el.getAttribute('data-pds-el');
        if (el.getAttribute('data-pds-drag-wired') !== '1') {
          el.setAttribute('data-pds-drag-wired', '1');
          pdsAttachElDrag(el, id, state, T, root, refresh);
        }
        el.onclick = (ev) => {
          ev.stopPropagation();
          if (state.mode !== 'layout') return;
          selection.clear();
          selection.add(id);
          refresh();
          setTimeout(() => openInspector(id), 0);
        };
      });
      pdsAttachResize(root, state, T, refresh, selection);
      /* Assign mode — wire chip drop */
      if (state.mode === 'assign') {
        root.querySelectorAll('[data-pds-chip]').forEach(chip => {
          pdsAttachChipDrag(chip, chip.getAttribute('data-pds-chip'), state, T, root, refresh);
        });
      }
    }

    /* Inspector inputs — resolved through the inspector's own id rather than
       by hunting for a `.is-selected` table in the DOM, so the exact same
       code edits a comptoir, a kitchen or a table. */
    const inspectEl = root.querySelector('[data-pds-inspect-id]');
    const selId = inspectEl ? inspectEl.getAttribute('data-pds-inspect-id') : null;
    const found = selId ? pdsFind(state, selId) : null;
    const reselect = () => {
      refresh();
      setTimeout(() => openInspector(selId), 0);
    };
    if (found) {
      const o = found.o;
      root.querySelectorAll('[data-pds-field]').forEach(input => {
        if (!input.closest('.pds-inspect')) return;
        const f = input.getAttribute('data-pds-field');

        /* Material swatches are buttons, not inputs. */
        if (input.tagName === 'BUTTON') {
          input.onclick = () => {
            pdsPush(state);
            o.color = input.getAttribute('data-pds-val');
            /* A token from the palette is not a hand-mixed colour, so it
               stays fair game for the next ambiance. */
            delete o.colorLock;
            reselect();
          };
          return;
        }

        /* Free colour picker on this one object. */
        if (f === 'color' && input.type === 'color') {
          input.oninput = () => {
            const cc = pdsSafeColor(input.value);
            o.color = cc; o.colorLock = 1;
            pdsRepaintCell(root, state, T, o.id, refresh, selection);
          };
          input.onchange = () => { pdsPush(state); o.color = pdsSafeColor(input.value); o.colorLock = 1; reselect(); };
          return;
        }

        const commit = () => {
          const v = input.value;
          pdsPush(state);
          const plane = pdsPlaneOf(state);
          const K = (found.table ? PDS_TABLE_TYPES[o.type] : PDS_FIX[o.type]) || {};
          if (f === 'num')        o.num = v.trim() || o.num;
          else if (f === 'label') o.label = v;
          else if (f === 'notes') o.notes = v;
          else if (f === 'server') pdsSetServerIds(o, v ? [v] : []);
          else if (f === 'reservationName') {
            o.reservationName = v.trim();
            if (!o.reservationName) delete o.reservationName;
            if (o.group) pdsSyncGroupService(state, o.group, o);
          }
          else if (f === 'reservationTime') {
            if (/^\d{2}:\d{2}$/.test(v)) {
              o.reservationTime = v;
              o.reservationDate = pdsTodayKey();
            } else {
              delete o.reservationTime;
              delete o.reservationDate;
            }
            if (o.group) pdsSyncGroupService(state, o.group, o);
          }
          else if (f === 'type') {
            /* Changing the type re-seeds geometry, otherwise a 2-top turned
               into a 10-top keeps the 2-top's footprint and the seats have
               nowhere to go. */
            const cfg = PDS_TABLE_TYPES[v];
            if (cfg) { o.type = v; o.w = cfg.w; o.h = cfg.h; o.seats = cfg.seats; o.shape = cfg.shape; }
          }
          else if (f === 'seats') o.seats = Math.max(0, Math.min(24, Math.round(+v || 0)));
          else if (f === 'w')     o.w = Math.max(K.minW || 16, Math.min(plane.w, Math.round(+v || 0)));
          else if (f === 'h')     o.h = Math.max(K.minH || 16, Math.min(plane.h, Math.round(+v || 0)));
          else if (f === 'x')     o.x = Math.max(0, Math.min(plane.w - pdsGeom(o).w, Math.round(+v || 0)));
          else if (f === 'y')     o.y = Math.max(0, Math.min(plane.h - pdsGeom(o).h, Math.round(+v || 0)));
          else if (f === 'rot')   o.rot = ((Math.round(+v || 0)) % 360 + 360) % 360;
          /* Geometry edits repaint the one cell they touch. Rebuilding the
             whole drawer and reopening the inspector — what reselect() does —
             is what made typing a size feel like the panel flinched. */
          if (f === 'w' || f === 'h' || f === 'x' || f === 'y' || f === 'rot') {
            pdsRepaintCell(root, state, T, o.id, refresh, selection);
            pdsSyncInspector(root, o);
          } else {
            reselect();
          }
        };
        if (f === 'reservationName' || f === 'reservationTime') {
          /* Text insertion APIs and some mobile keyboards can update the
           * control without delivering change until much later. Blur is the
           * reliable commit boundary; guard it so a normal change+blur pair
           * still records exactly one undo snapshot. */
          let committedValue = input.value;
          const commitReservation = () => {
            if (input.value === committedValue) return;
            committedValue = input.value;
            commit();
          };
          input.onchange = commitReservation;
          input.onblur = commitReservation;
        } else {
          input.onchange = commit;
        }

        /* The rotation dial previews as you drag it; the commit lands on
           change. Without this the dial only moved the table on release,
           which is the same complaint as the rotate handle. */
        if (f === 'rot' && input.type === 'range') {
          input.oninput = () => {
            const deg = ((Math.round(+input.value || 0)) % 360 + 360) % 360;
            o.rot = deg;
            const cell = root.querySelector(`[data-pds-table="${o.id}"], [data-pds-el="${o.id}"]`);
            if (cell) cell.style.transform = `rotate(${deg}deg)`;
            root.querySelectorAll('[data-pds-field="rot"]').forEach(n => {
              if (n !== input) n.value = deg;
            });
            const out = root.querySelector('[data-pds-rotout]');
            if (out) out.textContent = `${deg}°`;
          };
        }
      });

      root.querySelectorAll('[data-pds-server-slot]').forEach(input => {
        input.onchange = () => {
          const found = pdsFind(state, input.closest('[data-pds-inspect-id]')?.getAttribute('data-pds-inspect-id'));
          if (!found || !found.table) return;
          const table = found.o;
          const slot = Math.max(0, Math.min(PDS_MAX_TABLE_SERVERS - 1, Number(input.getAttribute('data-pds-server-slot')) || 0));
          const ids = pdsServerIds(table);
          ids[slot] = input.value || '';
          pdsPush(state);
          pdsSetServerIds(table, ids);
          refresh();
          setTimeout(() => state._openInspector(table.id), 0);
        };
      });

      /* Status pill row inside inspector */
      root.querySelectorAll('[data-pds-status]').forEach(btn => {
        if (btn.getAttribute('data-pds-action')) return; /* handled elsewhere */
        btn.onclick = () => {
          if (!found.table) return;
          pdsPush(state);
          /* L'heure d'assise nourrit la pastille « N min » de la vue nuit. */
          pdsSetStatus(o, btn.getAttribute('data-pds-status'));
          /* Une table groupée est UNE table pour le service : le statut
             s'applique au groupe entier, heure d'assise partagée. */
          if (o.group) pdsSyncGroupService(state, o.group, o);
          reselect();
        };
      });
    }

    /* Room panel — floor, walls, finish, dimensions of the active zone. */
    root.querySelectorAll('[data-pds-room-field]').forEach(ctl => {
      const f = ctl.getAttribute('data-pds-room-field');
      const apply = (val) => {
        const zone = state.zones.find(z => z.id === state.activeZone);
        if (!zone) return;
        pdsPush(state);
        zone.room = zone.room || {};
        if (f === 'w' || f === 'h') {
          zone.room[f] = Math.max(f === 'w' ? 240 : 200, Math.round(+val || 0));
          /* Shrinking the room must not strand furniture outside it. */
          const plane = pdsPlane(zone);
          const clamp = (o) => {
            const g = pdsGeom(o);
            o.x = Math.max(0, Math.min(plane.w - g.w, o.x));
            o.y = Math.max(0, Math.min(plane.h - g.h, o.y));
          };
          state.tables.filter(t => t.zone === zone.id).forEach(clamp);
          state.elements.filter(e => e.zone === zone.id).forEach(clamp);
        } else if (f === 'wallW') {
          zone.room.wallW = Math.max(0, Math.min(14, Math.round(+val || 0)));
        } else if (f === 'backdrop') {
          /* Empty string is a real choice — "no backdrop", back to paper. */
          zone.room.backdrop = val ? pdsSafeColor(val) : null;
        } else if (f === 'floor' || f === 'wall') {
          zone.room[f] = pdsSafeColor(val);
        } else {
          zone.room[f] = val;
        }
        refresh();
      };
      if (ctl.tagName === 'BUTTON') ctl.onclick = () => apply(ctl.getAttribute('data-pds-val'));
      else if (ctl.type === 'color') {
        /* Live-preview the surface as the picker moves; commit on change so
           one drag through the spectrum is one undo step, not forty. */
        ctl.oninput = () => {
          const c = pdsSafeColor(ctl.value);
          const el = f === 'backdrop' ? root.querySelector('[data-pds-backdrop]')
                   : f === 'floor'    ? root.querySelector('[data-pds-floor]') : null;
          if (f === 'wall') {
            const fl = root.querySelector('[data-pds-floor]');
            if (fl) fl.style.boxShadow = `inset 0 0 0 ${pdsRoom(zone).wallW}px ${c}`;
          } else if (el) {
            el.style.backgroundColor = c;
          }
        };
        ctl.onchange = () => apply(ctl.value);
      }
      else ctl.onchange = () => apply(ctl.value);
    });

    /* Legend = filter. Heat-map switch. « En ce moment » rows jump to the
       table, switching zone if it lives elsewhere. */
    root.querySelectorAll('[data-pds-filter]').forEach(b => {
      b.onclick = () => {
        const st = b.getAttribute('data-pds-filter');
        if (!st) PDS_FILTER.clear();
        else if (PDS_FILTER.has(st)) PDS_FILTER.delete(st);
        else PDS_FILTER.add(st);
        refresh();
      };
    });
    root.querySelectorAll('[data-pds-heat]').forEach(b => {
      b.onclick = () => { PDS_HEAT = b.getAttribute('data-pds-heat') || 'status'; refresh(); };
    });
    root.querySelectorAll('[data-pds-goto]').forEach(b => {
      b.onclick = () => {
        const t = state.tables.find(x => x.id === b.getAttribute('data-pds-goto'));
        if (!t) return;
        if (state.mode === 'rotate') state.mode = 'layout';
        state.activeZone = t.zone;
        selection.clear(); selection.add(t.id);
        refresh();
        setTimeout(() => {
          openInspector(t.id);
          const cell = root.querySelector(`[data-pds-table="${CSS.escape(t.id)}"]`);
          if (cell) { cell.classList.add('pds-flash'); setTimeout(() => cell.classList.remove('pds-flash'), 1400); }
        }, 0);
      };
    });

    /* Empty floor: a click clears the selection, a drag draws a selection
       frame (Shift / ⌘ adds to what is already selected). */
    const canvas = root.querySelector('[data-pds-canvas]');
    if (canvas) {
      canvas.onpointerdown = (ev) => {
        if (ev.button !== 0 || ev.target !== canvas || state.mode === 'rotate') return;
        if (root.classList.contains('is-panning')) return;
        const rect = canvas.getBoundingClientRect();
        const k = rect.width / (canvas.offsetWidth || 1);
        const x0 = (ev.clientX - rect.left) / k, y0 = (ev.clientY - rect.top) / k;
        const box = root.querySelector('[data-pds-marquee]');
        const additive = ev.shiftKey || ev.metaKey || ev.ctrlKey;
        const base = additive ? new Set(selection) : new Set();
        let moved = false, hit = base;
        try { canvas.setPointerCapture(ev.pointerId); } catch (_) {}
        const move = (e) => {
          const x1 = (e.clientX - rect.left) / k, y1 = (e.clientY - rect.top) / k;
          if (!moved && Math.abs(e.clientX - ev.clientX) + Math.abs(e.clientY - ev.clientY) < 5) return;
          moved = true;
          const L = Math.min(x0, x1), Tp = Math.min(y0, y1), W = Math.abs(x1 - x0), H = Math.abs(y1 - y0);
          if (box) { box.hidden = false; box.style.cssText = `left:${L}px;top:${Tp}px;width:${W}px;height:${H}px;`; }
          hit = new Set(base);
          state.tables.filter(t => t.zone === state.activeZone).forEach(t => {
            const g = pdsGeom(t);
            if (t.x < L + W && t.x + g.w > L && t.y < Tp + H && t.y + g.h > Tp) hit.add(t.id);
          });
          root.querySelectorAll('[data-pds-table]').forEach(n => n.classList.toggle('is-selected', hit.has(n.getAttribute('data-pds-table'))));
        };
        const up = () => {
          canvas.removeEventListener('pointermove', move);
          canvas.removeEventListener('pointerup', up);
          canvas.removeEventListener('pointercancel', up);
          if (box) box.hidden = true;
          if (!moved) {
            if (!selection.size || additive) return;
            selection.clear();
            refresh();
            return;
          }
          selection.clear();
          hit.forEach(id => selection.add(id));
          refresh();
          setTimeout(() => openBulkInspector(), 0);
        };
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
        ev.preventDefault();
      };
    }

    /* Zoom with ⌘/Ctrl + wheel (and the trackpad pinch, which arrives as a
       ctrl-wheel), and pan with Space + drag once the room is larger than its
       frame. */
    const backdrop = root.querySelector('[data-pds-backdrop]');
    if (backdrop) {
      backdrop.onwheel = (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        pdsZoomBy(root, state, e.deltaY < 0 ? 1.12 : 1 / 1.12);
        refresh();
      };
      if (backdrop.getAttribute('data-pds-pan-wired') !== '1') {
        backdrop.setAttribute('data-pds-pan-wired', '1');
        backdrop.addEventListener('pointerdown', (e) => {
          if (!root.classList.contains('is-panning')) return;
          e.preventDefault(); e.stopPropagation();
          const sx = e.clientX, sy = e.clientY, l0 = backdrop.scrollLeft, t0 = backdrop.scrollTop;
          try { backdrop.setPointerCapture(e.pointerId); } catch (_) {}
          const mv = (m) => { backdrop.scrollLeft = l0 - (m.clientX - sx); backdrop.scrollTop = t0 - (m.clientY - sy); };
          const end = () => { backdrop.removeEventListener('pointermove', mv); backdrop.removeEventListener('pointerup', end); backdrop.removeEventListener('pointercancel', end); };
          backdrop.addEventListener('pointermove', mv);
          backdrop.addEventListener('pointerup', end);
          backdrop.addEventListener('pointercancel', end);
        }, true);
      }
    }
  };

  /* Open inspector for any object id — table or fixture. */
  const openInspector = (id, opts) => {
    const restoreFocus = pdsRememberFocus(root);
    const f = pdsFind(state, id);
    const inspector = root.querySelector('[data-pds-inspector]');
    if (!inspector) return;
    if (!f) { inspector.innerHTML = pdsRenderInspectorEmpty(state, T); return; }
    inspector.innerHTML = pdsRenderInspector(state, T, f.o);
    bind();
    restoreFocus();
    /* Sous 1100px l'inspecteur passe sous le plan : sélectionner un objet
       ouvrait alors un panneau qu'on ne voyait pas. 'nearest' ne bouge rien
       quand il est déjà à l'écran, donc la colonne large ne saute pas.
       Sans 'smooth' : mesuré dans ce tiroir, l'animation ne défile pas d'un
       pixel là où le saut direct parcourt ses 561.
       Sur la page pleine, la colonne de droite dépasse l'écran : 'nearest'
       défilait alors de 300 px pour en montrer le bas. On ne bouge que si
       le haut de l'inspecteur est hors de vue. */
    if (opts && opts.reveal === false) return;
    try {
      const r = inspector.getBoundingClientRect();
      if (r.top > window.innerHeight - 120 || r.bottom < 0) {
        const top = parseFloat(getComputedStyle(root).getPropertyValue('--pds-top')) || 64;
        window.scrollBy(0, r.top - top - 12);
      }
    } catch (_) {}
  };
  /* Open bulk inspector */
  const openBulkInspector = () => {
    const inspector = root.querySelector('[data-pds-inspector]');
    if (!inspector) return;
    if (selection.size === 0) {
      inspector.innerHTML = pdsRenderInspectorEmpty(state, T);
    } else if (selection.size === 1) {
      const id = [...selection][0];
      openInspector(id);
      return;
    } else {
      inspector.innerHTML = pdsRenderBulkInspector(state, T, [...selection]);
    }
    bind();
  };

  /* Wire selection-aware methods onto state so action handlers can use them */
  state._openInspector = openInspector;
  state._openBulkInspector = openBulkInspector;
  state._selection = selection;
  state._refresh = refresh;
  state._rebind = () => bind();

  /* ── Keyboard ──────────────────────────────────────────────────────
   *   Escape   clears the selection (a second Escape closes the page)
   *   ⌘Z / ⇧⌘Z / ⌘Y   undo, redo
   *   arrows   nudge the selection (Shift ×10, one grid step when snapping)
   *   Delete   delete the selection          ⌘D  duplicate
   *   ⌘C / ⌘V  copy, paste into the zone     ⌘A  select every table
   *   Space    hold to pan a zoomed room
   *   Nothing fires while typing in a field or while a dialog sits on top. */
  const fake = (attrs) => ({ getAttribute: (k) => (k in attrs ? attrs[k] : null) });
  const topmost = () => {
    const layers = [...document.querySelectorAll('.kiwi-drawer, .kiwi-modal')].filter(n => n.isConnected && n.getClientRects().length);
    const top = layers[layers.length - 1];
    return !top || top === root || root.contains(top) || top.contains(root);
  };
  let lastNudge = 0;
  const nudge = (dx, dy) => {
    const ids = [...selection].filter(id => { const f = pdsFind(state, id); return f && !f.o.locked; });
    if (!ids.length) return;
    if (Date.now() - lastNudge > 700) pdsPush(state);
    lastNudge = Date.now();
    const plane = pdsPlaneOf(state);
    ids.forEach(id => {
      const f = pdsFind(state, id);
      const g = pdsGeom(f.o);
      f.o.x = Math.max(0, Math.min(plane.w - g.w, Math.round(f.o.x + dx)));
      f.o.y = Math.max(0, Math.min(plane.h - g.h, Math.round(f.o.y + dy)));
      pdsRepaintCell(root, state, T, id, refresh, selection);
      if (ids.length === 1) pdsSyncInspector(root, f.o);
    });
    /* Group envelopes follow on the next full paint. */
    clearTimeout(nudge._t);
    nudge._t = setTimeout(() => { refresh(); if (selection.size === 1) openInspector([...selection][0]); else openBulkInspector(); }, 500);
  };
  const deleteSelection = () => {
    const ids = [...selection];
    if (!ids.length) return;
    if (ids.length === 1) { pdsHandleAction('table-delete', fake({ 'data-pds-id': ids[0] }), state, T, root, dr, refresh, selection); return; }
    const els = ids.filter(id => state.elements.some(e => e.id === id));
    if (els.length) {
      pdsPush(state);
      if (typeof pdsBury === 'function') pdsBury(state, els);
      state.elements = state.elements.filter(e => !els.includes(e.id));
      els.forEach(id => selection.delete(id));
    }
    if (selection.size) pdsHandleAction('bulk-delete', fake({}), state, T, root, dr, refresh, selection);
    else refresh();
  };
  const copySelection = () => {
    const objs = [...selection].map(id => pdsFind(state, id)).filter(Boolean);
    if (!objs.length) return;
    PDS_CLIP = objs.map(f => ({ table: f.table, o: JSON.parse(JSON.stringify(f.o)) }));
    Kiwi.toast(T.copied(objs.length), { duration: 1200 });
  };
  const pasteClip = (offset) => {
    if (!PDS_CLIP || !PDS_CLIP.length) return;
    pdsPush(state);
    const plane = pdsPlaneOf(state);
    const used = new Set(state.tables.map(t => String(t.num)));
    let next = state.tables.reduce((m, t) => Math.max(m, parseInt(t.num, 10) || 0), 0);
    const maxZ = state.elements.reduce((m, e) => Math.max(m, e.z || 0), 0);
    selection.clear();
    PDS_CLIP.forEach(({ table, o }, i) => {
      const c = JSON.parse(JSON.stringify(o));
      const g = pdsGeom(c);
      c.zone = state.activeZone;
      c.x = Math.max(0, Math.min(plane.w - g.w, c.x + offset));
      c.y = Math.max(0, Math.min(plane.h - g.h, c.y + offset));
      delete c.group;
      if (table) {
        c.id = 'tbl' + Math.random().toString(36).slice(2, 8);
        /* A pasted table gets the next free number, never a duplicate. */
        if (used.has(String(c.num))) { do { next += 1; } while (used.has(String(next))); c.num = String(next); }
        used.add(String(c.num));
        pdsSetStatus(c, 'free');
        pdsSetServerIds(c, []);
        state.tables.push(c);
      } else {
        c.id = 'el' + Math.random().toString(36).slice(2, 8);
        c.z = maxZ + 1 + i;
        state.elements.push(c);
      }
      if (typeof pdsUnbury === 'function') pdsUnbury(state, c.id);
      selection.add(c.id);
    });
    refresh();
    setTimeout(() => (selection.size === 1 ? openInspector([...selection][0]) : openBulkInspector()), 0);
    Kiwi.toast(T.pasted(PDS_CLIP.length), { type: 'success', duration: 1200 });
  };
  const onKey = (ev) => {
    if (!root.isConnected || !topmost()) return;
    const tgt = ev.target;
    /* A field counts as typing only inside the plan: a focused input left
       behind the overlay (the lock screen's PIN box) must not eat ⌘Z. */
    const typing = tgt && root.contains(tgt) && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName));
    const mod = ev.metaKey || ev.ctrlKey;
    const cell = tgt?.closest('[data-pds-table],[data-pds-el]');
    if (cell && root.contains(cell) && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      const id = cell.getAttribute('data-pds-table') || cell.getAttribute('data-pds-el');
      if (state._groupPickFrom && cell.hasAttribute('data-pds-table')) {
        cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      } else if (ev.shiftKey) {
        if (selection.has(id)) selection.delete(id); else selection.add(id);
        refresh(); openBulkInspector();
      } else { selection.clear(); selection.add(id); refresh(); openInspector(id); }

      root.querySelector('[data-pds-inspector] button')?.focus();
      return;
    }
    if (ev.key === 'Escape') {
      if (selection.size === 0) return; /* let the drawer close itself */
      const id = [...selection][0];
      state._groupPickFrom = null;
      selection.clear();
      root.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected'));
      refresh();
      root.querySelector(`[data-pds-table="${CSS.escape(id)}"],[data-pds-el="${CSS.escape(id)}"]`)?.focus();
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
      return;
    }
    if (typing) return;
    const tab = tgt?.closest('[data-pds-mode],[data-pds-zone]');
    if (tab && ['ArrowLeft','ArrowRight','Home','End'].includes(ev.key)) {
      const tabs = [...tab.parentElement.querySelectorAll(tab.hasAttribute('data-pds-mode') ? '[data-pds-mode]' : '[data-pds-zone]')];
      const delta = (ev.key === 'ArrowRight' ? 1 : -1) * (trLang() === 'ar' ? -1 : 1);
      const i = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + delta + tabs.length) % tabs.length;
      ev.preventDefault(); tabs[i]?.focus(); return;
    }
    if (ev.code === 'Space' && !tgt?.closest('button,summary,[role=button]') && state.mode !== 'rotate' && PDS_ZOOM) {
      root.classList.add('is-panning'); ev.preventDefault(); return;
    }
    if (mod && (ev.key === 'z' || ev.key === 'Z')) {
      ev.preventDefault();
      pdsHandleAction(ev.shiftKey ? 'redo' : 'undo', fake({}), state, T, root, dr, refresh, selection);
      return;
    }
    if (mod && (ev.key === 'y' || ev.key === 'Y')) { ev.preventDefault(); pdsHandleAction('redo', fake({}), state, T, root, dr, refresh, selection); return; }
    if (state.mode !== 'layout') return;
    const step = ev.shiftKey ? 10 : (state.snap ? PDS_GRID : 1);
    if (ev.key === 'ArrowLeft')  { if (selection.size) { ev.preventDefault(); nudge(-step, 0); } return; }
    if (ev.key === 'ArrowRight') { if (selection.size) { ev.preventDefault(); nudge(step, 0); } return; }
    if (ev.key === 'ArrowUp')    { if (selection.size) { ev.preventDefault(); nudge(0, -step); } return; }
    if (ev.key === 'ArrowDown')  { if (selection.size) { ev.preventDefault(); nudge(0, step); } return; }
    if (ev.key === 'Delete' || ev.key === 'Backspace') { if (selection.size) { ev.preventDefault(); deleteSelection(); } return; }
    if (mod && (ev.key === 'd' || ev.key === 'D')) { if (selection.size) { ev.preventDefault(); copySelection(); pasteClip(24); } return; }
    if (mod && (ev.key === 'c' || ev.key === 'C')) { if (selection.size && !String(window.getSelection && window.getSelection())) { ev.preventDefault(); copySelection(); } return; }
    if (mod && (ev.key === 'v' || ev.key === 'V')) { if (PDS_CLIP) { ev.preventDefault(); pasteClip(24); } return; }
    if (mod && (ev.key === 'a' || ev.key === 'A')) {
      ev.preventDefault();
      selection.clear();
      state.tables.filter(t => t.zone === state.activeZone).forEach(t => selection.add(t.id));
      refresh();
      setTimeout(() => openBulkInspector(), 0);
    }
  };
  const onKeyUp = (ev) => { if (ev.code === 'Space') root.classList.remove('is-panning'); };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('keyup', onKeyUp, true);

  /* ── The live room ─────────────────────────────────────────────────
   *   A poll never rebuilds the page: only the tables whose signature
   *   changed are repainted, and never under a pointer or a focused field
   *   (CLAUDE.md §5 · « rendering under a poller »). */
  let busy = false, pendingLive = false;
  const repaintLive = () => {
    if (!root.isConnected) return;
    const ae = document.activeElement;
    if (busy || (ae && root.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName))) { pendingLive = true; return; }
    pendingLive = false;
    root.querySelectorAll('[data-pds-table]').forEach(old => {
      const t = state.tables.find(x => x.id === old.getAttribute('data-pds-table'));
      if (!t || old.getAttribute('data-pds-sig') === pdsSig(t)) return;
      const holder = document.createElement('div');
      holder.innerHTML = pdsRenderTable(t, state, T).trim();
      if (holder.firstElementChild) old.replaceWith(holder.firstElementChild);
    });
    const kp = root.querySelector('[data-pds-kpis]'); if (kp) kp.outerHTML = pdsKpis(state, T);
    const lg = root.querySelector('.pds-legend'); if (lg) lg.outerHTML = pdsRenderLegend(state, T);
    const ht = root.querySelector('.pds-heat'); if (ht) ht.outerHTML = pdsRenderHeatSwitch(T);
    root.querySelectorAll('[data-pds-live-badge]').forEach(b => { b.outerHTML = pdsLiveBadge(T); });
    const lp = root.querySelector('[data-pds-live-panel]');
    if (lp && !root.querySelector('[data-pds-inspect-id]') && !root.querySelector('.pds-inspector .pds-inspect')) lp.outerHTML = pdsRenderLivePanel(state, T);
    const fc = root.querySelector('[data-pds-floor-count]');
    if (fc) fc.textContent = pdsFloorCount(state.tables.filter(t => t.zone === state.activeZone), T);
    pdsSetSubtitle(root, pdsSubtitle(state, T));
    bind();
  };
  state._repaintLive = repaintLive;
  root.addEventListener('pointerdown', () => { busy = true; }, true);
  const release = () => { if (!busy) return; busy = false; if (pendingLive) setTimeout(repaintLive, 60); };
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  root.addEventListener('focusout', () => { if (pendingLive) setTimeout(repaintLive, 60); });
  const unwatch = window.KiwiFloorLive ? window.KiwiFloorLive.watch((d) => { PDS_LIVE = d; repaintLive(); }) : null;
  const onBookings = () => { pdsIndexBookings(state); repaintLive(); };
  window.addEventListener('kiwi-reservations-changed', onBookings);
  /* Seated timers move on their own; repaint the minute. */
  const tick = setInterval(repaintLive, 30000);

  if (state._autoRotated) {
    delete state._autoRotated;
    setTimeout(() => Kiwi.toast(T.rotAutoDone, { type: 'success', desc: T.rotAppliedDesc }), 300);
  }

  /* Tear everything down when the page goes: another destination replaces
     the host (appPage removes it) or the dashboard leaves the genpage shell.
     The plan is saved on the way out, as the old drawer did on close. */
  let alive = true;
  const teardown = () => {
    if (!alive) return;
    alive = false;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keyup', onKeyUp, true);
    document.removeEventListener('pointerup', release, true);
    document.removeEventListener('pointercancel', release, true);
    document.removeEventListener('pointerdown', closeMenus, true);
    window.removeEventListener('kiwi-reservations-changed', onBookings);
    window.removeEventListener('resize', onResize);
    clearInterval(tick);
    if (unwatch) unwatch();
    mo.disconnect();
    themeMo.disconnect();
    document.body.classList.remove('pds-dark-page');
    try { pdsSave(state); } catch (_) {}
    if (pdsLive === state) pdsLive = null;
  };
  const gone = () => !root.isConnected || (root.classList.contains('dash-genpage') && !document.body.classList.contains('page-genpage'));
  const mo = new MutationObserver(() => { if (gone()) teardown(); });
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  if (root.parentElement) mo.observe(root.parentElement, { childList: true });
  /* The Plus menu closes on any press outside it. */
  const closeMenus = (ev) => {
    root.querySelectorAll('details[data-pds-more][open]').forEach(d => { if (!d.contains(ev.target)) d.removeAttribute('open'); });
  };
  document.addEventListener('pointerdown', closeMenus, true);
  const onResize = () => pdsMeasureChrome(root);
  window.addEventListener('resize', onResize);
  document.body.classList.toggle('pds-dark-page', pdsNoir());
  /* Night or day follows <html data-theme>, whoever writes it: the topbar
     switch, the plan's own sun button, or fusion mode. */
  let wasNoir = pdsNoir();
  const themeMo = new MutationObserver(() => {
    const noir = pdsNoir();
    if (noir === wasNoir || !alive) return;
    wasNoir = noir;
    root.classList.toggle('pds-noir', noir);
    document.body.classList.toggle('pds-dark-page', noir);
    refresh();
  });
  themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  bind();
  pdsMeasureChrome(root);
}

/* The fitted room is as tall as the window allows: the drawer's own head and
   foot plus the canvas bars are measured, not guessed, so the whole room is
   on screen without scrolling the page. */
function pdsMeasureChrome(root) {
  const h = (sel) => { const n = root.querySelector(sel); return n ? n.getBoundingClientRect().height : 0; };
  /* In the dashboard frame the page scrolls under the top bar: the room fits
     between that bar and the window's foot once the KPIs have scrolled by. */
  const bar = document.querySelector('.topbar, .main > header, .dash-topbar');
  const top = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 64;
  const chrome = top + h('.pds-canvas-bar') + h('.pds-plan-footer') + 48;
  root.style.setProperty('--pds-chrome', Math.round(chrome) + 'px');
  root.style.setProperty('--pds-top', Math.round(top) + 'px');
}
function pdsZoomBy(root, state, factor) {
  const zone = state.zones.find(z => z.id === state.activeZone) || state.zones[0];
  const P = pdsPlane(zone);
  const room = root.querySelector('[data-pds-room]');
  const cur = PDS_ZOOM || ((room ? room.getBoundingClientRect().width : P.w) / P.w);
  PDS_ZOOM = Math.max(0.3, Math.min(3, Math.round(cur * factor * 100) / 100));
}
let PDS_CLIP = null;

/* ═══ STAGE SCALE ═══════════════════════════════════════════════════
 * The stage is authored once in logical units (${PDS_CANVAS_W}×${PDS_CANVAS_H},
 * 1 unit = 1 cm) and CSS scales it to fit the room (see .pds-plan-scale, which
 * derives the ratio from 100cqw). Everything downstream — drag deltas,
 * snapping, clamping — works in logical units and divides screen pixels by k,
 * so the maths never has to know how wide the window is.
 *
 * k is always MEASURED from the live box, never cached and never written by JS.
 * An earlier version set a --pds-k custom property from a ResizeObserver; at
 * 1024px the room was 712px while the property still read 0.968, and five
 * tables rendered outside the room. One source of truth only. */
function pdsK(root) {
  const scale = root && root.querySelector('[data-pds-scale]');
  if (!scale) return 1;
  /* Measured against the scale box's OWN layout width (the room's width in
     logical units), not PDS_CANVAS_W: a room the merchant resized to 1200 cm
     used to drag at 880/1200 of the cursor speed and land off target. */
  const k = scale.getBoundingClientRect().width / (scale.offsetWidth || PDS_CANVAS_W);
  return (isFinite(k) && k > 0.05) ? k : 1;
}

/* ═══ DRAG SYSTEM (pointer events, CSS transforms) ══════════════════ */
function pdsAttachDrag(el, id, state, T, root, refresh, selection) {
  let dragging = false;
  let startX, startY, origX, origY, transformX, transformY;
  let dragK = 1;
  let blockFrame = 0;
  let groupPeers = [];
  let groupOrig = {};
  let selectionOrig = {};
  const t = state.tables.find(tt => tt.id === id);
  if (!t) return;

  el.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    /* Mode « grouper » armé : le clic suivant lie les deux tables. Sur
     * soi-même, il annule. On sort avant toute logique de sélection ou de
     * drag — le refresh() reconstruit le DOM, donc plus rien à faire ici. */
    if (state._groupPickFrom) {
      ev.preventDefault();
      const fromId = state._groupPickFrom;
      state._groupPickFrom = null;
      const t = state.tables.find(tt => tt.id === id);
      if (fromId === id || !t) {
        toast(T.groupPickCancel, { duration: 1400 });
        refresh();
        setTimeout(() => state._openInspector(id), 0);
        return;
      }
      const from = state.tables.find(tt => tt.id === fromId);
      if (!from) { refresh(); return; }
      pdsPush(state);
      const serviceAnchor = from.group ? from : (t.group ? t : from);
      if (from.group && t.group && from.group !== t.group) {
        /* Deux groupes existants fusionnent : la cible rejoint le premier. */
        const old = t.group;
        state.tables.forEach(tt => { if (tt.group === old) tt.group = from.group; });
      } else {
        const gid = from.group || t.group || ('grp' + Date.now().toString(36));
        from.group = gid; t.group = gid;
      }
      pdsSyncGroupService(state, from.group || t.group, serviceAnchor);
      selection.clear();
      selection.add(id);
      refresh();
      const disp = (n) => /^\d$/.test(String(n)) ? '0' + n : n;
      const grouped = state.tables.filter(tt => tt.group && tt.group === (from.group || t.group));
      const nums = grouped.slice()
        .sort((a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true }))
        .map(tt => disp(tt.num)).join(' + ');
      const covers = grouped.reduce((sum, tt) => sum + (pdsGeom(tt).seats || 0), 0);
      toast(T.groupOk(nums, covers), { type: 'success' });
      setTimeout(() => state._openInspector(id), 0);
      return;
    }
    /* Selection logic · Shift, ⌘ or Ctrl toggles, like every editor. */
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
      if (selection.has(id)) {
        selection.delete(id);
        el.classList.remove('is-selected');
      } else {
        selection.add(id);
        el.classList.add('is-selected');
      }
      state._openBulkInspector();
      ev.preventDefault();
      return;
    } else {
      /* Plain click on an unselected table starts a fresh selection. A table
       * already inside a shift-selection keeps that selection intact so the
       * pointerdown can immediately become a multi-table drag. */
      const wasSelected = selection.has(id);
      if (!wasSelected) {
        selection.clear();
        root.querySelectorAll('.pds-tbl-cell.is-selected').forEach(n => n.classList.remove('is-selected'));
      }
      selection.add(id);
      el.classList.add('is-selected');
      /* The matching inspector is already open for an existing selection.
       * Reopening it here calls bind(), stacking a fresh drag closure during
       * pointerdown and can steal the gesture before its first move. */
      if (!wasSelected) {
        if (selection.size > 1) state._openBulkInspector();
        else state._openInspector(id);
      }
    }
    dragging = true;
    startX = ev.clientX; startY = ev.clientY;
    origX = t.x; origY = t.y;
    transformX = 0; transformY = 0;
    /* Snapshot the stage scale for the duration of this drag. The table is a
     * child of the scaled plane, so a translate() on it is itself scaled —
     * meaning a screen delta of D px must be written as D/k logical units to
     * track the cursor 1:1. */
    dragK = pdsK(root);
    /* Les partenaires de groupe (et leur enveloppe) suivent le même
       translate pendant le drag : la fusion se déplace d'un seul geste. */
    groupPeers = [];
    groupOrig = {};
    selectionOrig = {};
    if (selection.size > 1 && selection.has(id)) {
      state.tables.forEach(tt => {
        if (selection.has(tt.id)) selectionOrig[tt.id] = { x: tt.x, y: tt.y };
      });
    }
    if (t.group) {
      state.tables.forEach(tt => {
        if (tt.group === t.group && tt.id !== id) {
          groupOrig[tt.id] = { x: tt.x, y: tt.y };
          const n = root.querySelector(`[data-pds-table="${tt.id}"]`);
          if (n) groupPeers.push({ n, rot: tt.rot || 0 });
        }
      });
      const env = root.querySelector(`[data-pds-group="${t.group}"]`);
      if (env) groupPeers.push({ n: env, rot: null });
    }
    el.setPointerCapture(ev.pointerId);
    el.classList.add('is-dragging');
    ev.preventDefault();
  });

  el.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    transformX = (ev.clientX - startX) / dragK;
    transformY = (ev.clientY - startY) / dragK;
    el.style.transform = `translate(${transformX}px, ${transformY}px) rotate(${t.rot||0}deg)`;
    groupPeers.forEach(p => {
      p.n.style.transform = `translate(${transformX}px, ${transformY}px)` + (p.rot === null ? '' : ` rotate(${p.rot}deg)`);
    });
    /* The table always follows the cursor 1:1 — a table that refuses to move
       reads as a broken app, not as a rule. Illegality is shown, not enforced,
       until release. The collision test is coalesced to one per frame. */
    if (!blockFrame) blockFrame = requestAnimationFrame(() => {
      blockFrame = 0;
      const at = { x: Math.round(origX + transformX), y: Math.round(origY + transformY) };
      const hits = pdsBlockers(state, t, at);
      el.classList.toggle('is-blocked', hits.length > 0);
      root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
      hits.forEach(b => {
        const n = root.querySelector(`[data-pds-table="${b.id}"], [data-pds-el="${b.id}"]`);
        if (n) n.classList.add('pds-blocker');
      });
    });
  });

  const finish = (ev) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    /* A drag is a gesture to undo like any other. A press that never moved
       is a click and records nothing. */
    if (Math.abs(transformX) + Math.abs(transformY) >= 1) pdsPush(state);
    let nx = origX + transformX;
    let ny = origY + transformY;
    if (state.snap) {
      nx = Math.round(nx / PDS_GRID) * PDS_GRID;
      ny = Math.round(ny / PDS_GRID) * PDS_GRID;
    }
    /* Clamp to the room — its own size, which the merchant can change. */
    const plane = pdsPlaneOf(state);
    const g = pdsGeom(t);
    nx = Math.max(0, Math.min(plane.w - g.w, nx));
    ny = Math.max(0, Math.min(plane.h - g.h, ny));
    if (blockFrame) { cancelAnimationFrame(blockFrame); blockFrame = 0; }
    el.classList.remove('is-blocked');
    root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
    /* Settle. A drop on top of something lands beside it — searched outward
       from where you actually aimed, so the table still goes where you meant
       it to go rather than springing back to where it started. */
    if (selection.size <= 1 && !t.group && pdsBlockers(state, t, { x: nx, y: ny }).length) {
      const spot = pdsNearestFree(state, t, nx, ny, plane);
      if (spot) { nx = spot.x; ny = spot.y; }
      else {
        nx = origX; ny = origY;
        if (window.Kiwi && Kiwi.toast) Kiwi.toast(T.noRoom);
      }
    }
    /* If shift-multi-drag, move all selected by the same delta. Positions are
       absolute from pointerdown origins: surviving DOM nodes may carry stacked
       finish listeners after a wire pass, and replaying one must be idempotent. */
    if (selection.size > 1 && selection.has(id)) {
      const dx = nx - origX;
      const dy = ny - origY;
      state.tables.forEach(tt => {
        if (selection.has(tt.id) && tt.id !== id) {
          const o = selectionOrig[tt.id];
          if (!o) return;
          const tg = pdsGeom(tt);
          tt.x = Math.max(0, Math.min(plane.w - tg.w, o.x + dx));
          tt.y = Math.max(0, Math.min(plane.h - tg.h, o.y + dy));
        }
      });
    }
    /* Une table groupée entraîne ses partenaires : la fusion est un seul
       meuble. Même delta pour chacun, borné à la pièce. Position absolue
       depuis l'origine capturée au pointerdown — un finish() qui rejoue
       (écouteurs empilés par un re-câblage) reste alors sans effet. */
    if (t.group) {
      const dx = nx - origX;
      const dy = ny - origY;
      state.tables.forEach(tt => {
        const o = groupOrig[tt.id];
        if (o && tt.group === t.group && !(selection.size > 1 && selection.has(tt.id))) {
          const tg = pdsGeom(tt);
          tt.x = Math.max(0, Math.min(plane.w - tg.w, o.x + dx));
          tt.y = Math.max(0, Math.min(plane.h - tg.h, o.y + dy));
        }
      });
      groupPeers = [];
    }
    t.x = nx;
    t.y = ny;
    /* Smooth commit: update style then full refresh (which will reset transform) */
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
    el.style.transform = `rotate(${t.rot||0}deg)`;
    refresh();
    /* Re-select after refresh */
    setTimeout(() => {
      selection.forEach(sid => {
        const newEl = root.querySelector(`[data-pds-table="${sid}"]`);
        if (newEl) newEl.classList.add('is-selected');
      });
      if (selection.size > 1) state._openBulkInspector();
      else if (selection.size === 1) state._openInspector([...selection][0]);
    }, 0);
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
}

function pdsAttachElDrag(el, id, state, T, root, refresh) {
  let dragging = false;
  let startX, startY, origX, origY;
  let dragK = 1;
  let moved = false;
  let blockFrame = 0, lastX = 0, lastY = 0;
  const elObj = state.elements.find(e => e.id === id);
  if (!elObj) return;
  let lastTap = 0;
  el.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    /* Double-click rotates element */
    const now = Date.now();
    if (now - lastTap < 280) {
      if (elObj.locked) return;
      pdsPush(state);
      elObj.rot = ((elObj.rot || 0) + 90) % 360;
      refresh();
      lastTap = 0;
      return;
    }
    lastTap = now;
    dragging = true;
    moved = false;
    startX = ev.clientX; startY = ev.clientY;
    origX = elObj.x; origY = elObj.y;
    dragK = pdsK(root);   /* screen px → logical units, see pdsK() */
    el.setPointerCapture(ev.pointerId);
    el.classList.add('is-dragging');
    ev.preventDefault();
  });
  el.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    if (!moved && Math.abs(ev.clientX - startX) < 3 && Math.abs(ev.clientY - startY) < 3) return;
    moved = true;
    el.style.transform = `translate(${(ev.clientX - startX)/dragK}px, ${(ev.clientY - startY)/dragK}px) rotate(${elObj.rot||0}deg)`;
    if (!blockFrame) blockFrame = requestAnimationFrame(() => {
      blockFrame = 0;
      const at = { x: Math.round(origX + (lastX - startX) / dragK), y: Math.round(origY + (lastY - startY) / dragK) };
      const hits = pdsBlockers(state, elObj, at);
      el.classList.toggle('is-blocked', hits.length > 0);
      root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
      hits.forEach(b => {
        const n = root.querySelector(`[data-pds-table="${b.id}"], [data-pds-el="${b.id}"]`);
        if (n) n.classList.add('pds-blocker');
      });
    });
    lastX = ev.clientX; lastY = ev.clientY;
  });
  const finish = (ev) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging', 'is-blocked');
    if (blockFrame) { cancelAnimationFrame(blockFrame); blockFrame = 0; }
    root.querySelectorAll('.pds-blocker').forEach(n => n.classList.remove('pds-blocker'));
    /* A press that never moved is a click. Refreshing here would rebuild the
       stage DOM before the browser dispatches the click event, so the
       selection handler on this node would never fire — the fixture would
       feel impossible to select, resize or delete. Leave the DOM alone. */
    if (!moved) return;
    pdsPush(state);
    let nx = origX + (ev.clientX - startX) / dragK;
    let ny = origY + (ev.clientY - startY) / dragK;
    if (state.snap) {
      nx = Math.round(nx / PDS_GRID) * PDS_GRID;
      ny = Math.round(ny / PDS_GRID) * PDS_GRID;
    }
    const plane = pdsPlaneOf(state);
    const g = pdsGeom(elObj);
    nx = Math.max(0, Math.min(plane.w - g.w, nx));
    ny = Math.max(0, Math.min(plane.h - g.h, ny));
    /* Same settle rule as tables — a kitchen dropped over a table lands
       against it, not through it. */
    if (pdsBlockers(state, elObj, { x: nx, y: ny }).length) {
      const spot = pdsNearestFree(state, elObj, nx, ny, plane);
      if (spot) { nx = spot.x; ny = spot.y; }
      else {
        nx = origX; ny = origY;
        if (window.Kiwi && Kiwi.toast) Kiwi.toast(T.noRoom);
      }
    }
    elObj.x = nx; elObj.y = ny;
    refresh();
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
}

/* Server chip drag — drop on a table or a zone tab */
function pdsAttachChipDrag(chip, sid, state, T, root, refresh) {
  if (chip.getAttribute('data-pds-chip-wired') === '1') return;
  chip.setAttribute('data-pds-chip-wired', '1');
  let dragging = false;
  let startX, startY;
  let ghost = null;
  const create = (ev) => {
    /* La croix de retrait vit dans la pastille : sans cette sortie, le
       pointerdown démarrerait un glisser et avalerait le clic. */
    if (ev.target && ev.target.closest && ev.target.closest('[data-pds-action]')) return;
    dragging = true;
    startX = ev.clientX; startY = ev.clientY;
    chip.setPointerCapture(ev.pointerId);
    /* Build a floating ghost following the cursor */
    ghost = chip.cloneNode(true);
    ghost.classList.add('pds-chip-ghost');
    ghost.style.position = 'fixed';
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '9999';
    ghost.style.opacity = '0.9';
    document.body.appendChild(ghost);
    chip.classList.add('is-dragging');
    ev.preventDefault();
  };
  chip.addEventListener('pointerdown', create);
  chip.addEventListener('pointermove', (ev) => {
    if (!dragging || !ghost) return;
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';
  });
  const finish = (ev) => {
    if (!dragging) return;
    dragging = false;
    chip.classList.remove('is-dragging');
    /* Hide the ghost so elementFromPoint reads what's under the cursor */
    if (ghost) ghost.style.display = 'none';
    const target = document.elementFromPoint(ev.clientX, ev.clientY);
    if (ghost) { ghost.remove(); ghost = null; }
    if (target) {
      const tableEl = target.closest('[data-pds-table]');
      const zoneEl = target.closest('[data-pds-zone]');
      if (tableEl) {
        const tid = tableEl.getAttribute('data-pds-table');
        const t = state.tables.find(tt => tt.id === tid);
        if (t) {
          const current = pdsServerIds(t);
          if (!current.includes(sid) && current.length >= PDS_MAX_TABLE_SERVERS) {
            Kiwi.toast(T.maxServersTitle, { type: 'info', desc: T.maxServersDesc });
            refresh();
            return;
          }
          pdsPush(state);
          pdsSetServerIds(t, current.concat(sid));
          const sv = state.staff.find(s => s.id === sid);
          Kiwi.toast(T.assignDone(sv?.name.split(' ')[0] || sid, t.num), { type: 'success', desc: T.assignDoneDesc });
          refresh();
          return;
        }
      } else if (zoneEl) {
        const zid = zoneEl.getAttribute('data-pds-zone');
        /* Assign chip to every table in that zone */
        pdsPush(state);
        let count = 0;
        state.tables.forEach(t => {
          if (t.zone !== zid) return;
          const current = pdsServerIds(t);
          if (current.includes(sid)) return;
          if (current.length < PDS_MAX_TABLE_SERVERS) { pdsSetServerIds(t, current.concat(sid)); count++; }
        });
        const zname = state.zones.find(z => z.id === zid)?.name || '';
        const sv = state.staff.find(s => s.id === sid);
        Kiwi.toast(T.zoneAssigned(sv?.name.split(' ')[0] || sid, zname), { type: 'success', desc: T.zoneAssignedDesc(count) });
        refresh();
        return;
      }
    }
    /* No drop target — small bounce-back toast (skip if too short of a drag) */
    if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6) {
      /* Treated as click — open assign-chip menu */
      Kiwi.toast(state.staff.find(s => s.id === sid)?.name || sid, { type: 'info', desc: T.rosterHint, duration: 1400 });
    }
  };
  chip.addEventListener('pointerup', finish);
  chip.addEventListener('pointercancel', (ev) => {
    if (ghost) { ghost.remove(); ghost = null; }
    chip.classList.remove('is-dragging');
    dragging = false;
  });
}

/* ─── Helpers behind the actions ──────────────────────────────────────── */
function pdsNewZoneId(state) {
  let id;
  do { id = 'z' + Math.random().toString(36).slice(2, 8); } while (state.zones.some(z => z.id === id));
  return id;
}
/* The next number nobody uses yet: highest numeric + 1, skipping taken ones. */
function pdsNextNum(state) {
  const used = new Set(state.tables.map(t => String(t.num).trim().toLowerCase()));
  let n = state.tables.reduce((m, t) => Math.max(m, parseInt(t.num, 10) || 0), 0) + 1;
  while (used.has(String(n))) n += 1;
  return String(n);
}
/* Reading order inside a zone: rows (tables whose tops are within 40 cm
   of each other share a row), then left to right. */
function pdsReadingOrder(tables) {
  const sorted = tables.slice().sort((a, b) => a.y - b.y);
  const rows = [];
  sorted.forEach(t => {
    const row = rows.find(r => Math.abs(r.y - t.y) < 40);
    if (row) row.items.push(t); else rows.push({ y: t.y, items: [t] });
  });
  return rows.flatMap(r => r.items.sort((a, b) => a.x - b.x));
}
function pdsRenumber(state, mode) {
  let n = 0, changed = 0;
  /* A zone of a hundred tables or more would run into the next one. */
  const span = state.zones.some(z => state.tables.filter(t => t.zone === z.id).length >= 100) ? 1000 : 100;
  state.zones.forEach((z, zi) => {
    /* Per zone, by hundreds: salle 1, 2…, then 101, 102…, 201… A letter
       (« T1 ») would read as table 1 at the till, and a waiter's keypad
       has no letters anyway. */
    if (mode === 'prefix') n = zi * span;
    pdsReadingOrder(state.tables.filter(t => t.zone === z.id)).forEach(t => {
      n += 1;
      const num = String(n);
      if (String(t.num) !== num) changed += 1;
      t.num = num;
    });
  });
  return changed || state.tables.length;
}

/* ─── Versions ────────────────────────────────────────────────────────────
 *   Named layouts kept inside the plan document, so they travel with it to
 *   every device. Five at most (the document caps at 400 KB). A deleted
 *   version is buried like a deleted table, so another device's copy cannot
 *   bring it back. */
const PDS_MAX_VERSIONS = 5;
function pdsVersions(state) {
  const gone = state.gone || {};
  return (Array.isArray(state.versions) ? state.versions : []).filter(v => v && v.id && !gone[v.id]);
}
function pdsSaveVersion(state, name) {
  const strip = (t) => { const c = JSON.parse(JSON.stringify(t)); delete c.since; if (PDS_SERVICE_STATUSES.includes(c.status)) c.status = 'free'; return c; };
  const v = {
    id: 'ver' + Math.random().toString(36).slice(2, 8),
    name: String(name || '').slice(0, 60), at: Date.now(),
    zones: JSON.parse(JSON.stringify(state.zones)),
    tables: state.tables.map(strip),
    elements: JSON.parse(JSON.stringify(state.elements || [])),
  };
  const list = pdsVersions(state).concat(v);
  const drop = list.length > PDS_MAX_VERSIONS ? list.slice(0, list.length - PDS_MAX_VERSIONS) : [];
  if (drop.length && typeof pdsBury === 'function') pdsBury(state, drop.map(x => x.id));
  state.versions = list.slice(-PDS_MAX_VERSIONS);
  return v;
}
function pdsApplyVersion(state, v, T) {
  pdsSaveVersion(state, T.versionBefore(v.name));
  const now = new Set(state.tables.map(t => t.id).concat(state.elements.map(e => e.id)));
  const incoming = JSON.parse(JSON.stringify({ zones: v.zones, tables: v.tables, elements: v.elements || [] }));
  const keep = new Set(incoming.tables.map(t => t.id).concat(incoming.elements.map(e => e.id)));
  if (typeof pdsBury === 'function') pdsBury(state, [...now].filter(id => !keep.has(id)));
  if (typeof pdsUnbury === 'function') pdsUnbury(state, [...keep]);
  state.zones = incoming.zones; state.tables = incoming.tables; state.elements = incoming.elements;
  if (!state.zones.some(z => z.id === state.activeZone)) state.activeZone = state.zones[0] && state.zones[0].id;
  pdsSyncStaff(state);
}
function pdsOpenVersions(state, T, refresh, selection) {
  const fmt = (ts) => new Date(ts).toLocaleString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const body = () => {
    const list = pdsVersions(state).slice().reverse();
    return `
      <div class="pds-versions">
        <div class="pds-version-new">
          <input class="kf-input pds-input" maxlength="60" data-pds-ver-name placeholder="${pdsEsc(T.versionNamePh)}" aria-label="${pdsEsc(T.versionName)}"/>
          <button data-activation=write class="kb atlas" data-pds-ver-save>${pdsEsc(T.versionSave)}</button>
        </div>
        ${list.length ? list.map(v => {
          const covers = (v.tables || []).reduce((n, t) => n + pdsGeom(t).seats, 0);
          return `<div class="pds-version" data-pds-ver="${pdsEsc(v.id)}">
            <div><b>${pdsEsc(v.name)}</b><em>${pdsEsc(fmt(v.at))} · ${pdsEsc(T.versionMeta((v.tables || []).length, covers))}</em></div>
            <button class="kb ghost" data-pds-ver-apply>${pdsEsc(T.versionApply)}</button>
            <button data-activation=write class="kb ghost pds-rail-danger" data-pds-ver-del>${pdsEsc(T.versionDelete)}</button>
          </div>`;
        }).join('') : `<p class="pds-rail-hint">${pdsEsc(T.versionEmpty)}</p>`}
      </div>`;
  };
  const m = Kiwi.modal({ tag: T.tagPdS, title: T.versionsTitle, desc: T.versionsDesc, width: 560, body: body(),
    foot: `<button class="kb ghost" data-dismiss>${T.close}</button>` });
  wireDismiss(m);
  if (!m || !m.el) return;
  const wire = () => {
    const host = m.el.querySelector('.pds-versions');
    host.querySelector('[data-pds-ver-save]').onclick = () => {
      const input = host.querySelector('[data-pds-ver-name]');
      const name = String(input.value || '').trim();
      if (!name) { input.focus(); return; }
      pdsSaveVersion(state, name);
      refresh();
      host.outerHTML = body(); wire();
      Kiwi.toast(T.versionSaved(name), { type: 'success' });
    };
    host.querySelectorAll('[data-pds-ver]').forEach(row => {
      const v = pdsVersions(state).find(x => x.id === row.getAttribute('data-pds-ver'));
      row.querySelector('[data-pds-ver-apply]').onclick = () => {
        if (!v) return;
        pdsPush(state);
        pdsApplyVersion(state, v, T);
        selection.clear();
        refresh();
        m.close();
        Kiwi.toast(T.versionApplied(v.name), { type: 'success', desc: T.versionAppliedDesc });
      };
      row.querySelector('[data-pds-ver-del]').onclick = () => {
        if (!v) return;
        if (typeof pdsBury === 'function') pdsBury(state, v.id);
        state.versions = pdsVersions(state);
        refresh();
        m.el.querySelector('.pds-versions').outerHTML = body(); wire();
      };
    });
  };
  wire();
}

/* A booking without a table gets one: the table resource the floor-plan
   template uses (`tpl-floor-<id>`), created if Réservations does not have
   it yet. Goes through KiwiReservations.set, so the booking page, the public
   link and every device see the same placement. */
function pdsPlaceBooking(state, booking, table) {
  try {
    const R = window.KiwiReservations, L = window.KiwiFloorLive;
    const doc = R.get();
    const b = (doc.bookings || []).find(x => x.id === booking.id);
    if (!b) return false;
    const rid = L.resourceTableId(table.id);
    let res = (doc.resources || []).find(r => r.id === rid);
    const now = Date.now();
    if (!res) {
      res = { id: rid, name: 'Table ' + pdsTableNum(table), kind: 'table', capacity: pdsGeom(table).seats || 2, active: true, week: null, updatedAt: now };
      doc.resources = (doc.resources || []).concat(res);
      /* The booking's service must accept this table, or validation would
         reject the placement later. */
      const svc = (doc.services || []).find(x => x.id === b.serviceId);
      if (svc && Array.isArray(svc.resourceIds) && svc.resourceIds.length && !svc.resourceIds.includes(rid)) {
        svc.resourceIds = svc.resourceIds.concat(rid); svc.updatedAt = now;
      }
    }
    b.resourceId = rid;
    b.updatedAt = now;
    R.set(doc);
    return true;
  } catch (_) { return false; }
}

/* ─── Export ──────────────────────────────────────────────────────────────
 *   The old « Plan exporté · PDF A3 » toast exported nothing. Both formats
 *   are drawn from the plan itself (no screenshot of the editor, no
 *   selection handles): one vector drawing per zone, with table numbers,
 *   covers and the servers' initials. */
function pdsExportSvg(state, zone, T) {
  const P = pdsPlane(zone);
  const r = pdsRoom(zone);
  const pad = 40, W = P.w + pad * 2, H = P.h + pad * 2 + 30;
  const staff = new Map(state.staff.map(x => [x.id, x]));
  const els = state.elements.filter(e => e.zone === zone.id).sort((a, b) => (a.z || 0) - (b.z || 0)).map(e => {
    const g = pdsGeom(e);
    const K = PDS_FIX[e.type] || {};
    const label = e.label != null ? e.label : (T['fix' + e.type] || K.label || '');
    return `<g transform="translate(${e.x + pad} ${e.y + pad + 30}) rotate(${e.rot || 0} ${g.w / 2} ${g.h / 2})">
      <rect width="${g.w}" height="${g.h}" rx="4" fill="#EFEBE3" stroke="#B9AF9B" stroke-width="1"/>
      ${label && g.w > 40 ? `<text x="${g.w / 2}" y="${g.h / 2 + 4}" text-anchor="middle" font-size="11" fill="#6B655B">${pdsEsc(label)}</text>` : ''}
    </g>`;
  }).join('');
  const tbls = state.tables.filter(t => t.zone === zone.id).map(t => {
    const g = pdsGeom(t);
    const cx = g.w / 2, cy = g.h / 2;
    const body = g.shape === 'round'
      ? `<ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="#FFFFFF" stroke="#0A0F0D" stroke-width="1.5"/>`
      : `<rect width="${g.w}" height="${g.h}" rx="${Math.min(8, g.w / 5, g.h / 5)}" fill="#FFFFFF" stroke="#0A0F0D" stroke-width="1.5"/>`;
    const svs = pdsServerIds(t).map(id => staff.get(id)).filter(Boolean);
    const dots = svs.map((sv, i) => `<g transform="translate(${g.w - 4 - i * 20} -6)"><circle r="9" fill="${pdsEsc(pdsBadge(sv.color).bg)}"/><text y="3.5" text-anchor="middle" font-size="9" font-weight="600" fill="${pdsBadge(sv.color).ink}">${pdsEsc(pdsInitials(sv.name))}</text></g>`).join('');
    return `<g transform="translate(${t.x + pad} ${t.y + pad + 30}) rotate(${t.rot || 0} ${cx} ${cy})">${body}
      <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="${Math.max(11, Math.min(18, g.h / 3))}" font-weight="600" fill="#0A0F0D">${pdsEsc(pdsTableNum(t))}</text>
      <text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="9" fill="#6B655B">${g.seats}p</text>${dots}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Inter Tight, Inter, system-ui, sans-serif">
    <rect width="${W}" height="${H}" fill="#F7F5F0"/>
    <text x="${pad}" y="${pad}" font-size="20" font-weight="600" fill="#0A0F0D">${pdsEsc(pdsZoneName(zone))}</text>
    <rect x="${pad}" y="${pad + 30}" width="${P.w}" height="${P.h}" fill="${pdsEsc(r.floor || '#FBF7EE')}" stroke="#2C2520" stroke-width="${Math.max(2, r.wallW || 2)}"/>
    ${els}${tbls}
  </svg>`;
}
function pdsExportPrint(state, T) {
  const v = window.KiwiVenue?.getCurrentVenueData?.() || {};
  const day = new Date().toLocaleDateString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const legend = state.staff.map(sv => {
    const n = state.tables.filter(t => pdsServerIds(t).includes(sv.id)).map(pdsTableNum);
    return n.length ? `<li><i style="background:${pdsEsc(sv.color)}"></i><b>${pdsEsc(sv.name)}</b> · ${pdsEsc(n.join(', '))}</li>` : '';
  }).join('');
  const pages = state.zones.filter(z => state.tables.some(t => t.zone === z.id) || state.elements.some(e => e.zone === z.id)).map(z => `
    <section class="page">
      <header><b>${pdsEsc(v.name || T.title)}</b><span>${pdsEsc(T.title)} · ${pdsEsc(T.exportPrinted(day))}</span></header>
      <div class="plan">${pdsExportSvg(state, z, T)}</div>
      ${legend ? `<footer><b>${pdsEsc(T.exportServers)}</b><ul>${legend}</ul></footer>` : ''}
    </section>`).join('');
  const w = window.open('', '_blank');
  if (!w) { Kiwi.toast(T.exportBlocked, { type: 'warn' }); return; }
  w.document.write(`<!doctype html><html lang="${trLang()}" dir="${trLang() === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${pdsEsc((v.name ? v.name + ' · ' : '') + T.title)}</title>
    <style>
      @page { size: A3 landscape; margin: 12mm; }
      body { margin: 0; background: #F7F5F0; color: #0A0F0D; font: 13px/1.4 "Inter Tight", Inter, system-ui, sans-serif; }
      .page { page-break-after: always; display: flex; flex-direction: column; gap: 10px; padding: 16px; box-sizing: border-box; min-height: 100vh; }
      .page:last-child { page-break-after: auto; }
      header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid rgba(10,15,13,.15); padding-bottom: 8px; }
      header b { font-size: 18px; font-weight: 600; } header span { color: rgba(10,15,13,.6); }
      .plan { flex: 1; display: flex; align-items: center; justify-content: center; }
      .plan svg { max-width: 100%; max-height: 78vh; height: auto; }
      footer ul { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 18px; }
      footer i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-inline-end: 6px; vertical-align: middle; }
    </style></head><body>${pages}<script>window.onload=function(){setTimeout(function(){window.print();},200);};<\/script></body></html>`);
  w.document.close();
}
function pdsExportPng(state, T, zone) {
  if (!zone) return;
  const svg = pdsExportSvg(state, zone, T);
  const P = pdsPlane(zone);
  const W = P.w + 80, H = P.h + 110, scale = 2;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, W, H);
    URL.revokeObjectURL(url);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const v = window.KiwiVenue?.getCurrentVenueData?.() || {};
      const slug = String((v.name ? v.name + '-' : '') + zone.name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      a.href = URL.createObjectURL(blob);
      a.download = `plan-${slug || 'salle'}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      Kiwi.toast(T.exportDone, { type: 'success' });
    }, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

/* ═══ ACTION HANDLERS ═════════════════════════════════════════════════ */
function pdsHandleAction(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);

  switch (action) {
    case 'toggle-view': {
      /* Flips the dashboard's theme; the observer in pdsAttach repaints. */
      pdsSetNoir(!pdsNoir());
      break;
    }
    case 'reset': {
      /* What the reset really loads, counted from the template itself — the
         old copy promised « 16 tables, 3 zones » for a 24-table default and
         an empty custom floor alike. The current plan goes to Versions
         first, and the reset is one undo step like any other. */
      const fresh = pdsNormalize(pdsDefaultState());
      const m = modal({
        tag: T.tagPdS,
        title: T.resetTitle,
        desc: T.resetDesc(fresh.tables.length, fresh.zones.length),
        width: 480,
        body: '',
        foot: `
          <button class="kb ghost" data-dismiss>${T.resetCancel}</button>
          <button class="kb pds-danger" data-dismiss data-pds-reset-confirm>${T.resetConfirm}</button>
        `,
      });
      wireDismiss(m);
      const confirm = m?.el?.querySelector('[data-pds-reset-confirm]');
      if (confirm) confirm.addEventListener('click', () => {
        pdsPush(state);
        pdsSaveVersion(state, T.versionAuto(new Date().toLocaleDateString(trLang() === 'ar' ? 'ar-MA' : trLang() === 'en' ? 'en-GB' : 'fr-FR')));
        const keep = { versions: state.versions, mode: state.mode, snap: state.snap, gone: state.gone || {} };
        if (typeof pdsBury === 'function') {
          pdsBury(state, state.tables.map(t => t.id).concat(state.elements.map(e => e.id)));
          keep.gone = state.gone;
        }
        Object.keys(state).forEach(k => { if (k.charAt(0) !== '_') delete state[k]; });
        Object.assign(state, pdsNormalize(pdsDefaultState()), keep);
        selection.clear();
        refresh();
        toast(T.resetDone, {
          type: 'success', desc: T.resetDoneDesc, duration: 6000,
          action: { label: T.undoAction, onClick: () => { if (pdsUndo(state)) { selection.clear(); refresh(); } } },
        });
      });
      break;
    }
    case 'export': {
      const zone = state.zones.find(z => z.id === state.activeZone) || state.zones[0];
      const m = modal({
        tag: T.tagPdS,
        title: T.exportTitle,
        desc: T.exportDesc,
        width: 520,
        body: `
          <div class="pds-export-opts">
            <button data-activation=money class="pds-export-opt" data-pds-export="print">
              <span class="pds-export-ico">${pdsIcon('print')}</span>
              <b>${pdsEsc(T.exportPrint)}</b><em>${pdsEsc(T.exportPrintDesc)}</em>
            </button>
            <button data-activation=money class="pds-export-opt" data-pds-export="png">
              <span class="pds-export-ico">${pdsIcon('image')}</span>
              <b>${pdsEsc(T.exportPng)}</b><em>${pdsEsc(T.exportPngDesc(zone ? pdsZoneName(zone) : ''))}</em>
            </button>
          </div>`,
        foot: `<button class="kb ghost" data-dismiss>${T.cancel}</button>`,
      });
      wireDismiss(m);
      m?.el?.querySelectorAll('[data-pds-export]').forEach(b => b.addEventListener('click', () => {
        const kind = b.getAttribute('data-pds-export');
        m.close();
        if (kind === 'print') pdsExportPrint(state, T);
        else pdsExportPng(state, T, zone);
      }));
      break;
    }
    case 'versions': {
      pdsOpenVersions(state, T, refresh, selection);
      break;
    }
    case 'place-booking': {
      const id = btn.getAttribute('data-pds-booking');
      const b = (PDS_BOOK.unplaced || []).find(x => x.id === id);
      if (!b || !window.KiwiReservations || !window.KiwiFloorLive) break;
      const t = window.KiwiFloorLive.suggestTable(b, state.tables, (tt) => pdsEff(tt).status, PDS_BOOK);
      if (!t) { toast(T.liveNoFit, { type: 'warn' }); break; }
      if (pdsPlaceBooking(state, b, t)) {
        pdsIndexBookings(state);
        refresh();
        toast(T.livePlaced(b.name, pdsTableNum(t)), { type: 'success' });
      }
      break;
    }
    case 'zoom-in':
    case 'zoom-out': {
      pdsZoomBy(root, state, action === 'zoom-in' ? 1.25 : 0.8);
      refresh();
      break;
    }
    case 'zoom-fit': {
      PDS_ZOOM = 0;
      refresh();
      break;
    }
    case 'pal-seats': {
      PDS_PAL_SEATS = Math.max(1, Math.min(10, PDS_PAL_SEATS + (+btn.getAttribute('data-pds-delta') || 0)));
      /* Repaint the rail alone: the stepper must not rebuild the room. */
      const rail = root.querySelector('[data-pds-rail]');
      if (rail) rail.innerHTML = pdsRenderLayoutRail(state, T);
      if (state._rebind) state._rebind();
      break;
    }
    case 'add-shape': {
      const shape = btn.getAttribute('data-pds-shape');
      const seats = pdsPalSeats(shape);
      const type = pdsTypeFor(shape, seats);
      const cfg = PDS_TABLE_TYPES[type] || PDS_TABLE_TYPES.round4;
      pdsPush(state);
      const plane = pdsPlaneOf(state);
      const spot = pdsFreeSpot(state, cfg.w, cfg.h, plane);
      const num = pdsNextNum(state);
      const newT = {
        id: newTableId(), zone: state.activeZone, type, x: spot.x, y: spot.y,
        w: cfg.w, h: cfg.h, seats,
        shape: cfg.shape, color: null, num, status: 'free', server: null, notes: '', rot: 0, locked: false,
      };
      state.tables.push(newT);
      selection.clear(); selection.add(newT.id);
      refresh();
      toast(T.addedTableToast(num), { type: 'success', desc: T.addedTableDesc(newT.seats, state.zones.find(z => z.id === state.activeZone)?.name || '') });
      /* Stay on the plan: below 1100px the inspector sits under it, and
         revealing it scrolled ~1000px away from the table just placed. */
      setTimeout(() => { if (state._openInspector) state._openInspector(newT.id, { reveal: false }); }, 0);
      break;
    }
    case 'zone-move': {
      const i = state.zones.findIndex(z => z.id === state.activeZone);
      const j = i + (+btn.getAttribute('data-pds-delta') || 0);
      if (i < 0 || j < 0 || j >= state.zones.length) break;
      pdsPush(state);
      const z = state.zones.splice(i, 1)[0];
      state.zones.splice(j, 0, z);
      refresh();
      break;
    }
    case 'zone-color': {
      const z = state.zones.find(zz => zz.id === state.activeZone);
      if (!z) break;
      pdsPush(state);
      const v = btn.getAttribute('data-pds-val');
      if (v) z.color = v; else delete z.color;
      refresh();
      break;
    }
    case 'zone-duplicate': {
      const z = state.zones.find(zz => zz.id === state.activeZone);
      if (!z) break;
      pdsPush(state);
      const nz = JSON.parse(JSON.stringify(z));
      nz.id = pdsNewZoneId(state);
      nz.name = T.zoneCopy(pdsZoneName(z));
      state.zones.splice(state.zones.indexOf(z) + 1, 0, nz);
      const used = new Set(state.tables.map(t => String(t.num)));
      let next = state.tables.reduce((m, t) => Math.max(m, parseInt(t.num, 10) || 0), 0);
      state.tables.filter(t => t.zone === z.id).forEach(t => {
        const c = JSON.parse(JSON.stringify(t));
        c.id = newTableId(); c.zone = nz.id; delete c.group;
        do { next += 1; } while (used.has(String(next)));
        c.num = String(next); used.add(c.num);
        pdsSetStatus(c, 'free'); pdsSetServerIds(c, []);
        state.tables.push(c);
      });
      state.elements.filter(e => e.zone === z.id).forEach(e => {
        const c = JSON.parse(JSON.stringify(e));
        c.id = newElId(); c.zone = nz.id;
        state.elements.push(c);
      });
      state.activeZone = nz.id;
      selection.clear();
      refresh();
      toast(T.zoneDuplicated(pdsZoneName(z)), { type: 'success' });
      break;
    }
    case 'renumber': {
      const m = modal({
        tag: T.tagPdS,
        title: T.renumberTitle,
        desc: T.renumberDesc,
        width: 520,
        body: `
          <div class="pds-strat-cards">
            <button data-activation=write class="pds-strat-card active" data-pds-renum="flat"><b>${pdsEsc(T.renumberFlat)}</b><em>${pdsEsc(T.renumberFlatDesc)}</em></button>
            <button class="pds-strat-card" data-pds-renum="prefix"><b>${pdsEsc(T.renumberPrefix)}</b><em>${pdsEsc(T.renumberPrefixDesc)}</em></button>
          </div>`,
        foot: `<button class="kb ghost" data-dismiss>${T.cancel}</button>
               <button class="kb atlas" data-pds-renum-ok>${T.renumberOk}</button>`,
      });
      wireDismiss(m);
      let mode = 'flat';
      m?.el?.querySelectorAll('[data-pds-renum]').forEach(b => b.addEventListener('click', () => {
        mode = b.getAttribute('data-pds-renum');
        m.el.querySelectorAll('[data-pds-renum]').forEach(o => o.classList.toggle('active', o === b));
      }));
      m?.el?.querySelector('[data-pds-renum-ok]')?.addEventListener('click', () => {
        pdsPush(state);
        const n = pdsRenumber(state, mode);
        m.close();
        refresh();
        toast(T.renumberDone(n), { type: 'success' });
      });
      break;
    }
    case 'add-zone': {
      const m = modal({
        tag: T.tagPdS,
        title: T.addZone,
        desc: T.addZoneDesc,
        width: 480,
        body: `
          <div class="kf-group">
            <label class="kf-label">${T.zoneName}</label>
            <input class="kf-input" data-pds-zone-name autofocus placeholder="${T.zoneName}" value=""/>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button data-activation=write class="kb atlas" data-pds-zone-confirm>${T.zoneAdd}</button>
        `,
      });
      wireDismiss(m);
      if (!m || !m.el) break;
      const confirm = m.el.querySelector('[data-pds-zone-confirm]');
      confirm?.addEventListener('click', () => {
        const input = m.el.querySelector('[data-pds-zone-name]');
        const name = (input?.value || '').trim().slice(0, 40) || `Zone ${state.zones.length + 1}`;
        /* Four characters of the clock collided for two zones made in the
           same second; the random tail and the existence check do not. */
        const id = pdsNewZoneId(state);
        pdsPush(state);
        state.zones.push({ id, name });
        state.activeZone = id;
        m.close();
        refresh();
        toast(T.zoneAdded, { type: 'success', desc: T.zoneAddedDesc(name) });
      });
      break;
    }
    case 'rename-zone': {
      const z = state.zones.find(zz => zz.id === state.activeZone);
      if (!z) break;
      const m = modal({
        tag: T.tagPdS,
        title: T.renameZoneTitle,
        desc: '',
        width: 480,
        body: `
          <div class="kf-group">
            <label class="kf-label">${T.zoneName}</label>
            <input class="kf-input" data-pds-zone-rename autofocus maxlength="40" value="${pdsEsc(pdsZoneName(z))}"/>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button data-activation=write class="kb atlas" data-pds-zone-rename-confirm>${T.save2}</button>
        `,
      });
      wireDismiss(m);
      if (!m || !m.el) break;
      const confirm = m.el.querySelector('[data-pds-zone-rename-confirm]');
      confirm?.addEventListener('click', () => {
        const input = m.el.querySelector('[data-pds-zone-rename]');
        const name = (input?.value || '').trim().slice(0, 40);
        if (!name) { m.close(); return; }
        pdsPush(state);
        /* Le champ montre le nom traduit ; s'il revient intact, le nom semé reste. */
        if (name !== pdsZoneName(z)) z.name = name;
        m.close();
        refresh();
        toast(T.renameZone, { type: 'success', desc: T.zoneRenamedDesc(name) });
      });
      break;
    }
    case 'delete-zone': {
      if (state.zones.length <= 1) {
        toast(T.deleteZoneNoLast, { type: 'warn', desc: T.deleteZoneNoLastDesc });
        break;
      }
      const z = state.zones.find(zz => zz.id === state.activeZone);
      if (!z) break;
      const count = state.tables.filter(t => t.zone === z.id).length;
      const m = modal({
        tag: T.tagPdS,
        title: T.deleteZoneTitle,
        desc: T.deleteZoneDesc(pdsEsc(pdsZoneName(z)), count),
        width: 480,
        body: '',
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button data-activation=write class="kb atlas pds-rail-danger" data-pds-zone-del-confirm>${T.deleteZoneOk}</button>
        `,
      });
      wireDismiss(m);
      if (!m || !m.el) break;
      const confirm = m.el.querySelector('[data-pds-zone-del-confirm]');
      confirm?.addEventListener('click', () => {
        pdsPush(state);
        if (typeof pdsBury === 'function') {
          pdsBury(state, state.tables.filter(t => t.zone === z.id).map(t => t.id)
            .concat(state.elements.filter(e => e.zone === z.id).map(e => e.id)));
        }
        state.tables = state.tables.filter(t => t.zone !== z.id);
        state.elements = state.elements.filter(e => e.zone !== z.id);
        state.zones = state.zones.filter(zz => zz.id !== z.id);
        state.activeZone = state.zones[0]?.id;
        m.close();
        refresh();
        toast(T.deleteZoneDone, { type: 'success', desc: pdsZoneName(z), action: { label: T.undoAction, onClick: () => { if (pdsUndo(state)) refresh(); } } });
      });
      break;
    }
    /* ─── Setup wizard ───────────────────────────────────────────────────
       Replaces the five hard-coded templates. Eight questions, then three
       furnished candidates built from the answers — each labelled with the
       numbers it actually produced, so the count on the card and the count
       on the floor cannot drift apart the way the templates' could. */
    /* « Scanner ma salle » — la photo remplace le questionnaire, pas le
     * générateur. Le modèle vision extrait les FAITS (combien de tables,
     * quelles formes, terrasse, type d'établissement), on pré-remplit les
     * réponses du magicien avec, et c'est pdsGeneratePlan qui dessine — allées
     * garanties, zéro coordonnée inventée. Le commerçant relit les réponses,
     * ajuste, puis compare les trois plans comme d'habitude. */
    case 'scan-salle': {
      const scan = window.KiwiSalleScan;
      if (!scan || !scan.open) { toast(T.scanUnavailable, { type: 'warn' }); break; }
      scan.open({
        onFacts: (facts) => {
          const A = state._wizAnswers || (state._wizAnswers = {
            venue: 'restaurant', floors: ['RDC'], extras: [],
            dims_default: { w: 1200, h: 800 }, tables: 18,
            kitchenWall: 'n', entranceWall: 's', wc: true,
          });
          if (facts.venue) A.venue = facts.venue;
          if (facts.tables) A.tables = Math.min(60, Math.max(2, facts.tables));
          if (facts.mix && facts.mix.length) A.mix = facts.mix;
          if (facts.terrasse && !A.extras.includes('terrasse')) A.extras = A.extras.concat('terrasse');
          pdsHandleAction('open-wizard', btn, state, T, root, dr, refresh, selection);
        },
      });
      break;
    }
    case 'open-templates':
    case 'open-wizard': {
      const A = state._wizAnswers || (state._wizAnswers = {
        venue: 'restaurant', floors: ['RDC'], extras: [],
        dims_default: { w: 1200, h: 800 }, tables: 18,
        kitchenWall: 'n', entranceWall: 's', wc: true,
      });
      let step = 1, plans = null, chosen = null, spin = 0;

      const VENUES = ['restaurant', 'cafe', 'snack', 'patisserie', 'rooftop'];
      const EXTRAS = ['terrasse', 'patio', 'mezzanine', 'salon', 'bar'];
      const WALLS  = ['n', 'e', 's', 'w'];

      const qBody = () => `
        <div class="pds-wiz">
          <label class="pds-wiz-q">${T.wizVenue}</label>
          <div class="pds-wiz-opts">
            ${VENUES.map(v => `<button data-activation=write class="pds-wiz-opt ${A.venue===v?'active':''}" data-wiz-venue="${v}">${T['venue'+v]}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizFloors}</label>
          <div class="pds-wiz-opts">
            ${[1,2,3,4].map(n => `<button data-activation=write class="pds-wiz-opt ${A.floors.length===n?'active':''}" data-wiz-floors="${n}">${n}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizExtras}</label>
          <div class="pds-wiz-opts">
            ${EXTRAS.map(e => `<button data-activation=write class="pds-wiz-opt ${A.extras.includes(e)?'active':''}" data-wiz-extra="${e}">${T['extra'+e]}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizDims}</label>
          <div class="pds-wiz-dims">
            <label>${T.wizW}<input class="kf-input pds-input" type="number" min="3" max="40" step="0.5" data-wiz-w value="${A.dims_default.w/100}"/><span class="pds-unit">m</span></label>
            <label>${T.wizH}<input class="kf-input pds-input" type="number" min="3" max="40" step="0.5" data-wiz-h value="${A.dims_default.h/100}"/><span class="pds-unit">m</span></label>
            <span class="pds-wiz-area">${((A.dims_default.w*A.dims_default.h)/10000).toFixed(0)} m²</span>
          </div>

          <label class="pds-wiz-q">${T.wizTables}</label>
          <div class="pds-wiz-dims">
            <input class="pds-range" type="range" min="2" max="60" step="1" data-wiz-tables value="${A.tables}"/>
            <span class="pds-wiz-area" data-wiz-tables-out>${A.tables}</span>
          </div>

          <label class="pds-wiz-q">${T.wizKitchen}</label>
          <div class="pds-wiz-opts">
            ${WALLS.map(w => `<button data-activation=write class="pds-wiz-opt ${A.kitchenWall===w?'active':''}" data-wiz-kw="${w}">${T['wall'+w]}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizEntrance}</label>
          <div class="pds-wiz-opts">
            ${WALLS.map(w => `<button data-activation=write class="pds-wiz-opt ${A.entranceWall===w?'active':''}" data-wiz-ew="${w}">${T['wall'+w]}</button>`).join('')}
          </div>

          <label class="pds-wiz-q">${T.wizAlso}</label>
          <div class="pds-wiz-opts">
            <button data-activation=write class="pds-wiz-opt ${A.wc?'active':''}" data-wiz-wc>${T.fixwc}</button>
          </div>
        </div>`;

      const cardBody = () => `
        <div class="pds-wiz-cards">
          ${plans.map((p, i) => `
            <button data-activation=write class="pds-wiz-card ${chosen===i?'active':''}" data-wiz-pick="${i}">
              <span class="pds-wiz-thumb">${pdsPlanThumb(p)}</span>
              <span class="pds-wiz-card-name">${T['var'+p.variant]}</span>
              <span class="pds-wiz-card-nums">
                <b>${p.covers}</b> ${T.covers} · ${p.tableCount} ${T.tables}<br/>
                ${p.m2PerCover} m²/${T.cover} · ${T.aisleOf(p.aisle)}
              </span>
              ${p.shortfall ? `<span class="pds-wiz-short">${T.wizShort(p.shortfall, p.requested)}</span>` : ''}
            </button>`).join('')}
        </div>
        <p class="pds-wiz-note">${T.wizCardsNote}</p>`;

      const m = drawer({
        title: T.wizTitle, subtitle: T.wizDesc, width: 620,
        body: qBody(),
        foot: `<button class="kb ghost" data-dismiss>${T.close}</button>
               <button data-activation=write class="kb atlas" data-wiz-go>${T.wizGenerate}</button>`,
      });
      wireDismiss(m);
      if (!m || !m.el) break;

      const bodyEl = () => m.el.querySelector('.kiwi-drawer-body') || m.el.querySelector('.kiwi-modal-body');
      const footEl = () => m.el.querySelector('.kiwi-drawer-foot') || m.el.querySelector('.kiwi-modal-foot');

      const build = () => {
        /* Vary the mix rotation per regeneration so "Régénérer" gives a
           genuinely different arrangement rather than the same one twice.
           A scanned mix (Scanner ma salle) wins over the venue default: it
           reflects the tables actually photographed in this room. */
        const mix = ((A.mix && A.mix.length) ? A.mix : (PDS_VENUE_MIX[A.venue] || PDS_VENUE_MIX.restaurant)).slice();
        for (let i = 0; i < (spin % Math.max(1, mix.length)); i++) mix.push(mix.shift());
        const ans = Object.assign({}, A, {
          mix,
          floors: A.floors,
          extras: A.extras.map(e => T['extra' + e]),
        });
        plans = ['dense', 'confort', 'banquettes'].map(v => pdsGeneratePlan(ans, v));
        chosen = 0;
      };

      const render = () => {
        const b = bodyEl(), f = footEl();
        if (step === 1) {
          if (b) b.innerHTML = qBody();
          if (f) f.innerHTML = `<button class="kb ghost" data-dismiss>${T.close}</button>
                                <button data-activation=write class="kb atlas" data-wiz-go>${T.wizGenerate}</button>`;
        } else {
          if (b) b.innerHTML = cardBody();
          if (f) f.innerHTML = `<button class="kb ghost" data-wiz-back>${T.wizBack}</button>
                                <button class="kb ghost" data-wiz-again>${T.wizAgain}</button>
                                <button class="kb atlas" data-wiz-apply>${T.wizApply}</button>`;
        }
        wireDismiss(m);
        wire();
      };

      const wire = () => {
        const on = (sel, fn) => m.el.querySelectorAll(sel).forEach(el => el.onclick = () => fn(el));
        on('[data-wiz-venue]', el => { A.venue = el.getAttribute('data-wiz-venue'); render(); });
        on('[data-wiz-floors]', el => {
          const n = +el.getAttribute('data-wiz-floors');
          const names = ['RDC', '1er', '2e', '3e'];
          A.floors = names.slice(0, n); render();
        });
        on('[data-wiz-extra]', el => {
          const k = el.getAttribute('data-wiz-extra');
          A.extras = A.extras.includes(k) ? A.extras.filter(x => x !== k) : A.extras.concat(k);
          render();
        });
        on('[data-wiz-kw]', el => { A.kitchenWall = el.getAttribute('data-wiz-kw'); render(); });
        on('[data-wiz-ew]', el => { A.entranceWall = el.getAttribute('data-wiz-ew'); render(); });
        on('[data-wiz-wc]', () => { A.wc = !A.wc; render(); });

        const wIn = m.el.querySelector('[data-wiz-w]'), hIn = m.el.querySelector('[data-wiz-h]');
        if (wIn) wIn.onchange = () => { A.dims_default.w = Math.round(Math.max(3, +wIn.value || 12) * 100); render(); };
        if (hIn) hIn.onchange = () => { A.dims_default.h = Math.round(Math.max(3, +hIn.value || 8) * 100); render(); };
        const tIn = m.el.querySelector('[data-wiz-tables]');
        if (tIn) {
          tIn.oninput = () => {
            A.tables = +tIn.value;
            const out = m.el.querySelector('[data-wiz-tables-out]');
            if (out) out.textContent = A.tables;
          };
        }

        const go = m.el.querySelector('[data-wiz-go]');
        if (go) go.onclick = () => { build(); step = 2; render(); };
        const back = m.el.querySelector('[data-wiz-back]');
        if (back) back.onclick = () => { step = 1; render(); };
        const again = m.el.querySelector('[data-wiz-again]');
        if (again) again.onclick = () => { spin++; build(); render(); };
        on('[data-wiz-pick]', el => { chosen = +el.getAttribute('data-wiz-pick'); render(); });

        const apply = m.el.querySelector('[data-wiz-apply]');
        if (apply) apply.onclick = () => {
          const p = plans[chosen];
          if (!p) return;
          pdsPush(state);
          state.zones = p.zones;
          state.tables = p.tables;
          state.elements = p.elements;
          state.activeZone = p.zones[0].id;
          state.v = 2;
          selection.clear();
          try { pdsSave(state); } catch (_) {}
          /* Closing this drawer takes the plan drawer underneath with it, so
             the merchant would land back on the dashboard having never seen
             the room they just built — the one moment it most needs to be on
             screen. Re-open it explicitly instead of assuming it survived. */
          m.close();
          refresh();
          setTimeout(() => {
            if (!document.querySelector('[data-pds-canvas]')) {
              try { handlers['nav-tables'](); } catch (_) {}
            }
            toast(T.wizDone(p.covers), {
              type: 'success',
              desc: p.shortfall ? T.wizShort(p.shortfall, p.requested) : T.wizDoneDesc(p.tableCount, p.aisle),
            });
          }, 60);
        };
      };

      wire();
      break;
    }
    case 'add-table':
    case 'add-table-default': {
      const type = action === 'add-table-default' ? 'round4' : btn.getAttribute('data-pds-type');
      const cfg = PDS_TABLE_TYPES[type] || PDS_TABLE_TYPES.round4;
      pdsPush(state);
      const plane = pdsPlaneOf(state);
      const spot = pdsFreeSpot(state, cfg.w, cfg.h, plane);
      const num = String(state.tables.length + 1);
      const newT = {
        id: newTableId(),
        zone: state.activeZone,
        type,
        x: spot.x,
        y: spot.y,
        /* Geometry is stamped onto the instance at birth. The type is only a
           source of defaults from here on, so resizing this table cannot
           affect any other table of the same type. */
        w: cfg.w, h: cfg.h, seats: cfg.seats, shape: cfg.shape,
        color: null,
        num,
        status: 'free',
        server: null,
        notes: '',
        rot: 0,
        locked: false,
      };
      state.tables.push(newT);
      /* Select BEFORE rendering: handles are drawn by the renderer from the
         selection, so selecting afterwards left the new table without any. */
      selection.clear();
      selection.add(newT.id);
      refresh();
      toast(T.addedTableToast(num), { type: 'success', desc: T.addedTableDesc(cfg.seats, state.zones.find(z=>z.id===state.activeZone)?.name || '') });
      setTimeout(() => { if (state._openInspector) state._openInspector(newT.id); }, 0);
      break;
    }
    case 'add-el': {
      const type = btn.getAttribute('data-pds-eltype');
      const cfg = PDS_FIX[type];
      if (!cfg) break;
      const plane = pdsPlaneOf(state);
      pdsPush(state);
      /* Drop new fixtures in a free spot rather than always dead-centre, so
         adding three in a row doesn't stack them into one illegible pile. */
      const spot = pdsFreeSpot(state, cfg.w, cfg.h, plane);
      const maxZ = state.elements.reduce((m, e) => Math.max(m, e.z || 0), 0);
      const el = {
        id: newElId(), zone: state.activeZone, type,
        x: spot.x, y: spot.y, w: cfg.w, h: cfg.h, rot: 0,
        color: cfg.color, label: null, z: maxZ + 1, locked: false,
      };
      state.elements.push(el);
      selection.clear(); selection.add(el.id);
      refresh();
      if (state._openInspector) setTimeout(() => state._openInspector(el.id), 0);
      toast(T.addedElementToast, { type: 'success', desc: T.addedElementDesc });
      break;
    }
    case 'clear-assign': {
      const m = modal({
        tag: T.tagPdS,
        title: T.clearAssignTitle,
        desc: T.clearAssignDesc,
        width: 480,
        body: '',
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button class="kb atlas pds-rail-danger" data-dismiss data-pds-clear-confirm>${T.clearAssignOk}</button>
        `,
      });
      wireDismiss(m);
      const confirm = m?.el?.querySelector('[data-pds-clear-confirm]');
      confirm?.addEventListener('click', () => {
        pdsPush(state);
        state.tables.forEach(t => { pdsSetServerIds(t, []); });
        refresh();
        toast(T.clearAssignDone, { type: 'success', desc: T.clearAssignDoneDesc });
      });
      break;
    }
    case 'add-server': {
      const m = modal({
        tag: T.tagPdS,
        title: T.rosterAddTitle,
        desc: T.rosterAddDesc,
        width: 460,
        body: `
          <div class="kf-group">
            <label class="kf-label">${T.rosterAddLabel}</label>
            <input class="kf-input pds-input" type="text" maxlength="40" data-pds-new-server placeholder="${T.rosterAddPlaceholder}"/>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button data-activation=write class="kb atlas" data-pds-new-server-ok>${T.rosterAddOk}</button>
        `,
      });
      wireDismiss(m);
      const input = m?.el?.querySelector('[data-pds-new-server]');
      try { input?.focus(); } catch (e) {}
      const commit = () => {
        const name = String(input?.value || '').trim();
        if (!name) { input?.focus(); return; }
        pdsPush(state);
        const id = 'sv-' + Date.now().toString(36);
        state.staff.push({ id, name, color: pdsStaffColor(id + name), from: 'local' });
        m?.close?.();
        refresh();
        toast(T.rosterAddDone(name), { type: 'success', desc: T.rosterHint });
      };
      m?.el?.querySelector('[data-pds-new-server-ok]')?.addEventListener('click', commit);
      input?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
      break;
    }
    case 'del-server': {
      const sid = btn.getAttribute('data-pds-sid');
      const sv = state.staff.find(s => s.id === sid);
      if (!sv) break;
      pdsPush(state);
      const freed = state.tables.filter(t => pdsHasServer(t, sid)).length;
      state.tables.forEach(t => { if (pdsHasServer(t, sid)) pdsSetServerIds(t, pdsServerIds(t).filter(id => id !== sid)); });
      state.staff = state.staff.filter(s => s.id !== sid);
      refresh();
      toast(T.rosterRemoveDone(sv.name), { type: 'info', desc: T.rosterRemoveDoneDesc(freed) });
      break;
    }
    case 'rotate-configure': {
      const r0 = state.rotation || {};
      let chosenP = ['shift', 'daily', 'weekly'].includes(r0.period) ? r0.period : 'shift';
      let chosenS = ['zones', 'tables', 'pairs'].includes(r0.strategy) ? r0.strategy : 'zones';
      let auto = !!r0.auto;
      let pairs = (Array.isArray(r0.pairs) ? r0.pairs : []).filter(p => Array.isArray(p)).map(p => p.slice(0, 2));
      const staffOpts = (sel) => `<option value="">·</option>` + state.staff.map(x => `<option value="${pdsEsc(x.id)}" ${x.id === sel ? 'selected' : ''}>${pdsEsc(x.name)}</option>`).join('');
      const pairsHtml = () => `
        <div class="pds-pairs" data-pds-pairs ${chosenS === 'pairs' ? '' : 'hidden'}>
          <label class="kf-label">${pdsEsc(T.rotPairsPick)}</label>
          ${pairs.map((p, i) => `<div class="pds-pair-row" data-pds-pair="${i}">
              <select class="kf-input pds-input" data-pds-pair-a>${staffOpts(p[0])}</select>
              <span aria-hidden="true">⇄</span>
              <select class="kf-input pds-input" data-pds-pair-b>${staffOpts(p[1])}</select>
              <button class="pds-chip-x" type="button" data-pds-pair-del aria-label="${pdsEsc(T.versionDelete)}">×</button>
            </div>`).join('')}
          <button data-activation=write class="kb ghost" type="button" data-pds-pair-add>${pdsEsc(T.rotPairsAdd)}</button>
        </div>`;
      const m = modal({
        tag: T.tagPdS,
        title: T.rotateTitle,
        desc: T.rotateDesc,
        width: 600,
        body: `
          <div class="pds-rot-cfg">
            <label class="pds-toggle-row">
              <input type="checkbox" role="switch" data-pds-rot-auto ${auto ? 'checked' : ''}/>
              <span><b>${pdsEsc(T.rotateEnable)}</b><em data-pds-rot-auto-desc></em></span>
            </label>
            <div class="kf-group">
              <label class="kf-label">${T.rotatePeriod}</label>
              <div class="pds-pillrow" data-pds-period>
                ${[['shift', T.rotateShift], ['daily', T.rotateDaily], ['weekly', T.rotateWeekly]].map(([k, l]) => `
                  <button data-activation=write class="pds-cfg-pill ${chosenP === k ? 'active' : ''}" data-pds-p="${k}">${pdsEsc(l)}</button>
                `).join('')}
              </div>
            </div>
            <div class="kf-group">
              <label class="kf-label">${T.rotateStrategy}</label>
              <div class="pds-strat-cards" data-pds-strat>
                ${[['zones', T.rotZones, T.rotZonesDesc], ['tables', T.rotTables, T.rotTablesDesc], ['pairs', T.rotPairs, T.rotPairsDesc]].map(([k, l, d]) => `
                  <button data-activation=write class="pds-strat-card ${chosenS === k ? 'active' : ''}" data-pds-s="${k}">
                    <b>${pdsEsc(l)}</b>
                    <em>${pdsEsc(d)}</em>
                  </button>
                `).join('')}
              </div>
            </div>
            <div data-pds-pairs-host>${pairsHtml()}</div>
          </div>
        `,
        foot: `
          <button class="kb ghost" data-dismiss>${T.cancel}</button>
          <button class="kb atlas" data-pds-rot-apply>${T.rotApply}</button>
        `,
      });
      wireDismiss(m);
      if (!m || !m.el) break;
      const autoDesc = () => {
        const d = m.el.querySelector('[data-pds-rot-auto-desc]');
        if (d) d.textContent = auto ? T.rotateAuto(chosenP === 'daily' ? T.rotateAutoDaily : chosenP === 'weekly' ? T.rotateAutoWeekly : T.rotateAutoShift) : T.rotateOff;
      };
      const readPairs = () => {
        pairs = [...m.el.querySelectorAll('[data-pds-pair]')].map(row => [
          row.querySelector('[data-pds-pair-a]').value, row.querySelector('[data-pds-pair-b]').value]);
      };
      const wirePairs = () => {
        const host = m.el.querySelector('[data-pds-pairs-host]');
        if (!host) return;
        host.innerHTML = pairsHtml();
        host.querySelector('[data-pds-pair-add]')?.addEventListener('click', () => { readPairs(); pairs.push(['', '']); wirePairs(); });
        host.querySelectorAll('[data-pds-pair-del]').forEach(b => b.addEventListener('click', () => {
          readPairs(); pairs.splice(+b.closest('[data-pds-pair]').getAttribute('data-pds-pair'), 1); wirePairs();
        }));
        host.querySelectorAll('select').forEach(sel => sel.addEventListener('change', readPairs));
      };
      autoDesc();
      wirePairs();
      m.el.querySelector('[data-pds-rot-auto]')?.addEventListener('change', (e) => { auto = e.target.checked; autoDesc(); });
      m.el.querySelectorAll('[data-pds-p]').forEach(b => {
        b.addEventListener('click', () => {
          chosenP = b.getAttribute('data-pds-p');
          m.el.querySelectorAll('[data-pds-p]').forEach(o => o.classList.toggle('active', o === b));
          autoDesc();
        });
      });
      m.el.querySelectorAll('[data-pds-s]').forEach(b => {
        b.addEventListener('click', () => {
          readPairs();
          chosenS = b.getAttribute('data-pds-s');
          m.el.querySelectorAll('[data-pds-s]').forEach(o => o.classList.toggle('active', o === b));
          if (chosenS === 'pairs' && !pairs.length) pairs.push(['', '']);
          wirePairs();
        });
      });
      m.el.querySelector('[data-pds-rot-apply]')?.addEventListener('click', () => {
        readPairs();
        const clean = pairs.filter(p => p[0] && p[1] && p[0] !== p[1]);
        if (chosenS === 'pairs' && !clean.length) { toast(T.rotPairsNone, { type: 'warn' }); return; }
        pdsPush(state);
        const keepKey = r0.period === chosenP && r0.auto ? r0.lastKey : undefined;
        state.rotation = { period: chosenP, strategy: chosenS, enabled: true, auto, pairs: clean, lastAt: r0.lastAt || 0 };
        /* Switching it on arms it for the NEXT period: nobody's tables move
           the moment the owner saves the settings. */
        state.rotation.lastKey = keepKey || pdsRotationKey(chosenP);
        m.close();
        refresh();
        toast(T.rotApplied, { type: 'success', desc: auto ? T.rotateAuto(chosenP === 'daily' ? T.rotateAutoDaily : chosenP === 'weekly' ? T.rotateAutoWeekly : T.rotateAutoShift) : T.rotateOff });
      });
      break;
    }
    case 'rotate-now': {
      const r = state.rotation || { strategy: 'zones' };
      if (r.strategy !== 'pairs' && state.staff.length < 2) { toast(T.rotNeedStaff, { type: 'warn' }); break; }
      pdsPush(state);
      pdsApplyAssignment(state, pdsRotateStep(state, state.tables, r.strategy, r.pairs));
      pdsRecordRotation(state, 'manual');
      state.rotation = Object.assign({}, r, { lastAt: Date.now() });
      refresh();
      toast(T.rotNowDone, { type: 'success', desc: T.rotNowDoneDesc,
        action: { label: T.undoAction, onClick: () => { if (pdsUndo(state)) refresh(); } } });
      break;
    }
    /* ── Inspector actions ─────────────────────────────────────── */
    /* ── Object actions ────────────────────────────────────────────
     * These used to be table-only. They now resolve through pdsFind, so the
     * same buttons rotate, duplicate, lock and delete a comptoir or a kitchen
     * — the operations the merchant could not previously perform on anything
     * that came out of a scene. The action names keep their `table-` prefix
     * because the inspector markup and the keyboard bindings both reference
     * them; renaming would be churn for no behaviour change. */
    case 'table-rotate':
    case 'rot-90': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f || f.o.locked) break;
      pdsPush(state);
      const step = action === 'rot-90' ? 90 : 45;
      f.o.rot = ((f.o.rot || 0) + step) % 360;
      refresh();
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
    case 'ambiance': {
      const key = btn.getAttribute('data-pds-amb');
      pdsPush(state);
      if (pdsApplyAmbiance(state, state.activeZone, key)) {
        refresh();
        toast(T.ambianceApplied(T['amb' + key]), { type: 'success', desc: T.ambianceDesc });
      }
      break;
    }
    case 'table-duplicate': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f) break;
      pdsPush(state);
      if (f.table) {
        /* The copy takes the next free number. « 4· » was a number nobody
           could type on the till. */
        const newT = { ...f.o, id: newTableId(), x: f.o.x + 24, y: f.o.y + 24, num: pdsNextNum(state) };
        delete newT.group;
        pdsSetStatus(newT, 'free');
        state.tables.push(newT);
        selection.clear(); selection.add(newT.id);
        refresh();
        toast(T.addedTableToast(newT.num), { type: 'success', desc: T.addedTableDesc(pdsGeom(newT).seats, state.zones.find(z=>z.id===newT.zone)?.name || '') });
      } else {
        const maxZ = state.elements.reduce((m, e) => Math.max(m, e.z || 0), 0);
        const newE = { ...f.o, id: newElId(), x: f.o.x + 24, y: f.o.y + 24, z: maxZ + 1 };
        state.elements.push(newE);
        selection.clear(); selection.add(newE.id);
        refresh();
        toast(T.addedElementToast, { type: 'success', desc: T.addedElementDesc });
      }
      break;
    }
    case 'table-delete': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f) break;
      pdsPush(state);
      if (f.table) {
        const affected = f.o.group ? state.tables.filter(t => t.group === f.o.group) : [f.o];
        const snapshot = pdsTableSnapshot(state, affected);
        const title = `Table ${f.o.num} · ${T.deletedSuffix}`;
        state.tables.splice(state.tables.findIndex(o => o.id === id), 1);
        if (typeof pdsBury === 'function') pdsBury(state, id);
        pdsSweepGroups(state);
        selection.delete(id);
        refresh();
        pdsOfferTableUndo(state, T, snapshot, refresh, selection, title, T.deleteUndone, id);
        break;
      } else {
        state.elements.splice(state.elements.findIndex(o => o.id === id), 1);
        if (typeof pdsBury === 'function') pdsBury(state, id);
        toast(`${T['fix'+f.o.type] || f.o.type} · ${T.deletedSuffix}`, { type: 'warn', duration: 1400 });
      }
      selection.delete(id);
      refresh();
      break;
    }
    case 'table-group': {
      /* Arme le mode « choisir la seconde table » — le pointerdown de la
       * table cliquée ensuite fait la liaison (voir pdsAttachDrag). */
      const id = btn.getAttribute('data-pds-id');
      state._groupPickFrom = id;
      toast(T.groupPickHint, { duration: 2600 });
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
    case 'table-ungroup': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f || !f.table || !f.o.group) break;
      pdsPush(state);
      const gid = f.o.group;
      const snapshot = pdsTableSnapshot(state, state.tables.filter(tt => tt.group === gid));
      state.tables.forEach(tt => { if (tt.group === gid) delete tt.group; });
      refresh();
      pdsOfferTableUndo(state, T, snapshot, refresh, selection, T.ungroupOk, T.ungroupUndone, id);
      break;
    }
    case 'obj-lock': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f) break;
      pdsPush(state);
      f.o.locked = !f.o.locked;
      refresh();
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
    case 'seats-up':
    case 'seats-down': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f) break;
      pdsPush(state);
      const cur = pdsGeom(f.o).seats;
      f.o.seats = Math.max(0, Math.min(24, cur + (action === 'seats-up' ? 1 : -1)));
      refresh();
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
    case 'layer-back':
    case 'layer-front': {
      const id = btn.getAttribute('data-pds-id');
      const f = pdsFind(state, id);
      if (!f || f.table) break;
      pdsPush(state);
      const zs = state.elements.map(e => e.z || 0);
      f.o.z = action === 'layer-front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
      refresh();
      setTimeout(() => state._openInspector(id), 0);
      break;
    }
    case 'undo': {
      if (!pdsUndo(state)) { toast(T.undoNothing, { type: 'info', duration: 1200 }); break; }
      selection.clear();
      refresh();
      break;
    }
    case 'redo': {
      if (!pdsRedo(state)) { toast(T.redoNothing, { type: 'info', duration: 1200 }); break; }
      selection.clear();
      refresh();
      break;
    }
    /* ── Bulk actions ──────────────────────────────────────────── */
    case 'bulk-align-h': {
      if (selection.size < 2) break;
      pdsPush(state);
      const ids = [...selection];
      const ys = ids.map(id => state.tables.find(t => t.id === id)?.y).filter(v => v != null);
      const avg = Math.round(ys.reduce((a,b) => a+b, 0) / ys.length / PDS_GRID) * PDS_GRID;
      ids.forEach(id => { const t = state.tables.find(tt => tt.id === id); if (t) t.y = avg; });
      refresh();
      toast(T.bulkOkAlign, { type: 'success', duration: 1200 });
      break;
    }
    case 'bulk-align-v': {
      if (selection.size < 2) break;
      pdsPush(state);
      const ids = [...selection];
      const xs = ids.map(id => state.tables.find(t => t.id === id)?.x).filter(v => v != null);
      const avg = Math.round(xs.reduce((a,b) => a+b, 0) / xs.length / PDS_GRID) * PDS_GRID;
      ids.forEach(id => { const t = state.tables.find(tt => tt.id === id); if (t) t.x = avg; });
      refresh();
      toast(T.bulkOkAlign, { type: 'success', duration: 1200 });
      break;
    }
    case 'bulk-dist-h': {
      if (selection.size < 3) { toast(T.bulkHintNone, { type: 'info', duration: 1400 }); break; }
      pdsPush(state);
      const ids = [...selection];
      const arr = ids.map(id => state.tables.find(t => t.id === id)).filter(Boolean).sort((a,b) => a.x - b.x);
      const span = arr[arr.length-1].x - arr[0].x;
      const step = span / (arr.length - 1);
      arr.forEach((t, i) => { t.x = Math.round((arr[0].x + step * i) / PDS_GRID) * PDS_GRID; });
      refresh();
      toast(T.bulkOkDist, { type: 'success', duration: 1200 });
      break;
    }
    case 'bulk-dist-v': {
      if (selection.size < 3) { toast(T.bulkHintNone, { type: 'info', duration: 1400 }); break; }
      pdsPush(state);
      const ids = [...selection];
      const arr = ids.map(id => state.tables.find(t => t.id === id)).filter(Boolean).sort((a,b) => a.y - b.y);
      const span = arr[arr.length-1].y - arr[0].y;
      const step = span / (arr.length - 1);
      arr.forEach((t, i) => { t.y = Math.round((arr[0].y + step * i) / PDS_GRID) * PDS_GRID; });
      refresh();
      toast(T.bulkOkDist, { type: 'success', duration: 1200 });
      break;
    }
    case 'bulk-delete': {
      const n = selection.size;
      const selectedGroups = new Set();
      selection.forEach(id => {
        const t = state.tables.find(tt => tt.id === id);
        if (t && t.group) selectedGroups.add(t.group);
      });
      const affected = state.tables.filter(t => selection.has(t.id) || (t.group && selectedGroups.has(t.group)));
      const snapshot = pdsTableSnapshot(state, affected);
      const firstId = [...selection][0] || null;
      pdsPush(state);
      if (typeof pdsBury === 'function') pdsBury(state, state.tables.filter(t => selection.has(t.id)).map(t => t.id));
      state.tables = state.tables.filter(t => !selection.has(t.id));
      pdsSweepGroups(state);
      selection.clear();
      refresh();
      pdsOfferTableUndo(state, T, snapshot, refresh, selection, T.bulkOkDelete(n), T.deleteUndone, firstId);
      break;
    }
    case 'bulk-group': {
      const picked = state.tables.filter(t => selection.has(t.id));
      if (picked.length < 2) break;
      pdsPush(state);
      const touchedGroups = new Set(picked.map(t => t.group).filter(Boolean));
      const members = state.tables.filter(t => selection.has(t.id) || (t.group && touchedGroups.has(t.group)));
      const anchor = picked.find(t => t.group) || picked[0];
      const gid = anchor.group || ('grp' + Date.now().toString(36));
      members.forEach(t => { t.group = gid; });
      pdsSyncGroupService(state, gid, anchor);
      refresh();
      toast(T.bulkOkGroup(members.length), { type: 'success' });
      setTimeout(() => state._openBulkInspector(), 0);
      break;
    }
    case 'bulk-clear': {
      selection.clear();
      root.querySelectorAll('.pds-tbl-cell.is-selected').forEach(el => el.classList.remove('is-selected'));
      state._openBulkInspector();
      break;
    }
    case 'bulk-status': {
      const st = btn.getAttribute('data-pds-status');
      const n = selection.size;
      const gids = new Set();
      pdsPush(state);
      selection.forEach(id => {
        const t = state.tables.find(tt => tt.id === id);
        if (!t) return;
        pdsSetStatus(t, st);
        if (t.group) gids.add(t.group);
      });
      /* Le statut déborde sur les partenaires de groupe hors sélection. */
      state.tables.forEach(tt => {
        if (tt.group && gids.has(tt.group) && !selection.has(tt.id)) pdsSetStatus(tt, st);
      });
      refresh();
      toast(T.bulkOkStatus(n, pdsStatusLabel(st, T)), { type: 'success', duration: 1400 });
      break;
    }
    /* 'set-scene' retired with PDS_SCENES — the room is four editable
       properties now, wired through [data-pds-room-field]. */
    case 'deselect': {
      /* Close inspector × button — clears the current selection and returns
       *   to the empty inspector / décor picker pane. */
      selection.clear();
      root.querySelectorAll('.pds-tbl-cell.is-selected').forEach(el => el.classList.remove('is-selected'));
      state._openBulkInspector();
      break;
    }
    default: {
      Kiwi.toast(action, { type: 'info', desc: T.soonAvailable, duration: 1400 });
    }
  }
}

/* ═══ INLINE CSS · scoped to .pds-* ══════════════════════════════════ */
const PDS_INLINE_CSS = `
  .pds-host :focus-visible { outline:2px solid var(--atlas); outline-offset:2px; }
  .pds-kpis { margin-bottom: 14px; }
  .pds-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap; }
  .pds-modes { display:flex; gap:4px; padding:3px; background:var(--paper-soft); border:1px solid var(--n-200); border-radius:11px; }
  .pds-mode { background:transparent; border:none; padding:8px 14px; border-radius:8px; font-size:12.5px; font-weight:500; color:var(--n-600); cursor:pointer; transition:.18s letter-spacing:0.01em; }
  .pds-mode:hover { color:var(--ink); }
  .pds-mode.active { background:var(--inverse-surface); color:var(--inverse-ink); font-weight:600; box-shadow:0 1px 2px rgba(10,15,13,0.16); }
  .pds-mode-desc { flex:1; font-size:12px; color:var(--n-600); padding:0 6px; min-width:240px; }
  .pds-zone-tabs { display:flex; gap:4px; padding:3px; background:var(--paper-soft); border:1px solid var(--n-200); border-radius:10px; }
  .pds-zone { background:transparent; border:none; padding:7px 12px; border-radius:7px; font-size:12px; font-weight:500; color:var(--n-700); cursor:pointer; display:flex; align-items:center; gap:6px; transition:.16s; }
  .pds-zone em { font-style:normal; font-family:var(--mono); font-size:11px; color:var(--n-500); }
  .pds-zone:hover { color:var(--ink); }
  .pds-zone.active { background:var(--paper); color:var(--ink); box-shadow:0 1px 3px rgba(10,15,13,0.08); font-weight:600; }
  .pds-zone.active em { color:var(--atlas); font-weight:600; }
  .pds-zone-add { padding:7px 10px; color:var(--atlas); font-weight:700; font-size:14px; }
  .pds-zone-add:hover { background:var(--paper); }

  /* align-items:start est la moitié qui compte : une piste de grille s'étire
     par défaut à la hauteur de la plus haute, et la palette fait deux mille
     six cents pixels. Le plan partait donc hors de l'écran dès qu'on
     descendait chercher une plante. Les deux colonnes latérales défilent
     maintenant chez elles, et le plan ne bouge plus. */
  .pds-stage-grid { display:grid; grid-template-columns: 220px 1fr 240px; gap:14px; align-items:start; }
  @media (max-width: 1100px) { .pds-stage-grid { grid-template-columns: 200px 1fr; } .pds-inspector { grid-column: 1 / -1; } }

  /* overscroll-behavior:contain arrête la chaîne : arrivé en bas de la
     palette, la molette ne repart pas dans le tiroir. C'est ce report-là
     qui donnait la sensation de défilement sans fin. */
  .pds-rail, .pds-inspector {
    position:sticky; top:0;
    max-height:calc(100vh - 210px); min-height:320px;
    overflow-y:auto; overscroll-behavior:contain;
    padding-right:4px; scrollbar-width:thin;
  }
  /* Sous 1100px l'inspecteur devient une rangée pleine largeur sous le plan :
     le coller ou le plafonner n'a plus de sens, il suit le flux. La palette,
     elle, garde son propre défilement · c'est elle qui fait deux mille pixels,
     à toutes les largeurs. */
  @media (max-width: 1100px) {
    .pds-rail { position:static; max-height:calc(100vh - 260px); }
    .pds-inspector { position:static; max-height:none; min-height:0; overflow:visible; }
  }

  .pds-rail { display:flex; flex-direction:column; gap:10px; }
  .pds-rail-card { background:var(--paper-soft); border:1px solid var(--n-200); border-radius:12px; padding:14px; }
  html[data-theme="dark"] .pds-rail-card { background:var(--paper-muted); }
  .pds-rail-title { font-size:11px; font-family:var(--mono); letter-spacing:0.1em; color:var(--n-500); text-transform:uppercase; margin-bottom:6px; }
  .pds-rail-hint { font-size:11.5px; color:var(--n-600); line-height:1.45; margin-bottom:10px; }
  .pds-rail-cta { width:100%; margin-bottom:6px; justify-content:center; }
  .pds-rail-cta:last-child { margin-bottom:0; }
  .pds-rail-danger { color:var(--danger); }
  .pds-rail-danger:hover { border-color:var(--danger); }

  .pds-palette { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
  .pds-palette-el { grid-template-columns:1fr; }
  .pds-pal-item { background:var(--paper); border:1px solid var(--n-200); border-radius:9px; padding:8px 6px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; cursor:pointer; font-family:inherit; transition:.16s; min-height:62px; }
  .pds-pal-item:hover { border-color:var(--atlas); transform:translateY(-1px); box-shadow:0 4px 12px -8px rgba(11,110,79,0.3); }
  .pds-pal-shape { background:var(--n-200); border:1.5px solid var(--n-400); display:block; }
  .pds-pal-round { border-radius:50%; }
  .pds-pal-square { border-radius:3px; }
  .pds-pal-rect { border-radius:3px; }
  .pds-pal-label { font-size:11px; color:var(--n-700); font-weight:500; letter-spacing:0.01em; text-align:center; }
  .pds-pal-icon { width:24px; height:24px; }
  .pds-pal-el-wall { background:#2C2520; height:5px !important; margin-top:9px; width:24px; }
  .pds-pal-el-door { background:var(--atlas); height:5px !important; margin-top:9px; width:18px; border-radius:1px; }
  .pds-pal-el-window { background:#1A8FE3; height:4px !important; margin-top:10px; width:22px; border-radius:1px; }
  .pds-pal-el-column { background:#2C2520; width:14px !important; height:14px !important; margin-top:5px; border-radius:50%; }
  .pds-pal-el-plant { background:radial-gradient(circle, #0B8A7B 0 60%, transparent 65%); width:20px !important; height:20px !important; margin-top:2px; }

  .pds-canvas-wrap { display:flex; flex-direction:column; gap:10px; min-width:0; }
  .pds-canvas-bar { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; background:var(--paper-soft); border:1px solid var(--n-200); border-radius:10px; flex-wrap:wrap; }
  .pds-legend { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .pds-legend-title { font-size:11px; font-family:var(--mono); letter-spacing:0.1em; color:var(--n-500); text-transform:uppercase; margin-right:4px; }
  .pds-legend-item { display:inline-flex; align-items:center; gap:6px; color:rgba(10,15,13,0.64); font:400 11px/1.2 var(--font-ui, 'Inter Tight'), system-ui; letter-spacing:-0.01em; }
  /* Légende jour : les mêmes cases 17 × 13 rx 4 que la nuit, à l'encre sur
     papier · l'atlas ne s'allume que pour l'occupée, comme dans la scène. */
  .pds-legend-swatch { width:17px; height:13px; border-radius:4px; display:inline-block; border:1.25px solid transparent; }
  .pds-sw-free      { background:rgba(10,15,13,0.015); border-color:rgba(10,15,13,0.30); }
  .pds-sw-occupied  { background:rgba(11,110,79,0.10); border-color:#0B6E4F; }
  .pds-sw-reserved  { background:rgba(200,146,53,0.10); border-style:dashed; border-color:#C89235; }
  .pds-sw-cleaning  { background:rgba(10,15,13,0.02); border-style:dotted; border-color:rgba(10,15,13,0.45); }
  .pds-pill { font-size:11px; font-family:var(--mono); letter-spacing:0.06em; padding:3px 8px; border-radius:99px; text-transform:uppercase; font-weight:600; border:1px solid transparent; }
  .pds-pill-free { background:rgba(10,15,13,0.06); color:var(--n-700); }
  .pds-pill-occupied { background:rgba(11,110,79,0.14); color:var(--atlas); }
  /* Les mêmes traits que le plan : tiret riad pour réservée, pointillé encre
     pour à nettoyer · plus d'ambre ni de bleu que le plan ne peint jamais. */
  .pds-pill-reserved { background:rgba(232,200,138,0.18); color:#7D5A1A; border:1px dashed rgba(200,146,53,0.65); }
  .pds-pill-cleaning { background:rgba(10,15,13,0.02); color:var(--n-700); border:1px dotted rgba(10,15,13,0.45); }
  .pds-snap { display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:var(--n-700); cursor:pointer; user-select:none; padding:4px 8px; border-radius:7px; }
  .pds-snap input { accent-color:var(--atlas); }

  /* ═════ ARCHITECTURAL ROOM · mirrors kiwi-caisse plan de salle ═════════════
     A cream "paper" floor framed by a 1.5px ink border with an inset highlight
     and a soft warm shadow. SVG backdrop draws the fixtures (comptoir,
     escalier, plantes, fenêtres). The inner .pds-canvas absorbs all the
     pointer events for table dragging · it is positioned over the SVG. */
  .pds-plan-canvas { position:relative; display:flex; flex-direction:column; gap:6px; min-width:0; min-height:0; }
  /* The room is a RESPONSIVE box; the stage inside it is a FIXED logical
     ${PDS_CANVAS_W}×${PDS_CANVAS_H} space scaled to fit (see .pds-plan-scale).
     It used to be a hard ${PDS_CANVAS_W}px wide with max-width:100%, so below
     ~1490px of viewport the room narrowed while the absolutely-positioned
     tables kept their px coordinates · and overflow:hidden silently cropped
     everything past the new edge. Scaling instead of cropping means one
     coordinate space at every width, which is also what lets the backdrop
     and the tables finally agree. 1 logical unit = 1 cm. */
  .pds-plan-room {
    position:relative;
    width: 100%;
    max-width: ${PDS_CANVAS_W}px;
    aspect-ratio: ${PDS_CANVAS_W} / ${PDS_CANVAS_H};
    margin: 0 auto;
    /* Scale reference for .pds-plan-scale. Doing this in CSS rather than from a
       JS-set custom property matters: a JS var is a second source of truth that
       goes stale the moment a resize callback is throttled (a hidden tab runs
       neither rAF nor ResizeObserver), and a stale scale silently crops the
       floor. cqw is always current because the browser resolves it. */
    container-type: inline-size;
    border:1.5px solid #2C2520;
    border-radius:16px;
    overflow:hidden;
    background:#FBF7EE;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.7) inset,
      0 0 0 1px rgba(44,37,32,0.06),
      0 18px 40px -32px rgba(20,15,10,0.15);
  }
  .pds-plan-room.is-terrasse {
    border-style:dashed;
    border-color:#A89770;
    background:#F7F2E8;
  }
  /* Fixed logical stage · the backdrop and the tables live on ONE plane that is
     scaled as a whole, so they can never drift apart. 100cqw is the room's own
     width, so dividing it by the logical width yields the exact fit ratio with
     no JS involved. transform-origin is top-left so logical (0,0) stays pinned
     to the room's corner. */
  .pds-plan-scale {
    position:absolute; top:0; left:0;
    width:${PDS_CANVAS_W}px;
    height:${PDS_CANVAS_H}px;
    transform-origin: 0 0;
    transform: scale(calc(100cqw / ${PDS_CANVAS_W}px));
  }
  .pds-plan-room .plan-bg {
    position:absolute; inset:0;
    width:100%; height:100%;
    pointer-events:none; display:block;
  }
  .pds-plan-room .plan-bg * { vector-effect: non-scaling-stroke; }
  .pds-plan-label {
    position:absolute; top:10px; left:16px;
    font-family:var(--sans, "Inter Tight", system-ui, sans-serif);
    font-size:11px; font-weight:600;
    color:#1A1F1C;
    letter-spacing:0.16em;
    text-transform:uppercase;
    z-index:4;
    pointer-events:none;
  }
  .pds-plan-label em {
    font-family:"Inter Tight", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
     font-weight:400;
    text-transform:none;
    color:#5C5447;
    letter-spacing:0;
    margin-left:6px;
    font-size:13px;
  }
  .pds-plan-room.is-terrasse .pds-plan-label { color:#1F4A38; }
  .pds-plan-footer {
    display:flex; justify-content:flex-end; align-items:center;
    padding:2px 6px;
    font-size:11px; color:#5C5447;
    letter-spacing:0.04em;
    font-feature-settings:"tnum" 1;
    flex:0 0 auto;
  }
  .pds-plan-floor-count { font-family:var(--mono); }

  /* The canvas sits ON TOP of the SVG backdrop, transparent, capturing
     pointer events for table dragging. Same dimensions as plan-room. */
  .pds-canvas {
    position:absolute;
    inset:0;
    margin:0;
    border:none; border-radius:14px;
    overflow:visible;
    touch-action:none; user-select:none;
    background:transparent;
    z-index:2;
  }

  .pds-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; text-align:center; padding:20px; background:rgba(255,255,255,0.7); border-radius:14px; z-index:3; backdrop-filter: blur(2px); }
  .pds-empty h4 { margin:0; font-size:18px; letter-spacing:-0.02em; color:var(--ink); }
  .pds-empty p { font-size:13px; color:var(--n-600); max-width:340px; margin:0; line-height:1.5; }

  /* ═════ TABLES · architectural language mirrored from kiwi-caisse ═══════
     Tables are absolute on the canvas. Each .pds-tbl-cell contains:
       • .pds-tbl · the tabletop (wood/marble vibe via shadows)
       • .pds-tbl-num · large bold number
       • .pds-tbl-covers·seat count (instrument serif, roman)
       • .pds-tbl-chairs / .pds-chair · chair pills around the table
       • .pds-tbl-server · corner badge with server initials + color        */
  .pds-tbl-cell {
    position:absolute;
    cursor:pointer; user-select:none;
    transition: transform 150ms ease, filter 150ms ease;
    z-index:2;
  }
  .pds-tbl-cell:hover { transform: translateY(-1px); filter: brightness(1.02); }
  .pds-tbl-cell:active { transform: translateY(0); }
  .pds-tbl-cell:focus-visible { outline: 2px solid var(--atlas); outline-offset: 3px; border-radius: 8px; }

  .pds-tbl-chairs {
    position:absolute;
    display:flex; justify-content:center; gap:5px;
    pointer-events:none;
  }
  .pds-tbl-chairs-top    { left:6px; right:6px; top:-9px;   height:7px; }
  .pds-tbl-chairs-bottom { left:6px; right:6px; bottom:-9px; height:7px; }
  .pds-chair {
    flex:0 1 16px; min-width:8px; max-width:22px;
    height:100%;
    background:linear-gradient(180deg, #8C8377 0%, #5F574C 100%);
    border-radius:3px;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.25) inset,
      0 1px 1.5px rgba(20,15,10,0.18);
  }
  .pds-tbl-chairs-ring { position:absolute; inset:-8px; pointer-events:none; }
  .pds-chair-radial {
    position:absolute; top:50%; left:50%;
    width:16px; height:7px;
    margin:-3.5px 0 0 -8px;
    background:linear-gradient(180deg, #8C8377 0%, #5F574C 100%);
    border-radius:3px;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.25) inset,
      0 1px 1.5px rgba(20,15,10,0.18);
    transform-origin:center;
  }

  /* Tabletop */
  .pds-tbl {
    position:relative;
    width:100%; height:100%;
    border-radius:7px;
    padding:4px 6px;
    display:flex; flex-direction:column; justify-content:space-between;
    transition: background-color 200ms ease, border-color 200ms ease, color 200ms ease;
    overflow:hidden;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.6) inset,
      0 2px 4px -1px rgba(20,15,10,0.14),
      0 1px 2px rgba(20,15,10,0.06);
  }
  .pds-tbl-cell.pds-is-round .pds-tbl {
    border-radius:50%;
    padding:12% 14%;
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    text-align:center; gap:1px;
    box-shadow:
      0 1px 0 rgba(255,255,255,0.7) inset,
      0 0 0 1px rgba(44,37,32,0.04) inset,
      0 3px 6px -1px rgba(20,15,10,0.18),
      0 1px 2px rgba(20,15,10,0.06);
  }
  .pds-tbl-cell.pds-is-round .pds-tbl-head {
    text-align:center;
    flex-direction:column;
    align-items:center; justify-content:center;
    gap:2px;
  }
  .pds-tbl-cell.pds-is-round .pds-tbl-server {
    top:-8px; right:auto;
    left:50%; transform:translateX(-50%);
  }
  .pds-tbl-cell.pds-is-round .pds-tbl-servers { top:-8px; right:50%; transform:translateX(50%); }
  .pds-tbl-cell.pds-is-round .pds-tbl-servers .pds-tbl-server {
    top:auto; right:auto; left:auto; transform:none;
  }
  .pds-tbl-cell.pds-is-square .pds-tbl { border-radius:4px; }
  .pds-tbl-cell.pds-is-bar    .pds-tbl { border-radius:4px; }

  .pds-tbl-head {
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    gap:1px; flex:1;
    font-feature-settings:"tnum" 1;
  }
  .pds-tbl-num    { font-weight:700; letter-spacing:0.01em; font-size:17px; line-height:1; color:inherit; }
  .pds-tbl-covers { font-family:"Inter Tight", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; font-weight:400; font-size:12px; line-height:1; opacity:0.7; }

  /* Status color encodings · mirrors caisse khawya / ka-yaklo etc. */
  .pds-tbl[data-status="free"] {
    background:var(--surface);
    border:1.5px solid #C8C5BD;
    color:#1A1F1C;
  }
  .pds-tbl[data-status="free"] .pds-tbl-num    { color:#4A453E; }
  .pds-tbl[data-status="free"] .pds-tbl-covers { color:#968D7F; }

  .pds-tbl[data-status="occupied"] {
    background:#EBF5F0;
    border:1.5px solid #C5E0D3;
    color:#1F5D3C;
  }
  .pds-tbl[data-status="occupied"] .pds-tbl-num    { color:#1F5D3C; }
  .pds-tbl[data-status="occupied"] .pds-tbl-covers { color:#437B5C; }

  .pds-tbl[data-status="reserved"] {
    background:#FFF1D6;
    border:1.5px solid #E8C88A;
    color:#7D5A1A;
  }
  .pds-tbl[data-status="reserved"] .pds-tbl-num    { color:#7D5A1A; }
  .pds-tbl[data-status="reserved"] .pds-tbl-covers { color:#A88A4C; }

  .pds-tbl[data-status="cleaning"] {
    background:#1F5D3C;
    border:1.5px solid transparent;
    color:#fff;
  }
  .pds-tbl[data-status="cleaning"] .pds-tbl-num    { color:#fff; }
  .pds-tbl[data-status="cleaning"] .pds-tbl-covers { color:rgba(255,255,255,0.78); }

  /* Selection · green outline ring (does not touch the table shape) */
  .pds-tbl-cell.is-selected .pds-tbl {
    box-shadow:
      0 0 0 3px rgba(11,110,79,0.28),
      0 1px 0 rgba(255,255,255,0.6) inset,
      0 2px 4px -1px rgba(20,15,10,0.14);
  }
  .pds-tbl-cell.is-dragging { z-index:5; cursor:grabbing; }
  .pds-tbl-cell.is-dragging .pds-tbl { box-shadow: 0 14px 30px -10px rgba(10,15,13,0.32); }

  /* Server color overlay (assign mode) · picks server color for tabletop border */
  .pds-tbl-cell.pds-has-server .pds-tbl { border-color: var(--pds-server, currentColor); border-width:2px; }

  /* Server badge · caisse style: circle pinned to corner, white ring */
  /* Read aloud, never painted: the table's spoken name around its number. */
  .pds-sr { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0; }
  .pds-tbl-server {
    position:absolute;
    top:-10px; right:-10px;
    width:26px; height:26px; border-radius:50%;
    font-size:11px; font-weight:700; color:#fff;
    display:inline-flex; align-items:center; justify-content:center;
    border:2.5px solid #fff;
    box-shadow:
      0 2px 5px rgba(20,15,10,0.22),
      0 0 0 1px rgba(20,15,10,0.06);
    letter-spacing:0.02em;
    z-index:3;
    pointer-events:none;
    font-family:var(--sans, "Inter Tight", system-ui, sans-serif);
  }
  .pds-tbl-servers {
    position:absolute; top:-10px; right:-10px; display:flex; flex-direction:row-reverse;
    z-index:3; pointer-events:none;
  }
  .pds-tbl-servers .pds-tbl-server { position:relative; top:auto; right:auto; }
  .pds-tbl-servers .pds-tbl-server + .pds-tbl-server { margin-right:-8px; }
  .pds-server-slot + .pds-server-slot { margin-top:6px; }

  .pds-el { position:absolute; background: var(--n-700); border-radius:2px; cursor:grab; will-change: transform; }
  .pds-el.pds-el-wall { background:#2C2520; height:8px; box-shadow:inset 0 0 0 1px rgba(0,0,0,0.2); }
  .pds-el.pds-el-door { background:var(--atlas); border-radius:2px; height:8px; }
  .pds-el.pds-el-window { background:linear-gradient(180deg,#1A8FE3,#0F6FBF); height:6px; border-radius:2px; }
  .pds-el.pds-el-column { background:#2C2520; border-radius:50%; box-shadow:0 0 0 2px rgba(255,255,255,0.5) inset; }
  .pds-el.pds-el-plant { background:radial-gradient(circle, #0B8A7B 0 60%, transparent 65%); border-radius:50%; }
  .pds-el.is-dragging { cursor:grabbing; z-index:4; }

  .pds-inspector { display:flex; flex-direction:column; gap:10px; }
  .pds-inspect { padding:14px; }
  .pds-inspect-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; }
  .pds-inspect-head .pds-rail-title { margin-bottom:0; }
  .pds-inspect-close {
    background:transparent; border:1px solid var(--n-200); border-radius:7px;
    width:24px; height:24px; padding:0;
    display:inline-flex; align-items:center; justify-content:center;
    cursor:pointer; color:var(--n-600); transition:.16s;
    flex-shrink:0;
  }
  .pds-inspect-close:hover { background:var(--paper); color:var(--ink); border-color: var(--n-400); }
  .pds-inspect-close:active { transform:translateY(1px); }
  .pds-inspect-close svg { display:block; }
  .pds-form-row { margin-bottom:10px; }
  .pds-form-row > label { display:block; font-size:11px; font-family:var(--mono); letter-spacing:0.1em; color:var(--n-500); text-transform:uppercase; margin-bottom:5px; font-weight:600; }
  .pds-input { width:100%; padding:7px 9px; font-size:12.5px; }
  .pds-resv-fields { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(96px,.65fr); gap:7px; margin:-2px 0 10px; }
  .pds-resv-field { min-width:0; }
  .pds-resv-field > span { display:block; margin-bottom:5px; color:#0B6E4F; font:500 9.5px/1.2 var(--mono, 'JetBrains Mono'); letter-spacing:0.07em; text-transform:uppercase; }
  .pds-resv-field .pds-input { min-width:0; height:32px; padding:6px 8px; background:#F7F5F0; border-color:rgba(11,110,79,0.34); color:#053B2C; font-size:11.5px; }
  .pds-resv-field .pds-input:focus { border-color:#0B6E4F; box-shadow:0 0 0 2px rgba(11,110,79,0.12); outline:0; }
  .pds-status-pills { display:grid; grid-template-columns:1fr 1fr; gap:4px; }
  .pds-status-pill { padding:6px 8px; border:1.5px solid transparent; background:transparent; border-radius:7px; font-size:11px; font-weight:600; cursor:pointer; font-family:var(--mono); letter-spacing:0.04em; text-transform:uppercase; transition:.16s; }
  .pds-status-pill.pds-pill-free { background:rgba(10,15,13,0.06); color:var(--n-700); border-color:transparent; }
  .pds-status-pill.pds-pill-occupied { background:rgba(11,110,79,0.10); color:var(--atlas); }
  .pds-status-pill.pds-pill-reserved { background:rgba(232,200,138,0.14); color:#7D5A1A; border-style:dashed; border-color:rgba(200,146,53,0.55); }
  .pds-status-pill.pds-pill-cleaning { background:rgba(10,15,13,0.02); color:var(--n-700); border-style:dotted; border-color:rgba(10,15,13,0.40); }
  .pds-status-pill:hover { transform:translateY(-1px); }
  .pds-status-pill.active { border-color: currentColor; box-shadow:0 0 0 1px currentColor inset; }
  .pds-inspect-actions { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px; }
  .pds-inspect-actions .kb { padding:7px 8px; font-size:11.5px; justify-content:center; }
  /* Bouton « Grouper » armé : il pulse doucement le temps du choix. */
  .pds-inspect-actions .kb.pds-group-arming { border-color:var(--atlas); color:var(--atlas); animation:pdsGroupArm 1.2s ease-in-out infinite; }
  @keyframes pdsGroupArm { 0%,100% { box-shadow:0 0 0 0 rgba(11,110,79,0); } 50% { box-shadow:0 0 0 3px rgba(11,110,79,0.18); } }

  /* ═════ TABLES GROUPÉES · l'enveloppe « 06 + 07 » du mockup d'accueil ═════
     Un cadre rx 20 qui embrasse les tables liées, une lueur radiale douce,
     et le cachet des numéros combinés au-dessus. Sous les tables, jamais
     cliquable · le groupe est un fait, pas une cible. */
  .pds-group-env { position:absolute; border-radius:20px; border:1.25px solid rgba(11,110,79,0.45); background:rgba(11,110,79,0.05); pointer-events:none; z-index:0; }
  .pds-group-env::before { content:''; position:absolute; inset:-30%; border-radius:50%; background:radial-gradient(closest-side, rgba(11,110,79,0.10), rgba(11,110,79,0)); z-index:-1; }
  .pds-group-chip { position:absolute; top:-26px; left:50%; transform:translateX(-50%); height:19px; padding:0 10px; border-radius:9.5px; background:var(--paper, #F7F5F0); border:1px solid rgba(11,110,79,0.45); color:#0B6E4F; font:500 10px/19px var(--mono, 'JetBrains Mono'); letter-spacing:0.02em; white-space:nowrap; }
  .pds-group-covers { opacity:0.72; }
  /* Ligne d'info du groupe dans l'inspecteur : un fait, pas un bouton. */
  .pds-group-info { margin-top:8px; padding:7px 10px; border-radius:9px; border:1px dashed rgba(11,110,79,0.35); background:rgba(11,110,79,0.05); color:#0B6E4F; font:500 11px/1.4 var(--mono, 'JetBrains Mono'); letter-spacing:0.01em; }

  .pds-inspect-empty .pds-rail-hint { line-height:1.55; }

  .pds-roster { display:flex; flex-direction:column; gap:5px; }
  .pds-chip { display:flex; align-items:center; gap:9px; padding:8px 10px; background:var(--paper); border:1px solid var(--n-200); border-radius:10px; cursor:grab; transition:.16s; }
  .pds-chip:hover { transform:translateY(-1px); border-color:var(--chip); box-shadow:0 4px 12px -8px var(--chip); }
  .pds-chip.is-dragging { cursor:grabbing; opacity:0.5; }
  .pds-chip-ghost { padding:8px 10px; background:var(--paper); border:1px solid var(--chip); border-radius:10px; transform:translate(-50%, -50%) rotate(-2deg); box-shadow:0 14px 30px -10px rgba(10,15,13,0.45); }
  .pds-chip-dot { width:14px; height:14px; border-radius:50%; background:var(--chip); flex-shrink:0; box-shadow:inset 0 0 0 1.5px rgba(255,255,255,0.4); }
  .pds-chip-body { display:flex; flex-direction:column; line-height:1.25; min-width:0; flex:1; }
  .pds-chip-body b { font-size:12.5px; font-weight:600; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pds-chip-body em { font-style:normal; font-size:11px; color:var(--n-500); font-family:var(--mono); letter-spacing:0.02em; margin-top:1px; }
  .pds-chip-x { flex-shrink:0; width:20px; height:20px; display:grid; place-items:center; padding:0; border:0; border-radius:6px; background:transparent; color:var(--n-500); font-size:15px; line-height:1; cursor:pointer; opacity:0; transition:.16s; }
  .pds-chip:hover .pds-chip-x, .pds-chip-x:focus-visible { opacity:1; }
  @media (hover: none) { .pds-chip-x { opacity:1; width:32px; height:32px; margin:-6px; } }
  .pds-chip-x:hover { background:var(--n-100); color:var(--ink); }
  .pds-chip-ghost .pds-chip-x { display:none; }
  .pds-roster-empty { padding:10px 2px 2px; font-size:11.5px; line-height:1.5; color:var(--n-500); }

  .pds-assign-sum { display:flex; flex-direction:column; gap:4px; margin-top:6px; }
  .pds-asum-row { display:flex; align-items:center; gap:8px; padding:6px 4px; font-size:12px; }
  .pds-asum-dot { width:9px; height:9px; border-radius:50%; background:var(--chip); flex-shrink:0; }
  .pds-asum-name { flex:1; color:var(--ink); }
  .pds-asum-n { font-family:var(--mono); font-size:11.5px; color:var(--n-600); font-weight:600; }
  .pds-asum-unassigned .pds-asum-name { color:var(--n-500); }

  .pds-tpls { display:flex; flex-direction:column; gap:10px; }
  .pds-tpl { background:var(--paper-soft); border:1px solid var(--n-200); border-radius:12px; padding:14px; }
  .pds-tpl-h { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; }
  .pds-tpl-h h4 { margin:0 0 4px; font-size:14.5px; font-weight:600; letter-spacing:-0.015em; }
  .pds-tpl-h p { margin:0; font-size:12px; color:var(--n-600); line-height:1.5; }

  .pds-rotate { display:flex; flex-direction:column; gap:14px; }
  .pds-rotate-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
  @media (max-width: 1100px) { .pds-rotate-grid { grid-template-columns:1fr; } }
  .pds-rot-meta { display:flex; flex-direction:column; gap:6px; margin:6px 0 10px; }
  .pds-rot-meta > div { display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--paper); border:1px solid var(--n-200); border-radius:9px; font-size:12.5px; }
  .pds-rot-lbl { font-size:11px; font-family:var(--mono); letter-spacing:0.08em; color:var(--n-500); text-transform:uppercase; }
  .pds-rot-val { font-weight:600; color:var(--ink); }
  .pds-rot-actions { display:flex; gap:6px; }
  .pds-rot-actions .kb { flex:1; justify-content:center; }
  .pds-rot-preview { display:flex; flex-direction:column; gap:8px; }
  .pds-rot-step { background:var(--paper); border:1px solid var(--n-200); border-radius:10px; padding:10px; }
  .pds-rot-step-h { font-size:11px; font-family:var(--mono); letter-spacing:0.1em; color:var(--atlas); text-transform:uppercase; font-weight:700; margin-bottom:6px; }
  .pds-rot-line { display:grid; grid-template-columns:14px 1fr auto; gap:6px; align-items:center; font-size:11.5px; padding:2px 0; }
  .pds-rot-line .pds-asum-dot { width:9px; height:9px; }
  .pds-rot-line b { font-weight:600; }
  .pds-rot-line em { font-style:normal; font-size:11px; color:var(--n-500); font-family:var(--mono); }

  .pds-fair { display:flex; flex-direction:column; gap:4px; }
  .pds-fair-row { display:grid; grid-template-columns:14px 1fr 70px 36px; gap:6px; align-items:center; font-size:11.5px; }
  .pds-fair-name { font-weight:600; color:var(--ink); }
  .pds-fair-bar { height:5px; background:var(--n-200); border-radius:3px; overflow:hidden; }
  .pds-fair-bar > i { display:block; height:100%; border-radius:3px; }
  .pds-fair-bar .pds-fair-high { background:linear-gradient(90deg, var(--atlas), var(--mint)); }
  .pds-fair-bar .pds-fair-mid { background:linear-gradient(90deg, #D99A2B, #F2C24B); }
  .pds-fair-bar .pds-fair-low { background:linear-gradient(90deg, #C0306E, #E45990); }
  .pds-fair-pct { font-family:var(--mono); font-size:11px; color:var(--n-600); text-align:right; font-weight:600; }
  .pds-fair-note { font-size:11px; color:var(--n-500); padding:0 0 4px 20px; line-height:1.4; }
  .pds-fair-note b { color:var(--ink); }

  .pds-rot-history { padding:14px; }
  .pds-history-grid { display:flex; flex-direction:column; gap:4px; }
  .pds-hist-h, .pds-hist-row { display:grid; grid-template-columns: 100px repeat(7, 1fr); gap:4px; align-items:center; }
  .pds-hist-h > span { font-size:11px; font-family:var(--mono); letter-spacing:0.08em; color:var(--n-500); text-transform:uppercase; text-align:center; }
  .pds-hist-h > span:first-child { text-align:left; }
  .pds-hist-name { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:var(--ink); }
  .pds-hist-cell { height:24px; border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:var(--paper); font-family:var(--mono); }
  .pds-hist-a { background:var(--atlas); }
  .pds-hist-b { background:#D99A2B; color:var(--paper); }
  .pds-hist-c { background:#1A8FE3; }
  .pds-hist-d { background:var(--n-400); color:var(--ink); }

  .pds-rot-cfg { display:flex; flex-direction:column; gap:14px; }
  .pds-pillrow { display:flex; gap:6px; flex-wrap:wrap; }
  .pds-cfg-pill { padding:7px 12px; border:1px solid var(--n-200); background:var(--paper); border-radius:8px; font-size:12px; cursor:pointer; color:var(--n-700); transition:.18s; font-family:inherit; }
  .pds-cfg-pill:hover { border-color:var(--atlas); }
  .pds-cfg-pill.active { background:var(--inverse-surface); color:var(--inverse-ink); border-color:var(--inverse-surface); font-weight:600; }
  .pds-strat-cards { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
  @media (max-width: 720px) { .pds-strat-cards { grid-template-columns:1fr; } }
  .pds-strat-card { background:var(--paper); border:1.5px solid var(--n-200); border-radius:10px; padding:12px; text-align:left; cursor:pointer; transition:.16s; font-family:inherit; }
  .pds-strat-card:hover { border-color:var(--atlas); }
  .pds-strat-card.active { border-color:var(--atlas); background:rgba(11,110,79,0.06); box-shadow:0 0 0 1.5px var(--atlas); }
  .pds-strat-card b { display:block; font-size:13px; font-weight:600; color:var(--ink); margin-bottom:3px; }
  .pds-strat-card em { display:block; font-style:normal; font-size:11.5px; color:var(--n-600); line-height:1.4; }

  .pds-scene-grid { display:grid; grid-template-columns:1fr 1fr; gap:5px; }
  .pds-scene-pill {
    padding:8px 8px;
    background:var(--paper); border:1px solid var(--n-200); border-radius:8px;
    font-size:11.5px; font-weight:500; color:var(--n-700);
    cursor:pointer; transition:.16s; font-family:inherit;
    letter-spacing:-0.005em; text-align:left;
  }
  .pds-scene-pill:hover { border-color:var(--atlas); color:var(--ink); transform: translateY(-1px); }
  .pds-scene-pill.active {
    background:var(--inverse-surface); color:var(--inverse-ink); border-color:var(--inverse-surface);
    font-weight:600; box-shadow:0 1px 2px rgba(10,15,13,0.16);
  }

  .pds-foot { display:flex; justify-content:space-between; align-items:center; gap:8px; width:100%; }
  .pds-foot-meta { font-size:11px; color:var(--n-500); letter-spacing:0.06em; }
  .pds-foot-meta .mono { font-family:var(--mono); }
  .pds-foot-actions { display:flex; gap:8px; }

  html[dir="rtl"] .pds-zone-tabs, html[dir="rtl"] .pds-modes { flex-direction:row-reverse; }

  /* ═══ v2 · object-model floor plan ═══════════════════════════════════════
     Everything below supersedes the v1 table/element rules above. The v1
     rules are left in place because a few of them (cell positioning, rail
     chrome, status pills) are still correct; the ones that are not are
     overridden here by source order. Anything keyed to a v1 fixture type
     (.pds-el-wall, .pds-el-door, …) is inert · those kinds were renamed. */

  /* Floor + walls, driven by zone.room rather than a baked scene. */
  /* Le creux de la pièce est posé en ligne par pdsRoomShell(), avec le mur :
     un box-shadow ici ne pourrait jamais l'emporter sur un style en ligne. */
  .pds-floor {
    position:absolute; inset:0;
    border-radius:14px;
    background-repeat:repeat;
    pointer-events:none;
  }
  .pds-plan-room { border-color:rgba(44,37,32,0.22); background:transparent; }

  /* ── Tables ────────────────────────────────────────────────────────────
     The cell is inflated by --pad on every side to hold the chair band, so
     .pds-tbl-face insets by --pad to sit on the tabletop itself. */
  .pds-tbl-cell {
    transform-origin:50% 50%;
    transition: filter 150ms ease;
  }
  /* Le survol soulève la table. La propriété transform est réservée à la
     rotation et au glisser · la toucher ici décalerait la géométrie·, donc
     l'élévation passe par une ombre portée, qui suit la silhouette SVG et
     non la boîte. */
  .pds-tbl-cell:hover { filter:brightness(1.035) drop-shadow(0 5px 10px rgba(20,15,10,0.20)); }
  .pds-tbl-cell.is-selected  { z-index:6; }
  .pds-tbl-cell.is-resizing  { z-index:7; }
  .pds-tbl-cell.is-locked    { cursor:default; }
  .pds-tbl-svg {
    position:absolute; inset:0; width:100%; height:100%;
    display:block; overflow:visible; pointer-events:none;
  }
  .pds-tbl-face {
    position:absolute; inset:var(--pad, 0px);
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    pointer-events:none; text-align:center;
  }
  .pds-tbl-num    { font:600 15px/1 var(--font-ui, 'Inter Tight'), system-ui; letter-spacing:-0.01em; }
  /* Comme la nuit : seul le numéro habite la table, les couverts ne se
     montrent qu'à l'approche. */
  .pds-tbl-covers { font:400 10px/1 var(--mono, monospace); opacity:0; transition:opacity 180ms ease; margin-top:3px; }
  .pds-tbl-cell:hover .pds-tbl-covers,
  .pds-tbl-cell.is-selected .pds-tbl-covers { opacity:.5; }
  /* L'anneau d'appel pulse dans les deux vues · même géométrie, seule
     l'encre change (menthe la nuit, atlas le jour). Les @keyframes vivent
     dans la couche nuit ; ils sont globaux au document. */
  .pds-noir-call {
    transform-box:fill-box; transform-origin:center;
    animation:pdsNoirCall 2.6s cubic-bezier(.22,.7,.3,1) infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .pds-noir-call { animation:none; opacity:0; }
  }
  /* La pastille « N min » en jour : la même géométrie que la nuit, sur
     papier · jamais de blanc pur. */
  .pds-tbl-since {
    position:absolute; top:calc(var(--pad, 0px) - 24px); left:calc(var(--pad, 0px) - 6px);
    height:19px; padding:0 9px; border-radius:9.5px;
    display:inline-flex; align-items:center;
    background:rgba(247,245,240,0.92); border:1px solid rgba(10,15,13,0.16);
    font:500 10px/1 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.02em; color:rgba(10,15,13,0.66);
    white-space:nowrap; pointer-events:none; z-index:4;
  }
  .pds-resv-chip {
    position:absolute; bottom:calc(var(--pad, 0px) - 24px); left:50%; transform:translateX(-50%);
    height:19px; max-width:calc(100% - 4px); padding:0 9px; border-radius:9.5px;
    display:inline-flex; align-items:center;
    overflow:hidden; text-overflow:ellipsis;
    background:rgba(247,245,240,0.94); border:1px solid rgba(11,110,79,0.42);
    color:#0B6E4F; font:500 10px/1 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.01em; white-space:nowrap; pointer-events:none; z-index:4;
  }

  /* ── Fixtures ──────────────────────────────────────────────────────────
     The v1 rule painted .pds-el itself dark; v2 paints the .pds-el-fill
     child from the instance's own material, so the host must be cleared. */
  .pds-el { background:transparent; border-radius:0; transform-origin:50% 50%; }
  /* overflow:visible, pas hidden : le clip du bâti avalait les tabourets
     du comptoir (cy negatif) dans les deux vues · le trait ne déborde
     nulle part ailleurs, il n'y a plus de texture à contenir. */
  .pds-el-fill { position:absolute; inset:0; background-repeat:repeat; overflow:visible; }
  /* Les tabourets du comptoir se dessinent hors de la boîte du bâti,
     dans les deux vues. */
  .pds-el-svg  { position:absolute; inset:0; width:100%; height:100%; display:block; overflow:visible; }
  .pds-el-label {
    position:absolute; inset:0; padding:2px;
    display:flex; align-items:center; justify-content:center;
    font:500 9px/1.2 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.14em; text-transform:uppercase;
    pointer-events:none; text-align:center; overflow:hidden;
  }
  /* Les pilules BAR / CAISSE portent leur nom à gauche, comme la nuit. */
  .pds-el-comptoir .pds-el-label,
  .pds-el-caisse .pds-el-label { justify-content:flex-start; padding-left:16px; text-align:left; }
  /* Le curseur « grab » annonce le glisser, pas l'édition : rien ne disait
     qu'un comptoir s'ouvre, se redimensionne et se supprime comme une table.
     Le survol le dit maintenant, avec la même élévation que les tables. */
  .pds-el:not(.is-locked):not(.is-dragging):hover {
    filter: drop-shadow(0 4px 9px rgba(20,15,10,0.20));
    outline: 1.5px solid rgba(11,110,79,0.55); outline-offset: 2px;
  }
  .pds-el.is-selected { z-index:60; }
  .pds-el.is-locked   { cursor:default; }

  /* ── Selection · resize + rotate handles ───────────────────────────────
     Inset by --pad so they hug the tabletop, not the chair band. */
  .pds-hdl-layer { position:absolute; inset:var(--pad, 0px); pointer-events:none; }
  .pds-hdl-layer::before {
    content:''; position:absolute; inset:-2px;
    border:1.5px solid var(--atlas); border-radius:4px;
    box-shadow:0 0 0 3px rgba(11,110,79,0.14);
  }
  .pds-hdl {
    position:absolute; width:11px; height:11px; margin:-5.5px 0 0 -5.5px;
    background:var(--paper, #F7F5F0); border:1.5px solid var(--atlas);
    border-radius:2px; pointer-events:auto;
    box-shadow:0 1px 2px rgba(10,15,13,0.28);
  }
  .pds-hdl:hover { background:var(--mint, #7DF2B0); }
  .pds-hdl-nw { top:0;    left:0;    cursor:nwse-resize; }
  .pds-hdl-n  { top:0;    left:50%;  cursor:ns-resize; }
  .pds-hdl-ne { top:0;    left:100%; cursor:nesw-resize; }
  .pds-hdl-e  { top:50%;  left:100%; cursor:ew-resize; }
  .pds-hdl-se { top:100%; left:100%; cursor:nwse-resize; }
  .pds-hdl-s  { top:100%; left:50%;  cursor:ns-resize; }
  .pds-hdl-sw { top:100%; left:0;    cursor:nesw-resize; }
  .pds-hdl-w  { top:50%;  left:0;    cursor:ew-resize; }
  .pds-hdl-rot {
    top:-24px; left:50%; border-radius:50%;
    background:var(--atlas); border-color:var(--paper, #F7F5F0); cursor:grab;
  }
  .pds-hdl-rot::before {
    content:''; position:absolute; left:50%; top:100%;
    width:1.5px; height:14px; margin-left:-0.75px;
    background:var(--atlas); opacity:.55;
  }
  .pds-dim {
    position:absolute; bottom:-21px; left:50%; transform:translateX(-50%);
    font:600 9px/1.7 var(--mono, monospace);
    background:var(--ink, #0A0F0D); color:var(--paper, #F7F5F0);
    padding:1px 6px; border-radius:3px; white-space:nowrap;
  }
  .pds-locked {
    position:absolute; top:2px; right:2px;
    display:grid; place-items:center;
    width:16px; height:16px; border-radius:4px;
    background:rgba(10,15,13,0.72); color:var(--paper, #F7F5F0);
  }

  /* ── Inspector + room controls ─────────────────────────────────────────*/
  .pds-sw-row { display:flex; flex-wrap:wrap; gap:4px; }
  .pds-sw {
    width:20px; height:20px; border-radius:5px; cursor:pointer;
    border:1.5px solid rgba(44,37,32,0.20); padding:0;
    transition: transform 150ms cubic-bezier(0.34, 1.45, 0.5, 1), box-shadow 150ms ease;
  }
  .pds-sw:hover  { transform:scale(1.12); }
  .pds-sw.active { box-shadow:0 0 0 2px var(--paper, #F7F5F0), 0 0 0 3.5px var(--atlas); }
  .pds-mini-label {
    display:block; margin:9px 0 4px;
    font:600 10px/1 var(--mono, monospace);
    letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500);
  }
  .pds-num-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-top:8px; }
  .pds-num-grid.pds-num-4 { grid-template-columns:repeat(4, 1fr); margin-top:0; }
  .pds-num-grid > label {
    display:flex; flex-direction:column; gap:3px;
    font:600 9.5px/1 var(--mono, monospace);
    letter-spacing:0.08em; text-transform:uppercase; color:var(--n-500);
  }
  .pds-num-grid input { width:100%; padding:5px 6px; font-size:12px; text-align:center; }
  .pds-unit { font:400 9.5px/1 var(--mono, monospace); color: var(--n-500); letter-spacing:0.06em; text-transform:none; }
  .pds-step { display:flex; align-items:center; gap:5px; }
  .pds-step-val { flex:1; text-align:center; padding:5px 4px; }
  .pds-step-btn {
    width:26px; height:26px; flex:none;
    display:grid; place-items:center;
    border:1px solid var(--n-200); border-radius:7px;
    background:var(--surface); cursor:pointer;
    font:600 12px/1 var(--font-ui, system-ui); color:var(--ink);
  }
  .pds-step-btn:hover { background:var(--paper-muted); border-color:var(--atlas); }
  .pds-rot-row { display:flex; align-items:center; gap:8px; }
  .pds-range { flex:1; accent-color:var(--atlas); }
  .pds-actions-tight { margin-top:0; }

  /* ── Canvas toolbar ────────────────────────────────────────────────────*/
  .pds-bar-tools { display:flex; align-items:center; gap:6px; }
  .pds-tool {
    width:26px; height:26px; flex:none;
    display:grid; place-items:center;
    border:1px solid var(--n-200); border-radius:7px;
    background:var(--surface); color:var(--n-600); cursor:pointer;
  }
  .pds-tool:hover { background:var(--paper-muted); color:var(--atlas); border-color:var(--atlas); }
  .pds-plan-dims { font:400 10px/1 var(--mono, monospace); color: var(--n-500); letter-spacing:0.06em; }
  .pds-plan-footer { display:flex; align-items:center; justify-content:space-between; gap:10px; }

  /* Palette thumbnails are the fixture's own drawing, so the button always
     previews what will actually be placed. */
  .pds-pal-mini {
    display:grid; place-items:center;
    width:28px; height:28px; overflow:hidden;
  }
  .pds-pal-mini svg { display:block; max-width:100%; max-height:100%; }

  /* ═══ v3 · collision, fluid resize, free rotation ════════════════════════ */

  /* Illegal placement is SHOWN, never enforced mid-drag · the object keeps
     following the cursor and settles legally on release. Red is the one
     non-brand hue in the editor, and it only ever appears mid-gesture. */
  .pds-tbl-cell.is-blocked,
  .pds-el.is-blocked { filter:none; }
  .pds-tbl-cell.is-blocked::after,
  .pds-el.is-blocked::after {
    content:''; position:absolute; inset:var(--pad, 0px);
    border:1.5px solid #C0392B; border-radius:5px;
    background:rgba(192,57,43,0.13);
    pointer-events:none; z-index:3;
  }
  .pds-blocker::before {
    content:''; position:absolute; inset:var(--pad, 0px);
    border:1.5px dashed #C0392B; border-radius:5px;
    pointer-events:none; z-index:2;
  }

  /* Handles keep their 11px look but carry a 24px hit pad, so the same
     control works under a fingertip on a tablet. */
  .pds-hdl::after {
    content:''; position:absolute; left:50%; top:50%;
    width:24px; height:24px; transform:translate(-50%, -50%);
  }
  .pds-hdl-rot::after { width:30px; height:30px; }

  /* The dimension badge doubles as the angle readout during a rotate. */
  .pds-tbl-cell.is-resizing .pds-dim,
  .pds-el.is-resizing .pds-dim { background:var(--atlas); }

  .pds-rot-num { width:56px; flex:none; text-align:center; padding:5px 4px; }

  /* ── Ambiances ─────────────────────────────────────────────────────────
     Four curated whole-room palettes. Each button previews its own four
     surfaces, so the merchant picks from what they will get. */
  .pds-amb-row { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:4px; }
  .pds-amb {
    display:flex; flex-direction:column; gap:5px; align-items:flex-start;
    padding:7px 8px; cursor:pointer;
    border:1px solid var(--n-200); border-radius:9px; background:var(--surface);
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }
  .pds-amb:hover  { border-color:var(--atlas); }
  .pds-amb.active { border-color:var(--atlas); box-shadow:0 0 0 2px rgba(11,110,79,0.16); }
  .pds-amb-chips { display:flex; gap:0; border-radius:4px; overflow:hidden; width:100%; height:16px; }
  .pds-amb-chips i { flex:1; display:block; }
  .pds-amb-name {
    font:600 9.5px/1 var(--mono, monospace);
    letter-spacing:0.08em; text-transform:uppercase; color:var(--n-600);
  }

  /* Free picker sits in the swatch row and reads as one more swatch. The
     native colour input is stretched under a conic rainbow so it keeps the
     20px square the row is built on. */
  .pds-sw-custom {
    position:relative; overflow:hidden; display:inline-block;
    background:conic-gradient(#C0392B, #C9A46B, #7DF2B0, #0B6E4F, #BFD9E8, #8A6A45, #C0392B);
  }
  .pds-sw-custom input[type="color"] {
    position:absolute; inset:-4px; width:calc(100% + 8px); height:calc(100% + 8px);
    padding:0; border:0; opacity:0; cursor:pointer;
  }
  .pds-sw-none {
    background:
      linear-gradient(45deg, transparent 45%, #C0392B 45% 55%, transparent 55%),
      var(--paper, #F7F5F0);
  }

  /* ── Setup wizard ──────────────────────────────────────────────────────*/
  .pds-wiz { display:flex; flex-direction:column; gap:2px; }
  .pds-wiz-q {
    display:block; margin:14px 0 6px;
    font:600 10px/1 var(--mono, monospace);
    letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500);
  }
  .pds-wiz-q:first-child { margin-top:0; }
  .pds-wiz-opts { display:flex; flex-wrap:wrap; gap:6px; }
  .pds-wiz-opt {
    padding:7px 12px; cursor:pointer;
    border:1px solid var(--n-200); border-radius:8px;
    background:var(--surface); color:var(--n-700);
    font:500 12.5px/1 var(--font-ui, system-ui);
    transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
  }
  .pds-wiz-opt:hover  { border-color:var(--atlas); }
  .pds-wiz-opt.active { background:var(--atlas); border-color:var(--atlas); color:var(--paper, #F7F5F0); }
  .pds-wiz-dims { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .pds-wiz-dims label { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--n-600); }
  .pds-wiz-dims input[type="number"] { width:82px; text-align:center; }
  .pds-wiz-dims .pds-range { flex:1; min-width:160px; }
  .pds-wiz-area {
    font:600 12px/1 var(--mono, monospace); color:var(--atlas);
    padding:5px 9px; border-radius:7px; background:var(--paper-muted, rgba(11,110,79,0.07));
  }

  /* Three candidates, each previewing its own generated objects. */
  .pds-wiz-cards { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; }
  .pds-wiz-card {
    display:flex; flex-direction:column; gap:7px; align-items:stretch; text-align:left;
    padding:9px; cursor:pointer;
    border:1px solid var(--n-200); border-radius:11px; background:var(--surface);
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }
  .pds-wiz-card:hover  { border-color:var(--atlas); }
  .pds-wiz-card.active { border-color:var(--atlas); box-shadow:0 0 0 2px rgba(11,110,79,0.16); }
  .pds-wiz-thumb { display:block; border-radius:7px; overflow:hidden; background:var(--paper, #F7F5F0); }
  .pds-wiz-thumb svg { display:block; width:100%; height:88px; }
  .pds-wiz-card-name {
    font:600 10px/1 var(--mono, monospace);
    letter-spacing:0.1em; text-transform:uppercase; color:var(--ink);
  }
  .pds-wiz-card-nums { font-size:11.5px; line-height:1.5; color:var(--n-600); }
  .pds-wiz-card-nums b { font-size:15px; color:var(--atlas); }
  .pds-wiz-short {
    font:500 10.5px/1.4 var(--font-ui, system-ui);
    color:#8A4B22; background:rgba(192,57,43,0.09);
    padding:4px 6px; border-radius:6px;
  }
  .pds-wiz-note { margin:10px 0 0; font-size:11.5px; color:var(--n-500); }
  @media (max-width: 620px) { .pds-wiz-cards { grid-template-columns:1fr; } }

  /* ═══ v4 · vue nuit · la console de service ═══════════════════════════════
     Le look promis par la page d'accueil : salle charbon, tables au trait,
     le statut porté par la lumière. Tout vit sous .pds-noir (posée sur la
     racine du tiroir par pdsAttach) ; la vue jour au-dessus reste le rendu
     matières, intact. Une seule teinte d'accent · la menthe · et son halo
     rgba(0,255,174,…), le même vert que l'accueil sombre. */

  .pds-noir { color-scheme: dark; }

  /* La classe est doublée dans chaque sélecteur à dessein : le skin Vexel
     peint ce même chrome via « body.design-vexel :is(…) » · un élément plus
     deux classes · et la vue nuit doit l'emporter par spécificité, pas par
     ordre de source. */

  /* · La coque du tiroir : le cockpit entier passe au noir · */
  .pds-noir.pds-noir.pds-noir { background:rgba(5, 8, 6, 0.72); }
  /* !important : le skin 2026 (empilé par défaut) pose son verre blanc sur
     .kiwi-drawer avec !important · la spécificité seule ne suffit pas ici. */
  .pds-noir.pds-noir.pds-noir .kiwi-drawer { background:#090D0A !important; border-color:rgba(242,239,230,0.10) !important; }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-body { background:transparent; }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-head { background:#0B0F0C; border-color:rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-head :is(h1, h2, h3) { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-head p { color:rgba(242,239,230,0.50); }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-close {
    background:#141813; border-color:rgba(242,239,230,0.14); color:rgba(242,239,230,0.78);
  }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-close:hover { border-color:rgba(125,242,176,0.55); color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .kiwi-drawer-foot { background:#0B0F0C; border-color:rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .pds-inspector {
    background:transparent; border:none; box-shadow:none;
    -webkit-backdrop-filter:none; backdrop-filter:none;
  }

  /* · Chrome : panneaux, palette, inspecteur · */
  .pds-noir.pds-noir.pds-noir .pds-rail-card,
  .pds-noir.pds-noir.pds-noir .pds-tpl { background:#0F130F; border-color:rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .pds-rail-title, .pds-noir.pds-noir.pds-noir .pds-legend-title,
  .pds-noir.pds-noir.pds-noir .pds-mini-label, .pds-noir.pds-noir.pds-noir .pds-wiz-q,
  .pds-noir.pds-noir.pds-noir .pds-form-row > label, .pds-noir.pds-noir.pds-noir .pds-rot-lbl { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-rail-hint, .pds-noir.pds-noir.pds-noir .pds-mode-desc { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-pal-item,
  .pds-noir.pds-noir.pds-noir .pds-tool, .pds-noir.pds-noir.pds-noir .pds-step-btn, .pds-noir.pds-noir.pds-noir .pds-inspect-close,
  .pds-noir.pds-noir.pds-noir .pds-cfg-pill, .pds-noir.pds-noir.pds-noir .pds-scene-pill, .pds-noir.pds-noir.pds-noir .pds-wiz-opt,
  .pds-noir.pds-noir.pds-noir .pds-amb, .pds-noir.pds-noir.pds-noir .pds-strat-card, .pds-noir.pds-noir.pds-noir .pds-chip,
  .pds-noir.pds-noir.pds-noir .pds-wiz-card {
    background:#141813; border-color:rgba(242,239,230,0.10); color:rgba(242,239,230,0.78);
  }
  .pds-noir.pds-noir.pds-noir .pds-pal-label { color:rgba(242,239,230,0.66); }
  .pds-noir.pds-noir.pds-noir .pds-pal-shape { background:#1C221C; border-color:rgba(242,239,230,0.30); }
  .pds-noir.pds-noir.pds-noir .pds-pal-item:hover { border-color:rgba(125,242,176,0.55); box-shadow:0 6px 16px -10px rgba(0,255,174,0.35); }
  .pds-noir.pds-noir.pds-noir .pds-tool:hover, .pds-noir.pds-noir.pds-noir .pds-step-btn:hover,
  .pds-noir.pds-noir.pds-noir .pds-cfg-pill:hover, .pds-noir.pds-noir.pds-noir .pds-scene-pill:hover,
  .pds-noir.pds-noir.pds-noir .pds-wiz-opt:hover, .pds-noir.pds-noir.pds-noir .pds-amb:hover,
  .pds-noir.pds-noir.pds-noir .pds-strat-card:hover, .pds-noir.pds-noir.pds-noir .pds-inspect-close:hover {
    background:#1A201A; color:#EDEAE0; border-color:rgba(125,242,176,0.55);
  }
  .pds-noir.pds-noir.pds-noir .pds-chip-body b { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-roster-empty { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-chip-x { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-chip-x:hover { background:rgba(242,239,230,0.10); color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-asum-name { color:rgba(242,239,230,0.80); }
  .pds-noir.pds-noir.pds-noir .pds-asum-n { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-chip-body em { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-rot-meta > div, .pds-noir.pds-noir.pds-noir .pds-rot-step {
    background:#141813; border-color:rgba(242,239,230,0.10);
  }
  .pds-noir.pds-noir.pds-noir .pds-rot-val, .pds-noir.pds-noir.pds-noir .pds-fair-name, .pds-noir.pds-noir.pds-noir .pds-hist-name,
  .pds-noir.pds-noir.pds-noir .pds-strat-card b { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-strat-card em { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-rot-line b { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-rot-line em { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-rot-step-h { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-fair-bar { background:rgba(242,239,230,0.10); }

  /* Champs · color-scheme:dark règle les natifs, le reste suit. */
  .pds-noir.pds-noir.pds-noir .pds-input, .pds-noir.pds-noir.pds-noir input[type="number"], .pds-noir.pds-noir.pds-noir input[type="text"],
  .pds-noir.pds-noir.pds-noir select, .pds-noir.pds-noir.pds-noir textarea {
    background:#141813; border-color:rgba(242,239,230,0.14); color:#EDEAE0;
  }
  .pds-noir.pds-noir.pds-noir .pds-range, .pds-noir.pds-noir.pds-noir .pds-snap input { accent-color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-snap { color:rgba(242,239,230,0.66); }
  .pds-noir.pds-noir.pds-noir .pds-unit { color:rgba(242,239,230,0.58); }
  .pds-noir.pds-noir.pds-noir .pds-num-grid > label { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-step-btn { color:#EDEAE0; }

  /* Bandeau KPI */
  .pds-noir.pds-noir.pds-noir .p-kpi { background:#0F130F; border:1px solid rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .p-kpi .l { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .p-kpi .v { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .p-kpi .d { color:rgba(242,239,230,0.62); }

  /* Modes + zones : rail sombre, pilule active claire · le contraste inversé
     de la vue jour, même géométrie pour que la lentille liquide suive. */
  .pds-noir.pds-noir.pds-noir .pds-modes, .pds-noir.pds-noir.pds-noir .pds-zone-tabs {
    background:#0D110D; border-color:rgba(242,239,230,0.10);
  }
  .pds-noir.pds-noir.pds-noir .pds-mode, .pds-noir.pds-noir.pds-noir .pds-zone { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-mode:hover, .pds-noir.pds-noir.pds-noir .pds-zone:hover { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-mode.active { background:#EDEAE0; color:#0B0F0C; }
  .pds-noir.pds-noir.pds-noir .pds-zone.active { background:#1C221C; color:#EDEAE0; box-shadow:none; }
  .pds-noir.pds-noir.pds-noir .pds-zone.active em { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-zone em { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-zone-add { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-zone-add:hover { background:#1C221C; }

  /* Barre du plan + légende façon accueil : cases au trait, l'occupée seule
     rayonne. */
  .pds-noir.pds-noir.pds-noir .pds-canvas-bar { background:#0D110D; border-color:rgba(242,239,230,0.08); }
  /* Légende : les pastilles 17 × 13 rx 4 de l'accueil, sur la même échelle
     de blanc que les tables, la menthe pour l'occupée. Typo du mockup :
     400 · 11 px · -0.01em, encre 0.5. */
  .pds-noir.pds-noir.pds-noir .pds-legend-item {
    color:rgba(255,255,255,0.5);
    font:400 11px/1.2 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:-0.01em;
  }
  /* Les tabourets du comptoir se dessinent hors de la boîte du bâti. */
  .pds-noir.pds-noir.pds-noir .pds-el-svg { overflow:visible; }
  .pds-noir.pds-noir.pds-noir .pds-legend-swatch {
    width:17px; height:13px; border-radius:4px;
    background:rgba(255,255,255,0.012); box-shadow:none; border:1.25px solid rgba(255,255,255,0.19);
  }
  .pds-noir.pds-noir.pds-noir .pds-sw-occupied {
    border-color:#00FFAE; background:rgba(0,255,174,0.11);
  }
  .pds-noir.pds-noir.pds-noir .pds-sw-reserved { border-style:dashed; border-color:#E8C067; background:rgba(232,192,103,0.08); }
  .pds-noir.pds-noir.pds-noir .pds-sw-cleaning { border-style:dotted; border-color:rgba(255,255,255,0.40); background:rgba(255,255,255,0.02); }

  /* · La scène · */
  .pds-noir.pds-noir.pds-noir .pds-plan-canvas {
    background:#020302;
    border:1px solid rgba(255,255,255,0.06);
    border-radius:20px;
    padding:16px 16px 8px;
  }
  .pds-noir.pds-noir.pds-noir .pds-plan-room {
    border:1.5px solid rgba(255,255,255,0.13);
    border-radius:18px;
    box-shadow: 0 34px 70px -40px rgba(0,0,0,0.9);
  }
  .pds-noir.pds-noir.pds-noir .pds-plan-room.is-terrasse {
    border-style:dashed; border-color:rgba(0,255,174,0.30); background:transparent;
  }
  .pds-noir.pds-noir.pds-noir .pds-plan-label { color:rgba(242,239,230,0.78); }
  .pds-noir.pds-noir.pds-noir .pds-plan-label em { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-plan-footer { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-plan-floor-count { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .pds-plan-dims { color:rgba(242,239,230,0.58); }
  .pds-noir.pds-noir.pds-noir .pds-empty { background:rgba(10,14,11,0.78); }
  .pds-noir.pds-noir.pds-noir .pds-empty h4 { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-empty p { color:rgba(242,239,230,0.55); }

  /* · Tables : le statut est une lumière, le numéro se lit sans effort.
     Typo du mockup : 500 · 0.04em ; l'échelle de blanc remontée à 0.40 / 0.55
     pour tenir sur le sol quasi noir, la menthe 0.90 pour l'occupée. Le
     survol remonte encore l'encre · un plan d'édition doit rester
     manipulable, l'accueil n'a pas ce souci. · */
  .pds-noir.pds-noir.pds-noir .pds-tbl-num {
    font:500 11px/1 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.04em; color:rgba(255,255,255,0.62);
  }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="occupied"] .pds-tbl-num { color:rgba(0,255,174,0.90); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="reserved"] .pds-tbl-num { color:rgba(232,192,103,0.80); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell:hover .pds-tbl-num,
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.is-selected .pds-tbl-num { color:rgba(255,255,255,0.75); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="occupied"]:hover .pds-tbl-num,
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="occupied"].is-selected .pds-tbl-num { color:#00FFAE; }
  /* Le nombre de couverts n'existe qu'à l'approche · le mockup n'affiche que
     le numéro, et c'est ce silence qui le rend cher. */
  .pds-noir.pds-noir.pds-noir .pds-tbl-covers { opacity:0; transition:opacity 180ms ease; }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell:hover .pds-tbl-covers,
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.is-selected .pds-tbl-covers { opacity:.5; }
  /* Le halo de l'occupée vit désormais DANS le SVG (disque pdsNoirCall),
     comme sur l'accueil ; le survol garde juste un peu de lumière en plus. */
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell:hover { filter:brightness(1.25); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="occupied"]:hover { filter:brightness(1.15); }
  /* L'anneau d'appel · la copie de .kw-plan-call de l'accueil. */
  .pds-noir.pds-noir.pds-noir .pds-noir-call {
    transform-box:fill-box; transform-origin:center;
    animation:pdsNoirCall 2.6s cubic-bezier(.22,.7,.3,1) infinite;
  }
  @keyframes pdsNoirCall {
    0%, 62% { opacity:.85; transform:scale(1); }
    100%    { opacity:0;   transform:scale(1.5); }
  }
  @media (prefers-reduced-motion: reduce) {
    .pds-noir.pds-noir.pds-noir .pds-noir-call { animation:none; opacity:0; }
  }
  /* La pastille « 6 min » : 19 px de haut, rx 9.5, encre 0.72 sur noir 0.92. */
  .pds-noir.pds-noir.pds-noir .pds-tbl-since {
    position:absolute; top:calc(var(--pad, 0px) - 24px); left:calc(var(--pad, 0px) - 6px);
    height:19px; padding:0 9px; border-radius:9.5px;
    display:inline-flex; align-items:center;
    background:rgba(10,10,10,0.92); border:1px solid rgba(255,255,255,0.18);
    font:500 10px/1 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.02em; color:rgba(255,255,255,0.72);
    white-space:nowrap; pointer-events:none; z-index:4;
  }
  .pds-noir.pds-noir.pds-noir .pds-resv-chip {
    background:rgba(4,26,20,0.94); border-color:rgba(125,242,176,0.60); color:#7DF2B0;
    box-shadow:0 0 14px rgba(125,242,176,0.12);
  }
  .pds-noir.pds-noir.pds-noir .pds-resv-field > span { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-resv-field .pds-input {
    color-scheme:dark; background:#0D110E; border-color:rgba(125,242,176,0.34); color:#F7F5F0;
  }
  .pds-noir.pds-noir.pds-noir .pds-resv-field .pds-input:focus {
    border-color:#7DF2B0; box-shadow:0 0 0 2px rgba(125,242,176,0.14);
  }
  .pds-noir.pds-noir.pds-noir .pds-tbl-server { border-color:#0D110E; }
  /* Les pastilles serveur appartiennent à l'Affectation ; en Aménagement
     elles ne font que du bruit que le mockup n'a pas. */
  .pds-noir.pds-noir.pds-noir .pds-stage-layout .pds-tbl-server { display:none; }

  /* · Sélection : cadre menthe + tirets d'angle, le geste de l'accueil · */
  .pds-noir.pds-noir.pds-noir .pds-hdl-layer::before {
    border-color:#7DF2B0; border-radius:9px;
    box-shadow:0 0 0 3px rgba(0,255,174,0.13), 0 0 26px rgba(0,255,174,0.20);
  }
  .pds-noir.pds-noir.pds-noir .pds-hdl { background:#0D110E; border-color:#7DF2B0; box-shadow:0 0 6px rgba(0,255,174,0.35); }
  .pds-noir.pds-noir.pds-noir .pds-hdl:hover { background:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-hdl-n, .pds-noir.pds-noir.pds-noir .pds-hdl-s { width:18px; height:5px; margin:-2.5px 0 0 -9px; border-radius:3px; }
  .pds-noir.pds-noir.pds-noir .pds-hdl-e, .pds-noir.pds-noir.pds-noir .pds-hdl-w { width:5px; height:18px; margin:-9px 0 0 -2.5px; border-radius:3px; }
  .pds-noir.pds-noir.pds-noir .pds-hdl-rot { background:#7DF2B0; border-color:#0D110E; }
  .pds-noir.pds-noir.pds-noir .pds-hdl-rot::before { background:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-dim { background:#7DF2B0; color:#07100C; }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.is-resizing .pds-dim,
  .pds-noir.pds-noir.pds-noir .pds-el.is-resizing .pds-dim { background:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-locked { background:rgba(242,239,230,0.14); color:#EDEAE0; }

  /* · Bâti : les idéogrammes se dessinent en SVG (pdsNoirFixture), le CSS ne
     rajoute rien sur le fond · un liseré ici doublerait le trait. · */
  .pds-noir.pds-noir.pds-noir .pds-el:not(.is-locked):not(.is-dragging):hover {
    outline-color:rgba(125,242,176,0.65);
    filter:drop-shadow(0 0 12px rgba(0,255,174,0.14));
  }
  /* Étiquettes du bâti : la typo du mockup · 500 · 0.14em · blanc 0.34 · et
     les pilules BAR / CAISSE portent leur nom à gauche, pas au centre. */
  .pds-noir.pds-noir.pds-noir .pds-el-label {
    font:500 9px/1.2 var(--font-ui, 'Inter Tight'), system-ui;
    letter-spacing:0.14em;
  }
  .pds-noir.pds-noir.pds-noir .pds-el-comptoir .pds-el-label,
  .pds-noir.pds-noir.pds-noir .pds-el-caisse .pds-el-label {
    justify-content:flex-start; padding-left:16px; text-align:left;
  }

  /* Gêne de placement : le rouge reste le seul hors-marque, plus clair ici. */
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.is-blocked::after,
  .pds-noir.pds-noir.pds-noir .pds-el.is-blocked::after { border-color:#E4604E; background:rgba(228,96,78,0.14); }
  .pds-noir.pds-noir.pds-noir .pds-blocker::before { border-color:#E4604E; }

  /* · Statuts (légende de l'inspecteur) · */
  .pds-noir.pds-noir.pds-noir .pds-pill-free { background:rgba(242,239,230,0.07); color:rgba(242,239,230,0.66); }
  .pds-noir.pds-noir.pds-noir .pds-pill-occupied { background:rgba(0,255,174,0.10); color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-pill-reserved { background:rgba(232,192,103,0.10); color:#E8C067; border:1px dashed rgba(232,192,103,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-pill-cleaning { background:rgba(255,255,255,0.02); color:rgba(242,239,230,0.60); border:1px dotted rgba(255,255,255,0.40); }

  /* · Groupes : l'enveloppe passe à la menthe sur la scène noire · */
  .pds-noir.pds-noir.pds-noir .pds-group-env { border-color:rgba(0,255,174,0.55); background:rgba(0,255,174,0.10); }
  .pds-noir.pds-noir.pds-noir .pds-group-env::before { background:radial-gradient(closest-side, rgba(0,255,174,0.16), rgba(0,255,174,0)); }
  .pds-noir.pds-noir.pds-noir .pds-group-chip { background:rgba(4,26,20,0.92); border-color:rgba(0,255,174,0.55); color:#00FFAE; }
  .pds-noir.pds-noir.pds-noir .pds-inspect-actions .kb.pds-group-arming { border-color:#00FFAE; color:#00FFAE; animation:pdsGroupArm 1.2s ease-in-out infinite; }
  .pds-noir.pds-noir.pds-noir .pds-group-info { border-color:rgba(0,255,174,0.35); background:rgba(0,255,174,0.07); color:#7DF2B0; }

  /* Nuancier : l'anneau de l'actif passe à la menthe sur fond noir. */
  .pds-noir.pds-noir.pds-noir .pds-sw { border-color:rgba(242,239,230,0.18); }
  .pds-noir.pds-noir.pds-noir .pds-sw.active { box-shadow:0 0 0 2px #0F130F, 0 0 0 3.5px #7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-sw-none {
    background:
      linear-gradient(45deg, transparent 45%, #E4604E 45% 55%, transparent 55%),
      #141813;
  }

  /* Pied de page */
  .pds-noir.pds-noir.pds-noir .pds-foot-meta { color:rgba(242,239,230,0.62); }
  .pds-noir.pds-noir.pds-noir .kb.ghost { background:#141813; border-color:rgba(242,239,230,0.14); color:rgba(242,239,230,0.78); }
  .pds-noir.pds-noir.pds-noir .kb.ghost:hover { border-color:rgba(125,242,176,0.55); color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-rail-danger { color:#E4604E; }
  .pds-noir.pds-noir.pds-noir .pds-rail-danger:hover { border-color:#E4604E; }

  /* ═════ v3 · la salle telle qu'elle est ════════════════════════════════
     Live room, filters, zoom, palette by seats, live panel, versions,
     export. Day rules first, then the noir overrides at the same
     triple-class weight as the rest of the night skin. */

  /* KPI strip: the shared .kx-kpi-strip, four cells. */
  .pds-kpis { margin-bottom:14px; }
  .pds-kpis .kx-kpi .v { font-size:26px; }
  .pds-kpis .kx-kpi .d { margin-top:6px; font-size:11.5px; color:var(--n-600); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pds-kpis .kx-kpi.warn .v { color:#C2456F; }
  .pds-kpis .kx-kpi.warn .l { color:#C2456F; }

  /* Live badge: a dot and three words. */
  .pds-live-badge { display:inline-flex; align-items:center; gap:7px; height:24px; padding:0 10px; border-radius:12px;
    font:500 11px/1 var(--font-ui, 'Inter Tight'), system-ui; letter-spacing:0.01em; white-space:nowrap;
    background:rgba(10,15,13,0.04); color:var(--n-600); border:1px solid var(--n-200); }
  .pds-live-badge i { width:7px; height:7px; border-radius:50%; background:var(--n-400); flex:none; }
  .pds-live-badge.is-live { background:rgba(11,110,79,0.08); color:var(--atlas); border-color:rgba(11,110,79,0.28); }
  .pds-live-badge.is-live i { background:var(--atlas); box-shadow:0 0 0 3px rgba(11,110,79,0.16); animation:pdsLivePulse 2.4s ease-in-out infinite; }
  .pds-live-badge.is-stale { background:rgba(200,146,53,0.10); color:#7D5A1A; border-color:rgba(200,146,53,0.40); }
  .pds-live-badge.is-stale i { background:#C89235; }
  @keyframes pdsLivePulse { 0%,100% { box-shadow:0 0 0 0 rgba(11,110,79,0.30); } 50% { box-shadow:0 0 0 4px rgba(11,110,79,0); } }
  @media (prefers-reduced-motion: reduce) { .pds-live-badge.is-live i { animation:none; } }

  .pds-zone-dot { width:8px; height:8px; border-radius:50%; background:var(--zone, var(--atlas)); flex:none; }
  .pds-plan-label[style*="--zone"] { color:var(--zone); }

  /* Legend = filters. A button that reads like the old label until pressed. */
  button.pds-legend-item { background:transparent; border:1px solid transparent; border-radius:8px; padding:4px 8px; cursor:pointer; font-family:inherit; }
  button.pds-legend-item:hover { background:rgba(10,15,13,0.04); color:var(--ink); }
  button.pds-legend-item.on { background:var(--surface); border-color:var(--atlas); color:var(--ink); }
  .pds-legend-item b { font:600 11px/1 var(--mono, monospace); color:var(--n-500); margin-left:2px; font-variant-numeric:tabular-nums; }
  .pds-legend-item.on b { color:var(--atlas); }
  .pds-legend-clear { background:transparent; border:0; padding:4px 6px; font:500 11px/1 var(--font-ui, 'Inter Tight'), system-ui; color:var(--atlas); cursor:pointer; text-decoration:underline; text-underline-offset:3px; }

  /* The till's own inks. Addition demandée is the loudest thing in the room. */
  .pds-sw-ordering { background:rgba(200,146,53,0.12); border-color:#C89235; }
  .pds-sw-bill     { background:rgba(194,69,111,0.14); border-color:#C2456F; border-width:1.75px; }
  .pds-sw-paid     { background:rgba(10,15,13,0.02); border-style:dotted; border-color:rgba(10,15,13,0.45); }
  .pds-sw-reserved { background:rgba(5,59,44,0.06); border-style:dashed; border-color:#053B2C; }
  .pds-sw-out      { background:repeating-linear-gradient(135deg, rgba(10,15,13,0.08) 0 2px, transparent 2px 5px); border-style:dashed; border-color:rgba(10,15,13,0.30); }
  .pds-pill-ordering { background:rgba(200,146,53,0.14); color:#7D5A1A; }
  .pds-pill-bill     { background:rgba(194,69,111,0.12); color:#A0335A; }
  .pds-pill-paid     { background:rgba(10,15,13,0.02); color:var(--n-700); border:1px dotted rgba(10,15,13,0.45); }
  .pds-pill-out      { background:rgba(10,15,13,0.04); color:var(--n-600); border:1px dashed rgba(10,15,13,0.30); }
  .pds-pill-reserved, .pds-status-pill.pds-pill-reserved { background:rgba(5,59,44,0.06); color:#053B2C; border:1px dashed rgba(5,59,44,0.55); }
  .pds-status-pill.pds-pill-ordering { background:rgba(200,146,53,0.12); color:#7D5A1A; }
  .pds-status-pill.pds-pill-bill { background:rgba(194,69,111,0.10); color:#A0335A; }
  .pds-status-pill.pds-pill-paid { background:rgba(10,15,13,0.02); color:var(--n-700); border-style:dotted; border-color:rgba(10,15,13,0.40); }
  .pds-status-pill.pds-pill-out { background:rgba(10,15,13,0.03); color:var(--n-600); border-style:dashed; border-color:rgba(10,15,13,0.30); }

  /* Heat switch: a small segmented control. */
  .pds-heat { display:inline-flex; padding:2px; gap:2px; border:1px solid var(--n-200); border-radius:8px; background:var(--surface); }
  .pds-heat-opt { border:0; background:transparent; padding:4px 8px; border-radius:6px; font:500 11px/1 var(--font-ui, 'Inter Tight'), system-ui; color:var(--n-600); cursor:pointer; }
  .pds-heat-opt:hover:not([disabled]) { color:var(--ink); }
  .pds-heat-opt.on { background:rgba(11,110,79,0.10); color:var(--atlas); }
  .pds-heat-opt[disabled] { opacity:0.42; cursor:not-allowed; }

  .pds-zoom { display:inline-flex; align-items:center; gap:2px; }
  .pds-tool.pds-zoom-val { width:auto; min-width:44px; padding:0 7px; font:500 11px/1 var(--mono, monospace); font-variant-numeric:tabular-nums; }
  .pds-tool svg { width:16px; height:16px; display:block; }
  .pds-tool[disabled] { opacity:0.38; cursor:default; pointer-events:none; }
  .pds-bar-tools { flex-wrap:wrap; justify-content:flex-end; }

  /* Zoom: the room keeps its fit width until zoomed, then the canvas scrolls. */
  .pds-plan-canvas.is-zoomed { overflow:auto; max-height:calc(100dvh - var(--pds-chrome, 330px)); overscroll-behavior:contain; }
  .pds-plan-canvas.is-zoomed .pds-plan-room { flex:none; }
  .pds-plan-canvas.is-panning, .pds-plan-canvas.is-panning * { cursor:grabbing !important; }
  .pds-plan-canvas.is-pan-ready { cursor:grab; }

  .pds-marquee { position:absolute; z-index:30; pointer-events:none; border:1px dashed var(--atlas); background:rgba(11,110,79,0.07); border-radius:3px; }

  /* Filters and heat map on the table cell. */
  .pds-tbl-cell { transition:opacity .2s ease, filter .2s ease; }
  .pds-tbl-cell.is-dim { opacity:0.22; filter:saturate(0.2); }
  .pds-tbl-cell.has-heat::before { content:""; position:absolute; inset:calc(var(--pad, 0px) - 10px); border-radius:50%;
    background:radial-gradient(closest-side, rgba(11,110,79,calc(var(--heat, 0) * 0.42)), rgba(11,110,79,0)); pointer-events:none; z-index:0; }
  .pds-tbl-heat { position:absolute; bottom:calc(var(--pad, 0px) - 24px); left:50%; transform:translateX(-50%);
    height:19px; padding:0 9px; border-radius:9.5px; display:inline-flex; align-items:center; white-space:nowrap; pointer-events:none; z-index:5;
    background:var(--atlas); color:#F7F5F0; font:600 10px/1 var(--font-ui, 'Inter Tight'), system-ui; font-variant-numeric:tabular-nums; }
  .pds-bill-chip { position:absolute; top:calc(var(--pad, 0px) - 24px); right:calc(var(--pad, 0px) - 6px);
    height:19px; padding:0 8px; border-radius:9.5px; display:inline-flex; align-items:center; white-space:nowrap; pointer-events:none; z-index:4;
    background:rgba(247,245,240,0.94); border:1px solid rgba(194,69,111,0.45); color:#A0335A;
    font:600 10px/1 var(--font-ui, 'Inter Tight'), system-ui; font-variant-numeric:tabular-nums; }
  .pds-tbl-cell[data-status="bill"] .pds-bill-chip { background:#C2456F; border-color:#C2456F; color:#F7F5F0; }
  .pds-resv-chip.is-next { border-style:dashed; border-color:rgba(5,59,44,0.40); color:#053B2C; background:rgba(247,245,240,0.86); }
  .pds-tbl-since.is-check { border-color:rgba(200,146,53,0.60); color:#7D5A1A; background:rgba(252,246,232,0.96); }
  .pds-tbl-cell.pds-flash { animation:pdsFlash 1.3s cubic-bezier(0.34, 1.45, 0.5, 1); }
  @keyframes pdsFlash { 0% { transform:scale(1); } 25% { transform:scale(1.10); } 100% { transform:scale(1); } }
  @media (prefers-reduced-motion: reduce) { .pds-tbl-cell.pds-flash { animation:none; outline:2px solid var(--atlas); } }

  /* Footer under the canvas. */
  .pds-plan-footer { gap:14px; padding:2px 4px; color:var(--n-500); }
  .pds-plan-floor-count { font-size:11.5px; color:var(--n-700); font-variant-numeric:tabular-nums; }
  .pds-kbd-hint { flex:1; text-align:center; font-size:11px; color:var(--n-500); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  @media (max-width: 1100px) { .pds-kbd-hint { display:none; } }
  .pds-foot-saved { display:inline-flex; align-items:center; gap:6px; font-size:11px; color:var(--n-500); }
  .pds-foot-saved::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--atlas); }
  .pds-count { display:inline-grid; place-items:center; min-width:18px; height:18px; padding:0 5px; margin-left:4px; border-radius:9px; background:rgba(11,110,79,0.10); color:var(--atlas); font:600 11px/1 var(--mono, monospace); }
  .kb.pds-danger { background:var(--danger, #B4362A); border-color:var(--danger, #B4362A); color:#F7F5F0; }
  .kb.pds-danger:hover { filter:brightness(0.94); }

  /* Palette: seats first, then five shapes. */
  .pds-pal-seats { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; font-size:12px; color:var(--n-700); }
  .pds-step-out { min-width:22px; text-align:center; font:600 13px/1 var(--mono, monospace); font-variant-numeric:tabular-nums; color:var(--ink); }
  .pds-palette-shapes { grid-template-columns:repeat(3, minmax(0, 1fr)); gap:6px; }
  .pds-palette-shapes .pds-pal-item { padding:8px 2px 6px; min-width:0; }
  .pds-palette-shapes .pds-pal-label { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
  .pds-rail-hint-sm { font-size:11px; margin:10px 0 0; }
  .pds-rail-warn { margin-bottom:10px; padding:8px 10px; border-radius:8px; font-size:11.5px; line-height:1.4;
    background:rgba(180,54,42,0.07); border:1px solid rgba(180,54,42,0.30); color:#8E2A20; }
  .pds-field-warn { display:block; margin-top:5px; font-size:11px; color:#8E2A20; }
  .pds-field-hint { margin:6px 0 0; font-size:11px; line-height:1.4; color:var(--n-500); }
  .pds-zone-tools { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
  .pds-zone-tools .kb { flex:1; min-width:0; justify-content:center; }

  /* Assign rail: who is on shift. */
  .pds-duty { font-style:normal; font-weight:600; }
  .pds-duty-on-duty { color:var(--atlas); }
  .pds-duty-on-pause { color:#7D5A1A; }
  .pds-duty-off-duty { color:var(--n-500); }
  .pds-chip.is-off { opacity:0.62; }
  .pds-chip.is-off:hover { opacity:1; }

  /* Till status card in the inspector. */
  .pds-till-status { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; padding:9px 10px; border-radius:9px;
    background:var(--paper); border:1px solid var(--n-200); font-size:12px; color:var(--n-700); }
  .pds-till-status b { font-weight:600; color:var(--ink); }
  .pds-till-status > span:not(.pds-legend-swatch) { font-variant-numeric:tabular-nums; }
  .pds-till-bill { border-color:rgba(194,69,111,0.45); background:rgba(194,69,111,0.05); }
  .pds-till-bill b { color:#A0335A; }

  /* Live panel (empty inspector). */
  .pds-live { display:flex; flex-direction:column; gap:12px; }
  .pds-live-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .pds-live-head .pds-rail-title { margin:0; }
  .pds-live-head .pds-live-badge { height:20px; padding:0 8px; font-size:11px; }
  .pds-live-sec { display:flex; flex-direction:column; gap:3px; }
  .pds-live-sub { font:500 11px/1.3 var(--font-ui, 'Inter Tight'), system-ui; letter-spacing:0.06em; text-transform:uppercase; color:var(--n-500); margin-bottom:3px; }
  .pds-live-sec.is-urgent .pds-live-sub { color:#A0335A; }
  .pds-live-sec.is-check .pds-live-sub { color:#7D5A1A; }
  .pds-live-note { margin:0 0 4px; font-size:11.5px; line-height:1.45; color:var(--n-600); }
  .pds-live-row { display:grid; grid-template-columns:auto minmax(0, 1fr) auto; align-items:center; gap:8px; width:100%;
    padding:6px 8px; border-radius:8px; border:1px solid transparent; background:transparent; text-align:left; font:inherit; font-size:12px; color:var(--n-700); cursor:pointer; }
  button.pds-live-row:hover { background:var(--paper); border-color:var(--n-200); }
  .pds-live-row b { font-weight:600; color:var(--ink); font-variant-numeric:tabular-nums; }
  .pds-live-row span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pds-live-row em { font-style:normal; font-variant-numeric:tabular-nums; color:var(--n-600); }
  .pds-live-sec.is-urgent .pds-live-row { background:rgba(194,69,111,0.06); }
  .pds-live-sec.is-urgent .pds-live-row em { color:#A0335A; font-weight:600; }
  .pds-live-row.is-unplaced { cursor:default; }
  .pds-live-place.kb { height:24px; padding:0 8px; font-size:11px; }
  .pds-live-stat { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:2px 8px; padding:6px 0; border-top:1px solid var(--n-200); font-size:12px; }
  .pds-live-stat:first-of-type { border-top:0; }
  .pds-live-stat b { font-weight:600; color:var(--ink); }
  .pds-live-stat span { grid-column:1 / -1; color:var(--n-600); font-size:11.5px; }
  .pds-live-stat em { grid-row:1; grid-column:2; font-style:normal; color:var(--atlas); font-variant-numeric:tabular-nums; }

  /* Rotation. */
  .pds-rot-auto { margin:0 0 10px; font-size:11.5px; color:var(--n-600); }
  .pds-rot-auto.on { color:var(--atlas); }
  .pds-toggle-row { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border:1px solid var(--n-200); border-radius:10px; background:var(--paper); cursor:pointer; }
  .pds-toggle-row input { accent-color:var(--atlas); margin-top:3px; }
  .pds-toggle-row span { display:flex; flex-direction:column; gap:3px; }
  .pds-toggle-row b { font-size:13px; font-weight:600; color:var(--ink); }
  .pds-toggle-row em { font-style:normal; font-size:11.5px; color:var(--n-600); line-height:1.4; }
  .pds-pairs { display:flex; flex-direction:column; gap:6px; margin-top:12px; }
  .pds-pairs[hidden] { display:none; }
  .pds-pair-row { display:grid; grid-template-columns:minmax(0, 1fr) auto minmax(0, 1fr) auto; align-items:center; gap:6px; }
  .pds-pair-row .pds-chip-x { opacity:1; }
  .pds-hist-h, .pds-hist-row { grid-template-columns:100px repeat(var(--cols, 7), minmax(0, 1fr)); }

  /* Export + versions modals. */
  .pds-export-opts { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  @media (max-width: 520px) { .pds-export-opts { grid-template-columns:1fr; } }
  .pds-export-opt { display:flex; flex-direction:column; align-items:flex-start; gap:6px; padding:14px; border-radius:12px; text-align:left;
    border:1.5px solid var(--n-200); background:var(--paper); font-family:inherit; cursor:pointer; transition:border-color .16s, background .16s; }
  .pds-export-opt:hover { border-color:var(--atlas); background:var(--surface); }
  .pds-export-opt b { font-size:13.5px; font-weight:600; color:var(--ink); }
  .pds-export-opt em { font-style:normal; font-size:11.5px; line-height:1.4; color:var(--n-600); }
  .pds-export-ico { width:30px; height:30px; display:grid; place-items:center; border-radius:8px; background:rgba(11,110,79,0.08); color:var(--atlas); }
  .pds-export-ico svg { width:18px; height:18px; }
  .pds-versions { display:flex; flex-direction:column; gap:8px; }
  .pds-version-new { display:flex; gap:8px; margin-bottom:6px; }
  .pds-version-new .pds-input { flex:1; min-width:0; }
  .pds-version { display:grid; grid-template-columns:minmax(0, 1fr) auto auto; align-items:center; gap:8px; padding:10px 12px; border:1px solid var(--n-200); border-radius:10px; background:var(--paper); }
  .pds-version > div { display:flex; flex-direction:column; gap:3px; min-width:0; }
  .pds-version b { font-size:13px; font-weight:600; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pds-version em { font-style:normal; font-size:11.5px; color:var(--n-600); }

  /* ── Noir ── */
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi { background:#0D110D; }
  .pds-noir.pds-noir.pds-noir .pds-kpis { background:rgba(242,239,230,0.08); border-color:rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi .v { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi .l, .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi .d { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi.warn .v, .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi.warn .l { color:#FF7DA9; }
  .pds-noir.pds-noir.pds-noir .pds-live-badge { background:rgba(242,239,230,0.05); border-color:rgba(242,239,230,0.12); color:rgba(242,239,230,0.66); }
  .pds-noir.pds-noir.pds-noir .pds-live-badge.is-live { background:rgba(0,255,174,0.08); border-color:rgba(0,255,174,0.35); color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-live-badge.is-live i { background:#00FFAE; }
  .pds-noir.pds-noir.pds-noir .pds-live-badge.is-stale { background:rgba(232,192,103,0.08); border-color:rgba(232,192,103,0.40); color:#E8C067; }
  .pds-noir.pds-noir.pds-noir button.pds-legend-item:hover { background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.85); }
  .pds-noir.pds-noir.pds-noir button.pds-legend-item.on { background:rgba(0,255,174,0.06); border-color:rgba(0,255,174,0.55); color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-legend-item b { color:rgba(255,255,255,0.45); }
  .pds-noir.pds-noir.pds-noir .pds-legend-clear { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-sw-ordering { border-color:#E8C067; background:rgba(232,192,103,0.10); }
  .pds-noir.pds-noir.pds-noir .pds-sw-bill { border-color:#FF7DA9; background:rgba(255,125,169,0.14); }
  .pds-noir.pds-noir.pds-noir .pds-sw-paid { border-style:dotted; border-color:rgba(255,255,255,0.40); background:rgba(255,255,255,0.02); }
  .pds-noir.pds-noir.pds-noir .pds-sw-reserved { border-style:dashed; border-color:rgba(247,245,240,0.70); background:rgba(247,245,240,0.05); }
  .pds-noir.pds-noir.pds-noir .pds-sw-out { border-style:dashed; border-color:rgba(255,255,255,0.22); background:repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0 2px, transparent 2px 5px); }
  .pds-noir.pds-noir.pds-noir .pds-pill-ordering { background:rgba(232,192,103,0.10); color:#E8C067; }
  .pds-noir.pds-noir.pds-noir .pds-pill-bill { background:rgba(255,125,169,0.12); color:#FF7DA9; }
  .pds-noir.pds-noir.pds-noir .pds-pill-paid { background:rgba(255,255,255,0.02); color:rgba(242,239,230,0.60); border:1px dotted rgba(255,255,255,0.40); }
  .pds-noir.pds-noir.pds-noir .pds-pill-out { background:rgba(255,255,255,0.03); color:rgba(242,239,230,0.55); border:1px dashed rgba(255,255,255,0.25); }
  .pds-noir.pds-noir.pds-noir .pds-pill-reserved { background:rgba(247,245,240,0.05); color:#EDEAE0; border:1px dashed rgba(247,245,240,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-heat { background:#0D110D; border-color:rgba(242,239,230,0.12); }
  .pds-noir.pds-noir.pds-noir .pds-heat-opt { color:rgba(242,239,230,0.60); }
  .pds-noir.pds-noir.pds-noir .pds-heat-opt.on { background:rgba(0,255,174,0.10); color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-marquee { border-color:#00FFAE; background:rgba(0,255,174,0.07); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell.has-heat::before { background:radial-gradient(closest-side, rgba(0,255,174,calc(var(--heat, 0) * 0.34)), rgba(0,255,174,0)); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-heat { background:#00FFAE; color:#020302; }
  .pds-noir.pds-noir.pds-noir .pds-bill-chip { background:rgba(10,10,10,0.92); border-color:rgba(255,125,169,0.55); color:#FF7DA9; }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="bill"] .pds-bill-chip { background:#FF7DA9; border-color:#FF7DA9; color:#020302; }
  .pds-noir.pds-noir.pds-noir .pds-resv-chip.is-next { background:rgba(10,10,10,0.88); border-color:rgba(247,245,240,0.35); color:rgba(247,245,240,0.80); box-shadow:none; }
  .pds-noir.pds-noir.pds-noir .pds-tbl-since.is-check { border-color:rgba(232,192,103,0.60); color:#E8C067; }
  .pds-noir.pds-noir.pds-noir .pds-plan-floor-count { color:rgba(242,239,230,0.72); }
  .pds-noir.pds-noir.pds-noir .pds-kbd-hint, .pds-noir.pds-noir.pds-noir .pds-foot-saved { color:rgba(242,239,230,0.50); }
  .pds-noir.pds-noir.pds-noir .pds-foot-saved::before { background:#00FFAE; }
  .pds-noir.pds-noir.pds-noir .pds-count { background:rgba(0,255,174,0.10); color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-pal-seats { color:rgba(242,239,230,0.72); }
  .pds-noir.pds-noir.pds-noir .pds-step-out { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-rail-warn { background:rgba(228,96,78,0.10); border-color:rgba(228,96,78,0.40); color:#F29A8C; }
  .pds-noir.pds-noir.pds-noir .pds-field-warn { color:#F29A8C; }
  .pds-noir.pds-noir.pds-noir .pds-field-hint { color:rgba(242,239,230,0.50); }
  .pds-noir.pds-noir.pds-noir .pds-duty-on-duty { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-duty-on-pause { color:#E8C067; }
  .pds-noir.pds-noir.pds-noir .pds-till-status { background:#0D110D; border-color:rgba(242,239,230,0.12); color:rgba(242,239,230,0.70); }
  .pds-noir.pds-noir.pds-noir .pds-till-status b { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-till-bill { border-color:rgba(255,125,169,0.45); background:rgba(255,125,169,0.06); }
  .pds-noir.pds-noir.pds-noir .pds-till-bill b { color:#FF7DA9; }
  .pds-noir.pds-noir.pds-noir .pds-live-sub, .pds-noir.pds-noir.pds-noir .pds-live-note { color:rgba(242,239,230,0.52); }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-urgent .pds-live-sub { color:#FF7DA9; }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-check .pds-live-sub { color:#E8C067; }
  .pds-noir.pds-noir.pds-noir .pds-live-row { color:rgba(242,239,230,0.70); }
  .pds-noir.pds-noir.pds-noir button.pds-live-row:hover { background:#141813; border-color:rgba(242,239,230,0.12); }
  .pds-noir.pds-noir.pds-noir .pds-live-row b, .pds-noir.pds-noir.pds-noir .pds-live-stat b { color:#EDEAE0; }
  .pds-noir.pds-noir.pds-noir .pds-live-row em { color:rgba(242,239,230,0.60); }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-urgent .pds-live-row { background:rgba(255,125,169,0.07); }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-urgent .pds-live-row em { color:#FF7DA9; }
  .pds-noir.pds-noir.pds-noir .pds-live-stat { border-color:rgba(242,239,230,0.08); }
  .pds-noir.pds-noir.pds-noir .pds-live-stat span { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-live-stat em { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-rot-auto { color:rgba(242,239,230,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-rot-auto.on { color:#7DF2B0; }
  /* ═════ v4 · la page dans le cadre, l'esthétique de l'accueil ═══════════
     Plan de salle is a 3.0 page now (Kiwi.appPage): the dashboard's sidebar
     and top bar stay, the room sits under a real h1. The night view, the
     default, is the landing's « Le plan de salle, en un geste »: a black
     page, hairline cards at 0.10, white type on an opacity scale, mint for
     the one thing that needs attention. Day mirrors it in ink and atlas. */

  /* Page shell. The host paints nothing; in night view main does. */
  .dash-genpage.pds-host { background:transparent; }
  .pds-page { display:flex; flex-direction:column; gap:14px; }
  body.pds-dark-page main.main,
  body.pds-dark-page .main { background:#000 !important; }
  body.pds-dark-page .dash-genpage .genpage-head h1 { color:#F2EFE6; }
  body.pds-dark-page .dash-genpage .genpage-head p { color:rgba(255,255,255,0.50); }
  body.pds-dark-page .dash-genpage .genpage-head p .seg:first-child { color:rgba(255,255,255,0.78); }
  body.pds-dark-page .dash-genpage .genpage-head p .dot { background:rgba(255,255,255,0.28); }
  body.pds-dark-page .dash-genpage .genpage-head::after { background:rgba(255,255,255,0.10); }
  /* Listes déroulantes (kiwi-select) : le déclencheur peignait du blanc à
     68 % sur le noir, et le menu est monté sur <body>, hors de .pds-noir. */
  .pds-noir.pds-noir.pds-noir .kiwi-select-trigger {
    background:#0b0d0c; border-color:rgba(255,255,255,0.12); color:#EDEAE0; box-shadow:none;
  }
  .pds-noir.pds-noir.pds-noir .kiwi-select-trigger:hover { background:#101312; border-color:rgba(255,255,255,0.22); }
  .pds-noir.pds-noir.pds-noir .kiwi-select-value-meta,
  .pds-noir.pds-noir.pds-noir .kiwi-select-chevron { color:rgba(255,255,255,0.45); }
  body.pds-dark-page .kiwi-select-popover {
    background:rgba(10,12,11,0.96); border-color:rgba(255,255,255,0.12); color:#EDEAE0;
  }
  body.pds-dark-page .kiwi-select-option[aria-selected="true"] { background:rgba(255,255,255,0.08); color:#F2EFE6; }
  body.pds-dark-page .kiwi-select-option:hover,
  body.pds-dark-page .kiwi-select-option.is-active { background:rgba(255,255,255,0.06); }

  /* KPI strip: the shared four cells, set like the landing's cards. */
  .pds-page .pds-kpis { margin:0; }
  .pds-page .pds-kpis .kx-kpi .l { text-transform:none; letter-spacing:0; font-size:12.5px; font-weight:500; }
  .pds-noir.pds-noir.pds-noir .pds-kpis { background:rgba(255,255,255,0.10); border-color:rgba(255,255,255,0.10); box-shadow:none; border-radius:16px; }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi { background:#050605; }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi .v { color:#F2EFE6; }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi .l { color:rgba(255,255,255,0.50); }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi .d { color:rgba(255,255,255,0.38); }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi.warn .v,
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi.warn .l { color:#00FFAE; }
  .pds-page .pds-kpis .kx-kpi.warn .v, .pds-page .pds-kpis .kx-kpi.warn .l { color:var(--atlas); }

  /* One toolbar: modes, zones, then live state and the page's actions. */
  .pds-page .pds-toolbar { margin:0; gap:8px; }
  .pds-toolbar-gap { flex:1 1 auto; }
  .pds-page .pds-modes, .pds-page .pds-zone-tabs {
    padding:3px; gap:2px; border-radius:12px; background:var(--paper-soft); border:1px solid var(--n-200);
  }
  .pds-page .pds-mode, .pds-page .pds-zone {
    height:32px; padding:0 14px; border-radius:9px; font:500 13px/1 var(--sans, 'Inter Tight'), system-ui;
    color:var(--n-600); letter-spacing:-0.005em; display:inline-flex; align-items:center; gap:7px;
  }
  .pds-page .pds-mode.active, .pds-page .pds-zone.active {
    background:var(--surface); color:var(--ink); font-weight:600; box-shadow:0 1px 2px rgba(10,15,13,0.10), 0 0 0 1px var(--n-200);
  }
  .pds-page .pds-zone em { font:500 11.5px/1 var(--sans, 'Inter Tight'), system-ui; color:var(--n-500); font-variant-numeric:tabular-nums; }
  .pds-page .pds-zone-add { width:32px; padding:0; justify-content:center; font-size:16px; }
  .pds-act.kb { height:36px; }
  .pds-act.kb.primary { padding-inline:16px; }
  .pds-more { position:relative; }
  .pds-more > summary { list-style:none; cursor:pointer; position:relative; }
  .pds-more > summary::-webkit-details-marker { display:none; }
  .pds-more-dot { position:absolute; top:6px; right:6px; width:7px; height:7px; border-radius:50%; background:var(--danger, #B4362A); }
  .pds-more-pop {
    position:absolute; right:0; top:calc(100% + 6px); z-index:40; min-width:240px; padding:6px;
    display:grid; gap:2px; border:1px solid var(--n-200); border-radius:14px; background:var(--surface);
    box-shadow:0 18px 40px -16px rgba(10,15,13,0.28);
  }
  .pds-more-pop button {
    display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; padding:10px 12px;
    border:0; border-radius:9px; background:transparent; color:var(--ink); font:500 13.5px/1.2 var(--sans, 'Inter Tight'), system-ui;
    text-align:left; cursor:pointer;
  }
  .pds-more-pop button:hover { background:var(--paper-soft); }
  .pds-more-pop button em { font-style:normal; font-size:11.5px; color:var(--danger, #B4362A); }
  .pds-more-pop button.is-danger { color:var(--danger, #B4362A); }

  /* Stage: two quiet columns around the room. */
  .pds-page .pds-stage-grid { grid-template-columns:232px minmax(0, 1fr) 272px; gap:16px; }
  @media (max-width: 1280px) { .pds-page .pds-stage-grid { grid-template-columns:228px minmax(0, 1fr) 260px; } }
  @media (max-width: 1100px) { .pds-page .pds-stage-grid { grid-template-columns:220px minmax(0, 1fr); } }
  .pds-page .pds-rail, .pds-page .pds-inspector {
    top:calc(var(--pds-top, 72px) + 12px); max-height:calc(100dvh - var(--pds-top, 72px) - 24px); gap:12px; padding-right:2px;
  }
  .pds-page .pds-rail-card { background:var(--surface); border:1px solid var(--n-200); border-radius:16px; padding:16px; box-shadow:none; }
  .pds-page .pds-rail-title {
    margin:0 0 12px; font:600 13.5px/1.3 var(--sans, 'Inter Tight'), system-ui; letter-spacing:-0.01em;
    text-transform:none; color:var(--ink);
  }
  .pds-page .pds-rail-hint { font-size:12px; line-height:1.5; color:var(--n-600); }
  .pds-rail-sub { margin:14px 0 8px; font:500 11.5px/1.2 var(--sans, 'Inter Tight'), system-ui; color:var(--n-500); }
  .pds-rail-sub:first-of-type { margin-top:0; }
  .pds-rail-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px; }
  .pds-rail-head .pds-rail-title { margin:0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pds-rail-head-tools { display:inline-flex; gap:4px; flex:none; }
  .pds-page .pds-zone-tools { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:4px; }
  .pds-page .pds-zone-tools .kb { height:34px; justify-content:center; font-size:12.5px; padding:0 8px; min-width:0; }
  .pds-link { display:inline-block; margin-top:14px; padding:0; border:0; background:none; cursor:pointer;
    font:500 12.5px/1.2 var(--sans, 'Inter Tight'), system-ui; color:var(--atlas); }
  .pds-link:hover { text-decoration:underline; text-underline-offset:3px; }
  .pds-link-danger { color:var(--danger, #B4362A); }
  .pds-page .pds-rail-warn { display:flex; flex-direction:column; gap:2px; margin:0; border-radius:14px; padding:12px 14px; }
  .pds-page .pds-rail-warn .pds-link { margin-top:6px; color:inherit; text-decoration:underline; text-underline-offset:3px; }
  .pds-fold > summary { list-style:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between; margin:0; }
  .pds-fold > summary::-webkit-details-marker { display:none; }
  .pds-fold > summary::after { content:""; width:7px; height:7px; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor;
    transform:rotate(45deg) translateY(-2px); opacity:0.5; transition:transform .2s; }
  .pds-fold[open] > summary { margin-bottom:12px; }
  .pds-fold[open] > summary::after { transform:rotate(-135deg) translateY(-2px); }
  .pds-page .pds-palette { gap:6px; }
  .pds-page .pds-palette-el { grid-template-columns:repeat(3, minmax(0, 1fr)); }
  .pds-page .pds-pal-item { border-radius:12px; border:1px solid var(--n-200); background:var(--paper-soft); padding:10px 4px 8px; transition:border-color .16s, background-color .16s; }
  .pds-page .pds-pal-item:hover { border-color:var(--atlas); background:var(--surface); transform:none; box-shadow:none; }
  .pds-page .pds-pal-label { font-size:11px; color:var(--n-600); }
  .pds-fold-sub { border-top:1px solid var(--n-200); padding-top:10px; margin-top:10px; }
  .pds-fold-sub:first-of-type { border-top:0; padding-top:0; margin-top:0; }
  .pds-fold-sub > summary.pds-rail-sub { margin:0; }
  .pds-fold-sub[open] > summary.pds-rail-sub { margin-bottom:10px; }
  .pds-fold-sub > summary em { margin-left:auto; margin-right:10px; font-style:normal; font-variant-numeric:tabular-nums; opacity:0.7; }
  .pds-noir.pds-noir.pds-noir .pds-fold-sub { border-color:rgba(255,255,255,0.08); }
  .pds-page .pds-live-sub { text-transform:none; letter-spacing:0; font-size:12px; font-weight:500; }
  .pds-page .pds-kbd-hint { margin:10px 0 0; text-align:left; white-space:normal; font-size:11.5px; line-height:1.5; color:var(--n-500); }

  /* Canvas: tools on one quiet line, the room as the subject, the legend
     under it like the landing's figure. */
  .pds-page .pds-canvas-wrap { gap:10px; }
  .pds-page .pds-canvas-bar { background:transparent; border:0; padding:0; border-radius:0; justify-content:space-between; }
  .pds-page .pds-bar-tools { gap:6px; }
  .pds-page .pds-tool { width:32px; height:32px; border-radius:9px; }
  .pds-page .pds-tool.pds-zoom-val { width:auto; }
  .pds-page .pds-heat { border-radius:10px; }
  .pds-page .pds-heat-opt { height:26px; padding:0 10px; font-size:12px; }
  .pds-page .pds-plan-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:2px 4px 0; }
  .pds-page .pds-plan-footer .pds-legend { gap:4px 6px; }
  .pds-plan-meta { display:inline-flex; align-items:center; gap:14px; }
  .pds-page .pds-plan-canvas { background:transparent !important; border:0; padding:0; box-shadow:none; }

  /* ── Night: the landing, applied to the whole page ── */
  .pds-noir.pds-noir.pds-noir.pds-host { background:transparent; }
  .pds-noir.pds-noir.pds-noir .pds-modes,
  .pds-noir.pds-noir.pds-noir .pds-zone-tabs,
  .pds-noir.pds-noir.pds-noir .pds-heat { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.10); }
  .pds-noir.pds-noir.pds-noir .pds-mode, .pds-noir.pds-noir.pds-noir .pds-zone { color:rgba(255,255,255,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-mode:hover, .pds-noir.pds-noir.pds-noir .pds-zone:hover { color:rgba(255,255,255,0.85); }
  .pds-noir.pds-noir.pds-noir .pds-mode.active,
  .pds-noir.pds-noir.pds-noir .pds-zone.active { background:rgba(255,255,255,0.10); color:#F2EFE6; box-shadow:none; }
  .pds-noir.pds-noir.pds-noir .pds-zone em { color:rgba(255,255,255,0.40); }
  .pds-noir.pds-noir.pds-noir .pds-act.kb.ghost,
  .pds-noir.pds-noir.pds-noir .pds-zone-tools .kb.ghost { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.12); color:rgba(255,255,255,0.85); }
  .pds-noir.pds-noir.pds-noir .pds-act.kb.ghost:hover,
  .pds-noir.pds-noir.pds-noir .pds-zone-tools .kb.ghost:hover { border-color:rgba(255,255,255,0.30); color:#fff; }
  .pds-noir.pds-noir.pds-noir .pds-more-pop { background:#0B0D0C; border-color:rgba(255,255,255,0.12); box-shadow:0 18px 40px -12px rgba(0,0,0,0.8); }
  .pds-noir.pds-noir.pds-noir .pds-more-pop button { color:rgba(255,255,255,0.85); }
  .pds-noir.pds-noir.pds-noir .pds-more-pop button:hover { background:rgba(255,255,255,0.06); }
  .pds-noir.pds-noir.pds-noir .pds-more-pop button.is-danger,
  .pds-noir.pds-noir.pds-noir .pds-more-pop button em { color:#F29A8C; }
  .pds-noir.pds-noir.pds-noir .pds-rail-card { background:rgba(255,255,255,0.025); border-color:rgba(255,255,255,0.10); }
  .pds-noir.pds-noir.pds-noir .pds-rail-title { color:#F2EFE6; }
  .pds-noir.pds-noir.pds-noir .pds-rail-hint,
  .pds-noir.pds-noir.pds-noir .pds-kbd-hint { color:rgba(255,255,255,0.45); }
  .pds-noir.pds-noir.pds-noir .pds-rail-sub { color:rgba(255,255,255,0.40); }
  .pds-noir.pds-noir.pds-noir .pds-link { color:#7DF2B0; }
  .pds-noir.pds-noir.pds-noir .pds-link-danger { color:#F29A8C; }
  .pds-noir.pds-noir.pds-noir .pds-pal-item { background:rgba(255,255,255,0.03); border-color:rgba(255,255,255,0.10); }
  .pds-noir.pds-noir.pds-noir .pds-pal-item:hover { border-color:rgba(0,255,174,0.55); background:rgba(0,255,174,0.04); }
  .pds-noir.pds-noir.pds-noir .pds-pal-label { color:rgba(255,255,255,0.55); }
  .pds-noir.pds-noir.pds-noir .pds-tool { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.10); color:rgba(255,255,255,0.70); }
  .pds-noir.pds-noir.pds-noir .pds-tool:hover { border-color:rgba(255,255,255,0.30); color:#fff; background:rgba(255,255,255,0.06); }
  .pds-noir.pds-noir.pds-noir .pds-canvas-bar { background:transparent; border:0; }
  .pds-noir.pds-noir.pds-noir .pds-plan-canvas { background:transparent; border:0; padding:0; }
  .pds-noir.pds-noir.pds-noir .pds-snap { color:rgba(255,255,255,0.60); }

  /* Legend = the landing's: 17 × 13 swatches, 11 px, white at 0.5. */
  .pds-noir.pds-noir.pds-noir .pds-sw-free     { border-color:rgba(255,255,255,0.19); background:rgba(255,255,255,0.012); border-style:solid; }
  .pds-noir.pds-noir.pds-noir .pds-sw-ordering { border-color:rgba(255,255,255,0.40); background:rgba(255,255,255,0.035); border-style:solid; }
  .pds-noir.pds-noir.pds-noir .pds-sw-occupied { border-color:rgba(255,255,255,0.60); background:rgba(255,255,255,0.075); border-style:solid; }
  .pds-noir.pds-noir.pds-noir .pds-sw-bill     { border-color:#00FFAE; background:rgba(0,255,174,0.11); border-width:1.25px; border-style:solid; }
  .pds-noir.pds-noir.pds-noir .pds-sw-paid     { border-color:rgba(255,255,255,0.40); background:rgba(255,255,255,0.02); border-style:dotted; }
  .pds-noir.pds-noir.pds-noir .pds-sw-reserved { border-color:rgba(255,255,255,0.45); background:rgba(255,255,255,0.03); border-style:dashed; }
  .pds-noir.pds-noir.pds-noir .pds-sw-out      { border-color:rgba(255,255,255,0.14); background:none; border-style:dashed; }
  .pds-noir.pds-noir.pds-noir .pds-pill-ordering { background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.70); border:1px solid rgba(255,255,255,0.30); }
  .pds-noir.pds-noir.pds-noir .pds-pill-occupied { background:rgba(255,255,255,0.08); color:#F2EFE6; border:1px solid rgba(255,255,255,0.45); }
  .pds-noir.pds-noir.pds-noir .pds-pill-bill { background:rgba(0,255,174,0.10); color:#00FFAE; border:1px solid rgba(0,255,174,0.50); }
  .pds-noir.pds-noir.pds-noir .pds-pill-reserved { background:rgba(255,255,255,0.03); color:rgba(255,255,255,0.75); border:1px dashed rgba(255,255,255,0.45); }

  /* Chips on the room: the landing's « 6 min » pill; mint only for money
     waiting to be paid. */
  .pds-noir.pds-noir.pds-noir .pds-bill-chip { background:rgba(10,10,10,0.92); border-color:rgba(255,255,255,0.18); color:rgba(255,255,255,0.72); }
  .pds-noir.pds-noir.pds-noir .pds-tbl-cell[data-status="bill"] .pds-bill-chip { background:rgba(4,26,20,0.92); border-color:rgba(0,255,174,0.55); color:#00FFAE; }
  .pds-noir.pds-noir.pds-noir .pds-tbl-since.is-check { border-color:rgba(255,255,255,0.35); color:rgba(255,255,255,0.85); background:rgba(10,10,10,0.92); }
  .pds-noir.pds-noir.pds-noir .pds-resv-chip { background:rgba(10,10,10,0.92); border-color:rgba(255,255,255,0.30); color:rgba(255,255,255,0.80); box-shadow:none; }
  .pds-noir.pds-noir.pds-noir .pds-kpis .kx-kpi.warn .d { color:rgba(0,255,174,0.70); }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-urgent .pds-live-sub { color:#00FFAE; }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-urgent .pds-live-row { background:rgba(0,255,174,0.06); }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-urgent .pds-live-row em { color:#00FFAE; }
  .pds-noir.pds-noir.pds-noir .pds-live-sec.is-check .pds-live-sub { color:rgba(255,255,255,0.75); }
  .pds-noir.pds-noir.pds-noir .pds-till-bill { border-color:rgba(0,255,174,0.45); background:rgba(0,255,174,0.05); }
  .pds-noir.pds-noir.pds-noir .pds-till-bill b { color:#00FFAE; }

  /* ── Day: the same scale in ink, atlas for the bill ── */
  .pds-page .pds-sw-free     { border-color:rgba(10,15,13,0.24); background:rgba(10,15,13,0.012); border-style:solid; }
  .pds-page .pds-sw-ordering { border-color:rgba(10,15,13,0.48); background:rgba(10,15,13,0.035); border-style:solid; }
  .pds-page .pds-sw-occupied { border-color:rgba(10,15,13,0.78); background:rgba(10,15,13,0.07); border-style:solid; }
  .pds-page .pds-sw-bill     { border-color:#0B6E4F; background:rgba(11,110,79,0.12); border-style:solid; }
  .pds-page .pds-sw-paid     { border-color:rgba(10,15,13,0.45); background:rgba(10,15,13,0.02); border-style:dotted; }
  .pds-page .pds-sw-reserved { border-color:rgba(10,15,13,0.55); background:rgba(10,15,13,0.03); border-style:dashed; }
  .pds-page .pds-sw-out      { border-color:rgba(10,15,13,0.16); background:none; border-style:dashed; }
  .pds-page .pds-tbl-cell[data-status="bill"] .pds-bill-chip { background:#0B6E4F; border-color:#0B6E4F; color:#F7F5F0; }
  .pds-page .pds-bill-chip { border-color:rgba(10,15,13,0.18); color:rgba(10,15,13,0.72); }
  .pds-page .pds-live-sec.is-urgent .pds-live-sub,
  .pds-page .pds-live-sec.is-urgent .pds-live-row em { color:var(--atlas); }
  .pds-page .pds-live-sec.is-urgent .pds-live-row { background:rgba(11,110,79,0.06); }
  .pds-page .pds-till-bill { border-color:rgba(11,110,79,0.40); background:rgba(11,110,79,0.05); }
  .pds-page .pds-till-bill b { color:var(--atlas); }
  .pds-page .pds-tbl-since.is-check { border-color:rgba(10,15,13,0.30); color:rgba(10,15,13,0.80); background:rgba(247,245,240,0.96); }
  .pds-page .pds-pill-ordering { background:rgba(10,15,13,0.05); color:var(--n-700); }
  .pds-page .pds-pill-bill { background:rgba(11,110,79,0.12); color:var(--atlas); }

  @media (max-width: 760px) {
    .pds-toolbar-gap { display:none; }
    .pds-page .pds-toolbar { gap:6px; }
  }
`;

/* ═══════════════════════════════════════════════════════════════════════════
 * 2 ·  MENU & MODIFICATEURS  ·  width 980
 * ═══════════════════════════════════════════════════════════════════════════ */
handlers['nav-menu'] = () => {
  const CATS = [
    { key: 'entrees', label: 'Entrées',  count: 8 },
    { key: 'tajines', label: 'Tajines',  count: 9 },
    { key: 'couscous', label: 'Couscous', count: 5 },
    { key: 'desserts', label: 'Desserts', count: 8 },
    { key: 'boissons', label: 'Boissons', count: 18 },
  ];
  const MENU = {
    entrees: [
      ['ent-1', 'Salade marocaine',   'Tomate, concombre, oignon, huile d\'olive',     32,  'ok',  'illimité', 'sans coriandre', '', 6,  142, '+ 32 cette semaine'],
      ['ent-2', 'Briouates viande',    'Triangles croustillants, bœuf mijoté',          45,  'ok',  '32 portions', '', '', 8,  84, '+ 8 %'],
      ['ent-3', 'Harira',              'Soupe traditionnelle pois chiches & lentilles', 28,  'ok',  'illimité', 'extra dattes · sans céleri', '', 7,  98,  'pic Ramadan'],
      ['ent-4', 'Zaalouk',             'Aubergine fumée, tomate, ail',                  28,  'low', '6 portions',  'sans coriandre', 'gluten-free', 12, 56, 'top 30 %'],
      ['ent-5', 'Bissara',             'Fèves moulues, cumin, huile d\'olive',           22,  'ok',  'illimité', '', 'gluten-free', 14, 38, 'classique'],
    ],
    tajines: [
      ['taj-1', 'Tajine kefta œuf',     'Viande hachée, œuf, tomate, épices',           85,  'ok',  '+ 3 modificateurs', 'sans coriandre · pain à part · piment fort', '', 1, 312, '+ 12 % marge'],
      ['taj-2', 'Tajine agneau pruneaux','Agneau mijoté, pruneaux, amandes',            110, 'out', '0 portion · ruptu.','sans gluten', 'sans gluten', 4, 184, 'top weekend'],
      ['taj-3', 'Tajine poulet citron',  'Poulet, olives, citron confit',                95,  'ok',  '24 portions',  'sans olives', '', 3, 226, '+ 5 %'],
      ['taj-4', 'Tajine kefta classique','Boulettes, sauce tomate, œufs',                75,  'ok',  '18 portions',  '', '', 5, 168, 'régulier'],
      ['taj-5', 'Tajine boeuf prunes',   'Bœuf mijoté 4h, pruneaux d\'Agen',             125, 'low', '4 portions',   '', '', 6, 142, 'premium'],
    ],
    couscous: [
      ['cou-1', 'Couscous royal',         'Bœuf, poulet, merguez, légumes',             95,  'ok',  '+ 2 modificateurs', 'sans piment · merguez doux', '', 2, 287, 'vendredi · top'],
      ['cou-2', 'Couscous légumes',       '7 légumes, pois chiches, raisins',           68,  'ok',  'illimité',  '', 'végan', 9, 64, 'gluten · semoule'],
      ['cou-3', 'Couscous agneau',        'Agneau braisé, oignons confits',             105, 'low', '5 portions','sans piment', '', 7, 98, '+ 18 %'],
      ['cou-4', 'Pastilla au poulet',     'Feuille fine, amandes, cannelle',            120, 'low', '3 portions','sucré ou salé', '', 3, 156, 'effet wow'],
    ],
    desserts: [
      ['des-1', 'Msemen beurre & miel',   'Crêpe feuilletée, beurre, miel',             12,  'ok',  'illimité',  '', '', 6,  221, 'top breakfast'],
      ['des-2', 'Cornes de gazelle',      'Pâte d\'amande, fleur d\'oranger',           28,  'low', '12 pièces', '', 'sans gluten possible', 11, 72, 'cadeau client'],
      ['des-3', 'Sellou',                 'Graines de sésame, amandes, miel',           30,  'ok',  'artisanal', '', '', 13, 38, 'occasionnel'],
      ['des-4', 'Chebakia',               'Gâteaux de miel frit · Ramadan',             24,  'out', 'saisonnier','', '', 15, 0,  'rupture'],
    ],
    boissons: [
      ['bo-1', 'Thé à la menthe',         'Gunpowder + menthe fraîche + sucre',         12,  'ok',  'illimité',  'sucre à part · double menthe', '', 5, 412, '#1 vente'],
      ['bo-2', 'Orange pressée',          'Pressée minute · 45 oranges en stock',       18,  'ok',  '45 oranges','sans glace · double', '', 7, 198, '+ 8 %'],
      ['bo-3', 'Café noir double',        'Espresso double · grain Algeria',            14,  'ok',  '+ 4 modif. lait',  'lait amande · lait avoine · sans sucre', '', 10, 124, 'régulier'],
      ['bo-4', 'Limonade traditionnelle', 'Citron vert + eau de fleur d\'oranger',      16,  'ok',  'illimité',  'sans sucre · pétillante', '', 8, 87, 'été'],
      ['bo-5', 'Méchoui',                 'Agneau rôti, parts pour 2 · 4',              180, 'low', '2 portions', 'parts pour 4 · épices fortes', '', 16, 24, 'haut de gamme'],
    ],
  };
  let activeCat = 'tajines';
  let menu86 = new Set(['taj-2', 'des-4']);

  const tagsHtml = (allerg, free) => {
    const out = [];
    if (allerg) out.push(`<span class="tg warn">${allerg.split(' · ')[0]}</span>`);
    if (free)   out.push(`<span class="tg">${free}</span>`);
    return out.join('');
  };
  const stockChip = (st) => st === 'ok' ? '<span class="chip ok">en stock</span>' : st === 'low' ? '<span class="chip pend">stock bas</span>' : '<span class="chip ref">RUPTURE</span>';

  const renderRow = (item, idx, total) => {
    const [id, name, desc, price, st, , mod, free, rank, sold, perf] = item;
    const is86 = menu86.has(id);
    return `
      <div class="menu-row ${is86 ? 'is-86' : ''}" data-row="${id}">
        <div class="photo">${name.includes('Tajine') ? '◉' : name.includes('Couscous') ? '◓' : name.includes('Café') || name.includes('Thé') ? '☕' : name.includes('Pastilla') ? '✦' : name.includes('Salade') ? '◴' : '●'}</div>
        <div class="nm">${name}<div class="desc">${desc}</div><div class="tags">${stockChip(is86 ? 'out' : st)} ${mod ? `<span class="tg">${mod.split(' · ').length} modif.</span>` : ''} ${tagsHtml('', free)}</div></div>
        <div class="pr">${(window.KiwiNumber?.format(price, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? price.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} MAD</div>
        <div class="rk"><b>#${rank}</b><div style="font-size:11px; color:var(--n-500);">${sold} vendus</div></div>
        <div class="menu-cat-actions" style="justify-content:flex-end;">
          <button class="ord-arrow" data-row-act="up" data-id="${id}" ${idx === 0 ? 'disabled style="opacity:0.3;"' : ''} aria-label="Monter">▲</button>
          <button class="ord-arrow" data-row-act="dn" data-id="${id}" ${idx === total - 1 ? 'disabled style="opacity:0.3;"' : ''} aria-label="Descendre">▼</button>
          <span class="toggle-86 ${is86 ? 'on' : ''}" data-row-act="86" data-id="${id}" title="${is86 ? 'Réactiver' : '86 it (rupture)'}"></span>
        </div>
        <div class="more" data-row-act="edit" data-id="${id}">⋯</div>
      </div>
    `;
  };

  const renderItems = (catKey) => {
    const list = MENU[catKey] || [];
    return list.map((it, i) => renderRow(it, i, list.length)).join('');
  };

  const menuDr = drawer({
    title: 'Menu & modificateurs · Café Atlas',
    subtitle: '45 items actifs · 5 catégories · 12 modificateurs · 2 produits 86\'d',
    width: 980,
    body: `
      <div class="p-kpis">
        <div class="p-kpi"><div class="l">CARTE ACTIVE</div><div class="v">45<span class="u">items</span></div><div class="d up">+ 3 ce mois</div></div>
        <div class="p-kpi"><div class="l">PANIER MOYEN</div><div class="v">158<span class="u"> MAD</span></div><div class="d up">+ 4,2 % vs sem. dernière</div></div>
        <div class="p-kpi"><div class="l">MARGE BRUTE</div><div class="v">66<span class="u">%</span></div><div class="d">cible 68 %</div></div>
        <div class="p-kpi" style="background:rgba(201,74,58,0.06); border-color:rgba(201,74,58,0.25);"><div class="l">86'D</div><div class="v" style="color:var(--danger);">2</div><div class="d">tajine agneau · chebakia</div></div>
      </div>

      <div class="menu-ai">
        <div class="ic">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg>
        </div>
        <div class="b">
          <div class="t">INSIGHT KIWI · 4H AGO</div>
          <div class="n">Promouvoir le tajine kefta œuf cette semaine.</div>
          <div class="d">+ 12 % de marge vs moyenne carte · lift +18 % attendu si placé en bannière catalogue.</div>
        </div>
        <button class="kb" style="background:var(--mint); color:var(--riad);" data-action="menu-promote">Mettre en avant</button>
      </div>

      <div class="p-toolbar">
        <div class="p-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
          Rechercher un item, un modificateur, un allergène…
        </div>
        <button class="kb ghost" data-action="menu-schedule">⏱ Plages horaires</button>
        <button class="kb ghost" data-action="menu-mass">Édition groupée</button>
        <button data-activation=write class="kb atlas" data-action="menu-add">+ Ajouter un item</button>
      </div>

      <div class="menu-pill-cats" id="menu-cats">
        ${CATS.map(c => `<button data-activation=write class="menu-pill-cat ${c.key === activeCat ? 'on' : ''}" data-cat="${c.key}">${c.label}<span class="ct">${c.count}</span></button>`).join('')}
      </div>

      <div class="p-pane" id="menu-pane">
        ${renderItems(activeCat)}
      </div>

      <div class="p-card" style="margin-top:18px;">
        <div class="head">
          <h4>Modificateurs partagés</h4>
          <span class="meta">12 ACTIFS · GLOBAUX SUR LA CARTE</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; font-size:12.5px;">
          ${[
            ['Sans coriandre', '21 items', 'gratuit'],
            ['Sans piment',    '18 items', 'gratuit'],
            ['Pain à part',    '15 items', 'gratuit'],
            ['Sucre à part',   '8 items',  'gratuit'],
            ['Double menthe',  'thé · 1 item', '+ 2 MAD'],
            ['Lait amande',    'cafés · 4 items', '+ 4 MAD'],
            ['Lait avoine',    'cafés · 4 items', '+ 4 MAD'],
            ['Parts pour 4',   'méchoui · 1 item', '+ 90 MAD'],
            ['Sans gluten',    '6 items',  'gratuit'],
            ['Bien cuit',      'tajines · 5', 'gratuit'],
            ['Saignant',       'tajines · 5', 'gratuit'],
            ['Pétillante',     'limonade · 1', '+ 1 MAD'],
          ].map(([n, scope, fee]) => `
            <div style="background:var(--surface); border:1px solid var(--n-200); border-radius:9px; padding:9px 11px;">
              <div style="font-weight:500; letter-spacing:-0.005em;">${n}</div>
              <div style="font-size:11px; color:var(--n-500); font-family:var(--mono); margin-top:3px; display:flex; justify-content:space-between;"><span>${scope}</span><span>${fee}</span></div>
            </div>
          `).join('')}
        </div>
      </div>
    `,
    foot: `
      <div style="display:flex; gap:8px; justify-content:space-between; width:100%; align-items:center;">
        <span style="font-family:var(--mono); font-size:11px; color:var(--n-500); letter-spacing:0.06em;">SYNC POS · 100 % · DERNIÈRE MAJ 12:42</span>
        <div style="display:flex; gap:8px;">
          <button class="kb ghost" data-dismiss>Fermer</button>
          <button data-activation=write class="kb primary" data-action="menu-publish">Publier la carte</button>
        </div>
      </div>
    `,
  });

  wireDismiss(menuDr);

  /* — wire up tabs, 86 toggles, reorder arrows, edit row — */
  setTimeout(() => {
    const root = menuDr.el;
    if (!root) return;
    const pane = root.querySelector('#menu-pane');

    root.querySelectorAll('#menu-cats .menu-pill-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-cat');
        if (key === activeCat) return;
        activeCat = key;
        root.querySelectorAll('#menu-cats .menu-pill-cat').forEach(b => b.classList.toggle('on', b === btn));
        pane.innerHTML = renderItems(activeCat);
        wireRows();
      });
    });

    function wireRows() {
      pane.querySelectorAll('[data-row-act]').forEach(b => {
        b.onclick = (e) => {
          e.stopPropagation();
          const a = b.getAttribute('data-row-act');
          const id = b.getAttribute('data-id');
          const list = MENU[activeCat];
          const idx = list.findIndex(x => x[0] === id);
          if (a === '86') {
            if (menu86.has(id)) menu86.delete(id); else menu86.add(id);
            window.Kiwi.toast(menu86.has(id) ? `${list[idx][1]} marqué 86 (rupture)` : `${list[idx][1]} de retour à la carte`, { type: menu86.has(id) ? 'warn' : 'success', desc: menu86.has(id) ? 'Retiré de la caisse et du QR menu.' : 'Item disponible sur tous les canaux.' });
            pane.innerHTML = renderItems(activeCat);
            wireRows();
          }
          if (a === 'up' && idx > 0) {
            [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
            pane.innerHTML = renderItems(activeCat);
            wireRows();
            window.Kiwi.toast(`${list[idx - 1][1]} repositionné`, { type: 'info' });
          }
          if (a === 'dn' && idx < list.length - 1) {
            [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
            pane.innerHTML = renderItems(activeCat);
            wireRows();
            window.Kiwi.toast(`${list[idx + 1][1]} repositionné`, { type: 'info' });
          }
          if (a === 'edit') openItemEdit(list[idx]);
        };
      });
      pane.querySelectorAll('.menu-row').forEach(r => {
        r.addEventListener('click', (e) => {
          if (e.target.closest('[data-row-act]')) return;
          const id = r.getAttribute('data-row');
          const list = MENU[activeCat];
          const item = list.find(x => x[0] === id);
          if (item) openItemEdit(item);
        });
      });
    }
    wireRows();
  }, 0);
};

/* ─── Item edit modal ──────────────────────────────────────────────────── */
function openItemEdit(it) {
  const [, name, desc, price, , avail, mod, free, rank, sold, perf] = it;
  const editM = window.Kiwi.modal({
    tag: 'ITEM',
    title: name,
    desc: desc,
    width: 640,
    body: `
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Nom</label><input class="kf-input" value="${name}" /></div>
        <div class="kf-group"><label class="kf-label">Prix TTC</label><input class="kf-input mono" value="${price}.00" /></div>
      </div>
      <div class="kf-group">
        <label class="kf-label">Description courte</label>
        <input class="kf-input" value="${desc}" />
      </div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Catégorie</label>
          <select class="kf-input"><option>Entrées</option><option selected>Tajines</option><option>Couscous</option><option>Desserts</option><option>Boissons</option></select>
        </div>
        <div class="kf-group"><label class="kf-label">Temps de prep.</label>
          <select class="kf-input"><option>5 min</option><option>10 min</option><option selected>15 min</option><option>20 min</option><option>25 min</option><option>30 min</option></select>
        </div>
      </div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Allergènes</label>
          <input class="kf-input" value="œuf · gluten" placeholder="ex. arachides · gluten" />
        </div>
        <div class="kf-group"><label class="kf-label">Coût matière</label>
          <input class="kf-input mono" value="${Math.round(price * 0.34)}.00" />
        </div>
      </div>
      <div class="kf-group">
        <label class="kf-label">Modificateurs autorisés</label>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${['Sans coriandre', 'Sans piment', 'Pain à part', 'Bien cuit', 'Saignant', 'Sans gluten'].map((m, i) => `<span class="chip ${i<3?'ok':'neutral'}" style="cursor:pointer;">${i<3?'✓ ':''}${m}</span>`).join('')}
        </div>
      </div>
      <div class="p-card" style="margin:14px 0 0;">
        <div class="head"><h4 style="font-size:13px;">Performance · 30 derniers jours</h4><span class="meta">RANG #${rank}</span></div>
        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:14px; font-size:12.5px;">
          <div><div style="color:var(--n-500); font-size:11px;">Vendus</div><div class="mono" style="font-size:18px; font-weight:600;">${sold}</div></div>
          <div><div style="color:var(--n-500); font-size:11px;">CA</div><div class="mono" style="font-size:18px; font-weight:600;">${(window.KiwiNumber?.format((price * sold), {}) ?? (price * sold).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}))} MAD</div></div>
          <div><div style="color:var(--n-500); font-size:11px;">Marge brute</div><div class="mono" style="font-size:18px; font-weight:600; color:var(--atlas);">66 %</div></div>
        </div>
      </div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Annuler</button>
      <button data-activation=write class="kb danger" data-dismiss onclick="window.Kiwi.toast('${name} supprimé de la carte',{type:'warn',desc:'Item retiré · les commandes ouvertes restent valides.'})">Supprimer</button>
      <button data-activation=write class="kb atlas" data-dismiss onclick="window.Kiwi.toast('${name} mis à jour',{type:'success',desc:'Visible sur votre caisse et votre QR menu.'})">Enregistrer</button>
    `
  });
  if (typeof wireDismiss === 'function') wireDismiss(editM);
}

handlers['menu-add'] = () => {
  wireDismiss(modal({
    tag: 'NOUVEAU',
    title: 'Ajouter un nouvel item',
    desc: 'L\'item sera publié sur le POS, le QR menu et les agrégateurs en sync.',
    width: 600,
    body: `
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Nom de l'item</label><input class="kf-input" placeholder="ex. Tajine boulettes" /></div>
        <div class="kf-group"><label class="kf-label">Prix TTC</label><input class="kf-input mono" placeholder="0,00 MAD" /></div>
      </div>
      <div class="kf-group"><label class="kf-label">Catégorie</label>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${['Entrées', 'Tajines', 'Couscous', 'Desserts', 'Boissons'].map((c, i) => `<button class="kb ${i===1?'atlas':'ghost'}" style="flex:1; min-width:90px; justify-content:center;">${c}</button>`).join('')}
        </div>
      </div>
      <div class="kf-group"><label class="kf-label">Description (visible client)</label><input class="kf-input" placeholder="Ingrédients clés et style" /></div>
      <div class="kf-row">
        <div class="kf-group"><label class="kf-label">Allergènes</label><input class="kf-input" placeholder="optionnel" /></div>
        <div class="kf-group"><label class="kf-label">Temps de prep.</label>
          <select class="kf-input"><option>5</option><option>10</option><option selected>15</option><option>20</option><option>25</option><option>30</option></select>
        </div>
      </div>
      <label style="display:flex; gap:10px; align-items:center; padding:10px 12px; background:var(--paper-soft); border-radius:10px; font-size:13px; cursor:pointer; margin-bottom:6px;">
        <input type="checkbox" checked /> Publier immédiatement sur la caisse et le QR menu
      </label>
      <label style="display:flex; gap:10px; align-items:center; padding:10px 12px; background:var(--paper-soft); border-radius:10px; font-size:13px; cursor:pointer;">
        <input type="checkbox" /> Marquer "nouveau" pendant 14 jours
      </label>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Annuler</button>
      <button data-activation=write class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Item publié sur la carte',{type:'success',desc:'Visible sur votre caisse et votre QR menu.'}); window.Kiwi.confetti();">Créer & publier</button>
    `
  }));
};

handlers['menu-mass'] = () => {
  wireDismiss(modal({
    tag: 'ÉDITION GROUPÉE',
    title: 'Modifier toute une catégorie',
    desc: 'Affecte tous les items sélectionnés en une opération.',
    width: 540,
    body: `
      <div class="kf-group"><label class="kf-label">Catégorie</label>
        <select class="kf-input"><option>Entrées (8)</option><option selected>Tajines (9)</option><option>Couscous (5)</option><option>Desserts (8)</option><option>Boissons (18)</option></select>
      </div>
      <div class="kf-group"><label class="kf-label">Action</label>
        <select class="kf-input">
          <option>Augmenter les prix de…</option>
          <option>Diminuer les prix de…</option>
          <option>Marquer la catégorie 86 (rupture)</option>
          <option>Activer disponibilité midi uniquement</option>
          <option>Cacher de la carte client</option>
        </select>
      </div>
      <div class="kf-group"><label class="kf-label">Pourcentage</label>
        <div style="display:flex; gap:6px;">
          ${['+ 2 %', '+ 5 %', '+ 8 %', '+ 10 %', 'autre'].map((p, i) => `<button class="kb ${i===1?'atlas':'ghost'}" style="flex:1; justify-content:center;">${p}</button>`).join('')}
        </div>
      </div>
      <div class="kf-help">9 items recevront +5 % · panier moyen estimé : 165 MAD (vs 158 MAD aujourd'hui).</div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Annuler</button>
      <button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('9 tajines ré-tarifés (+5 %)',{type:'success',desc:'Sync en cours · prochaine commande à 16:42.'})">Appliquer</button>
    `
  }));
};

handlers['menu-schedule'] = () => {
  wireDismiss(modal({
    tag: 'PLAGES HORAIRES',
    title: 'Carte programmée',
    desc: 'Affiche / cache automatiquement des items selon le service ou la saison.',
    width: 600,
    body: `
      <div class="p-card" style="margin:0 0 10px;">
        <div class="head"><h4 style="font-size:14px;">Couscous royal</h4><span class="chip ok">vendredi 11h–15h</span></div>
        <div style="font-size:12.5px; color:var(--n-500);">Affiché automatiquement le vendredi · masqué les autres jours.</div>
      </div>
      <div class="p-card" style="margin:0 0 10px;">
        <div class="head"><h4 style="font-size:14px;">Méchoui</h4><span class="chip pend">soir 19h–23h</span></div>
        <div style="font-size:12.5px; color:var(--n-500);">Service du soir uniquement · 24h de préavis automatique.</div>
      </div>
      <div class="p-card" style="margin:0 0 10px;">
        <div class="head"><h4 style="font-size:14px;">Carte Ramadan complète</h4><span class="chip pend">programmée</span></div>
        <div style="font-size:12.5px; color:var(--n-500);">Bascule automatique au coucher du soleil · 15 mars → 13 avril 2027. Harira, chebakia, briouates en avant-plan.</div>
      </div>
      <div class="p-card" style="margin:0;">
        <div class="head"><h4 style="font-size:14px;">Petit-déj.</h4><span class="chip neutral">8h–11h tous les jours</span></div>
        <div style="font-size:12.5px; color:var(--n-500);">Msemen, harira, café, thé. Switch automatique sur la carte midi à 11h00.</div>
      </div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Fermer</button>
      <button data-activation=write class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Programmation enregistrée',{type:'success',desc:'4 plages actives · sync POS et agrégateurs.'})">+ Ajouter une plage</button>
    `
  }));
};

handlers['menu-promote'] = () => {
  wireDismiss(modal({
    tag: 'PROMOUVOIR',
    title: 'Mettre en avant le tajine kefta œuf',
    desc: 'L\'item apparaîtra en bannière sur le QR menu et la caisse pendant 7 jours.',
    width: 540,
    body: `
      <div class="p-card" style="margin:0 0 10px;">
        <div class="head"><h4 style="font-size:14px;">Estimation</h4><span class="meta">7 JOURS</span></div>
        <dl style="display:grid; grid-template-columns:1fr auto; gap:5px 14px; font-size:13px; margin:0;">
          <dt style="color:var(--n-500);">Lift de ventes attendu</dt><dd class="mono" style="color:var(--success); font-weight:600;">+18 %</dd>
          <dt style="color:var(--n-500);">Marge incrémentale</dt><dd class="mono">+ 2 184 MAD</dd>
          <dt style="color:var(--n-500);">Coût</dt><dd class="mono">0 MAD</dd>
        </dl>
      </div>
      <label style="display:flex; gap:10px; align-items:center; padding:10px 12px; background:var(--paper-soft); border-radius:10px; font-size:13px; cursor:pointer;">
        <input type="checkbox" checked /> Inclure une photo générée par IA (gratuit)
      </label>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Plus tard</button>
      <button class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Tajine kefta œuf en avant',{type:'success',desc:'Bannière live sur le QR menu et la caisse.'}); window.Kiwi.confetti();">Lancer la promo</button>
    `
  }));
};

handlers['menu-publish'] = () => {
  wireDismiss(modal({
    tag: 'PUBLIER',
    title: 'Publier la carte ?',
    desc: 'La nouvelle version sera synchronisée sur tous les canaux en moins de 10 secondes.',
    width: 520,
    body: `
      <div class="p-card" style="margin:0;">
        <div class="head"><h4 style="font-size:14px;">12 modifications en attente</h4><span class="meta">DEPUIS 12:42</span></div>
        <ul style="list-style:none; margin:0; padding:0; font-size:13px;">
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">+ Ajout : <b>Pastilla aux fruits de mer</b></li>
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">~ Prix : Tajine kefta œuf 80 → <b>85 MAD</b></li>
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">86 : Tajine agneau pruneaux <span class="chip ref">RUPTURE</span></li>
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">~ Modificateurs : 3 nouveaux sur tajines</li>
          <li style="padding:8px 0; border-top:1px solid var(--n-200);">~ 8 réorderings de catégorie</li>
        </ul>
      </div>
    `,
    foot: `
      <button class="kb ghost" data-dismiss>Garder en brouillon</button>
      <button data-activation=write class="kb atlas" data-dismiss onclick="window.Kiwi.toast('Carte publiée',{type:'success',desc:'Caisse et QR menu à jour.'}); window.Kiwi.confetti();">Publier maintenant</button>
    `
  }));
};
})();

/* ═══ Section 2 rest B · kds / stock ═══ */
(function() {
  "use strict";
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const handlers = Kiwi.handlers;
  const drawer = Kiwi.drawer;
  const fullpage = Kiwi.fullpage;
  const modal = Kiwi.modal;
  const toast = Kiwi.toast;
  const menu = Kiwi.menu;
  const confetti = Kiwi.confetti;
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Section 2-B (restaurant vertical) — sidebar handlers
 *
 * Two replacement handlers for /Users/badrosonair/Documents/kiwi/assets/pages.js:
 *   1. handlers['nav-kds']    · Écran cuisine · live ticket queue (1040-wide)
 *   2. handlers['nav-stock']  · Stock ingrédients · 20-item grid (1000-wide)
 *
 * Plus auxiliary action handlers (kds-bump, kds-recall, stock-reorder…).
 * Drop the contents of this file in place of the existing nav-kds and nav-stock
 * blocks (and append the auxiliary handlers next to the other action stubs).
 *
 * Companion CSS: /tmp/kiwi-s2-rest-css.css (append additions there).
 * ─────────────────────────────────────────────────────────────────────────── */

  /* ═══════════════════ ÉCRAN CUISINE (KDS) ═══════════════════ */
  handlers['nav-kds'] = () => {
    const tickets = [
      { id: 'T-7821', table: 'T4', src: 'salle',  cook: 'MM', elapsed: 412, items: [{ q: 2, n: 'Salade marocaine', st: 'salade' }, { q: 1, n: 'Tajine kefta œuf', st: 'cuisson' }, { q: 3, n: 'Thé menthe', st: 'boissons' }] },
      { id: 'T-7822', table: 'T7', src: 'salle',  cook: 'MM', elapsed: 198, items: [{ q: 1, n: 'Couscous royal', st: 'cuisson' }, { q: 1, n: 'Pastilla poulet', st: 'cuisson' }] },
      { id: 'T-7823', table: 'T2', src: 'salle',  cook: 'AY', elapsed: 632, items: [{ q: 4, n: 'Briouates viande', st: 'cuisson' }, { q: 2, n: 'Caviar d\'aubergine', st: 'salade' }] },
      { id: 'T-7824', table: 'TR2',src: 'terrasse', cook: 'AY', elapsed: 88,  items: [{ q: 2, n: 'Tajine kefta', st: 'cuisson' }, { q: 1, n: 'Salade marocaine', st: 'salade' }, { q: 2, n: 'Orange pressée', st: 'boissons' }] },
      { id: 'G-3412', table: 'GLOVO', src: 'livraison', cook: 'MM', elapsed: 548, items: [{ q: 2, n: 'Tajine kefta œuf', st: 'cuisson' }, { q: 1, n: 'Salade marocaine', st: 'salade' }] },
      { id: 'T-7825', table: 'T9', src: 'salle',  cook: 'AY', elapsed: 944, items: [{ q: 1, n: 'Pastilla poulet', st: 'cuisson' }, { q: 1, n: 'Salade marocaine', st: 'salade' }, { q: 1, n: 'Pâtisseries assorties', st: 'desserts' }] },
      { id: 'Y-8821', table: 'YASSIR', src: 'livraison', cook: 'MM', elapsed: 318, items: [{ q: 3, n: 'Tajine kefta', st: 'cuisson' }] },
      { id: 'T-7826', table: 'TR1', src: 'terrasse', cook: 'AY', elapsed: 42,  items: [{ q: 2, n: 'Briouates viande', st: 'cuisson' }, { q: 1, n: 'Caviar d\'aubergine', st: 'salade' }, { q: 4, n: 'Café double', st: 'boissons' }] },
    ];
    const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const cls = (s) => s < 480 ? 'ok' : s < 900 ? 'warn' : 'over';
    const stationLabel = { salade: 'Salade', cuisson: 'Cuisson', boissons: 'Boissons', desserts: 'Desserts' };

    const ticketHtml = (t) => `
      <div class="kds-tk ${cls(t.elapsed)}" data-tk="${t.id}" data-stations="${[...new Set(t.items.map(i => i.st))].join(' ')}">
        <div class="kds-tk-head">
          <div class="kds-tk-id">
            <b>${t.table}</b><span class="kds-tk-src">· ${t.src}</span>
          </div>
          <div class="kds-tk-time mono ${cls(t.elapsed)}">${fmt(t.elapsed)}</div>
        </div>
        <ul class="kds-tk-items">
          ${t.items.map(i => `<li><span class="kds-q mono">×${i.q}</span><span class="kds-it">${i.n}</span><span class="kds-st kds-st-${i.st}">${stationLabel[i.st]}</span></li>`).join('')}
        </ul>
        <div class="kds-tk-foot">
          <span class="kds-tk-cook">Affecté : <b>${t.cook === 'MM' ? 'Mehdi M.' : 'Ayoub Y.'}</b></span>
          <span class="kds-tk-acts">
            <button class="kb ghost xs" data-action="kds-recall" data-id="${t.id}">Rappeler</button>
            <button class="kb atlas xs" data-action="kds-bump" data-id="${t.id}">Bump</button>
          </span>
        </div>
      </div>`;

    const r = drawer({
      title: 'Écran cuisine · KDS',
      subtitle: '8 tickets en préparation · service midi · Mehdi Mansouri (chef)',
      width: 1040,
      body: `
        <div class="p-kpis kds-stat-strip">
          <div class="p-kpi"><div class="l">TICKETS ACTIFS</div><div class="v">8</div><div class="d">3 cuisson · 2 salade · 2 livraison · 1 terrasse</div></div>
          <div class="p-kpi"><div class="l">PRÉP. MOYENNE</div><div class="v">8 min <span class="u">14 s</span></div><div class="d up">SLA 12 min · respecté à 87 %</div></div>
          <div class="p-kpi"><div class="l">STATION CHARGÉE</div><div class="v">Cuisson</div><div class="d">5 tickets en file · 14 plats</div></div>
          <div class="p-kpi"><div class="l">PLAT DU MOMENT</div><div class="v">Tajine kefta</div><div class="d">7 commandes en 30 min</div></div>
        </div>

        <div class="kds-board">
          <div class="kds-main">
            <div class="kds-toolbar">
              <div class="kds-pills" role="tablist">
                <button class="kds-pill on" data-kds-st="all">Tout <span class="mono">8</span></button>
                <button class="kds-pill" data-kds-st="salade">Salade <span class="mono">4</span></button>
                <button class="kds-pill" data-kds-st="cuisson">Cuisson <span class="mono">7</span></button>
                <button class="kds-pill" data-kds-st="boissons">Boissons <span class="mono">3</span></button>
                <button class="kds-pill" data-kds-st="desserts">Desserts <span class="mono">1</span></button>
              </div>
              <div class="kds-tools">
                <button class="kb ghost xs" data-action="kds-fullscreen">Plein écran</button>
                <button class="kb ghost xs" data-action="kds-reassign">Réaffecter cuisinier</button>
              </div>
            </div>

            <div class="kds-grid-tk">
              ${tickets.map(ticketHtml).join('')}
            </div>
          </div>

          <aside class="kds-side">
            <div class="kds-side-head">
              <h5>Notifications cuisine</h5>
              <span class="chip neutral mono">5 nouvelles</span>
            </div>
            <div class="kds-notif warn">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
              <div><b>Ticket T9 dépasse 15 min</b><div class="m">Pastilla en attente cuisson · prévenir Mehdi M.</div></div>
            </div>
            <div class="kds-notif info">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></div>
              <div><b>2 tajines kefta encore prévus</b><div class="m">Pré-cuire les œufs · gain estimé 90 s/ticket</div></div>
            </div>
            <div class="kds-notif info">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg></div>
              <div><b>Coursier Glovo arrivé</b><div class="m">Ticket G-3412 · prêt à récupérer comptoir</div></div>
            </div>
            <div class="kds-notif warn">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
              <div><b>Stock bas · feuilles de brick</b><div class="m">3 portions restantes · 86 le plat ?</div><button class="kds-notif-cta" data-action="kds-86" data-item="Pastilla poulet">86 cet item</button></div>
            </div>
            <div class="kds-notif">
              <div class="kds-notif-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg></div>
              <div><b>Sofia (salle) demande</b><div class="m">T4, sans coriandre sur le tajine</div></div>
            </div>

            <div class="kds-side-head" style="margin-top:18px;">
              <h5>Performance cuisinier</h5>
            </div>
            <div class="kds-cook">
              <div class="kds-cook-av">MM</div>
              <div class="kds-cook-info">
                <b>Mehdi Mansouri · chef</b>
                <div class="m">4 tickets actifs · prép. moy. <b>7 min 50 s</b></div>
              </div>
              <span class="chip ok">SLA 92 %</span>
            </div>
            <div class="kds-cook">
              <div class="kds-cook-av b">AY</div>
              <div class="kds-cook-info">
                <b>Ayoub Yacoubi · auxiliaire</b>
                <div class="m">4 tickets actifs · prép. moy. <b>9 min 12 s</b></div>
              </div>
              <span class="chip pend">SLA 79 %</span>
            </div>
          </aside>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Fermer</button>
        <button data-activation=write class="kb ghost" data-action="kds-print-summary">Imprimer récap service</button>
        <button class="kb atlas" data-action="kds-fullscreen">Basculer iPad mural</button>
      `,
    });
    r.el.querySelector('.kiwi-drawer').classList.add('page-xl');
    r.el.querySelector('.kiwi-drawer').style.width = '1040px';

    // Click delegation: filter pills + ticket interactions
    r.el.addEventListener('click', (e) => {
      const pill = e.target.closest('[data-kds-st]');
      if (pill) {
        r.el.querySelectorAll('[data-kds-st]').forEach(p => p.classList.toggle('on', p === pill));
        const k = pill.dataset.kdsSt;
        r.el.querySelectorAll('.kds-tk').forEach(tk => {
          const stations = (tk.dataset.stations || '').split(' ');
          tk.style.display = (k === 'all' || stations.includes(k)) ? '' : 'none';
        });
        return;
      }
      const tk = e.target.closest('.kds-tk');
      if (tk && !e.target.closest('button')) {
        const id = tk.dataset.tk;
        toast(`Ticket ${id} agrandi`, { type: 'info', desc: 'Mode focus · police × 1,4 pour brigade éloignée.' });
      }
    });
  };

  /* Stub handlers used inside the KDS drawer */
  handlers['kds-bump'] = (el) => {
    const id = el?.dataset.id || 'ticket';
    const tk = el?.closest('.kds-tk');
    modal({
      tag: 'CUISINE',
      title: `Bump ticket ${id} ?`,
      desc: 'Le ticket disparaît de l\'écran cuisine. La salle reçoit la notification « plat prêt ».',
      width: 460,
      body: `<div style="display:flex; gap:12px; padding:12px 14px; background:var(--paper-soft); border-radius:10px; font-size:13px; color:var(--n-600); line-height:1.5;">
        <span style="color:var(--atlas);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg></span>
        <div>Sofia (salle) sera notifiée pour récupérer les plats au pass. Action irréversible, utilisez « Rappeler » si besoin.</div>
      </div>`,
      foot: `<button class="kb ghost" data-dismiss-modal>Annuler</button><button class="kb atlas" data-confirm-bump="${id}">Bump ${id}</button>`,
    });
    document.querySelector('[data-confirm-bump]')?.addEventListener('click', () => {
      document.querySelector('.kiwi-backdrop')?.remove();
      if (tk) { tk.style.transition = 'all 280ms'; tk.style.opacity = '0'; tk.style.transform = 'translateX(20px)'; setTimeout(() => tk.remove(), 280); }
      toast(`Ticket ${id} bumpé`, { type: 'success', desc: 'Notification salle envoyée à Sofia · pass · ouvert depuis 4 s.' });
    });
    document.querySelector('[data-dismiss-modal]')?.addEventListener('click', () => document.querySelector('.kiwi-backdrop')?.remove());
  };
  handlers['kds-recall'] = (el) => {
    const id = el?.dataset.id || 'ticket';
    toast(`Ticket ${id} rappelé en cuisine`, { type: 'warn', desc: 'Le ticket revient en haut de la file · cuisinier averti.' });
  };
  handlers['kds-86'] = (el) => {
    const item = el?.dataset.item || 'plat';
    modal({
      tag: 'STOCK',
      title: `Mettre « ${item} » en 86 ?`,
      desc: 'Le plat devient indisponible sur la caisse et le QR table.',
      width: 480,
      body: `<div style="font-size:13px; color:var(--n-600); line-height:1.5;">Le client en train de commander voit le plat barré. Vous pouvez le réactiver dès que le stock revient.</div>`,
      foot: `<button class="kb ghost" data-dismiss-modal>Annuler</button><button class="kb danger" data-confirm-86>Confirmer le 86</button>`,
    });
    document.querySelector('[data-confirm-86]')?.addEventListener('click', () => {
      document.querySelector('.kiwi-backdrop')?.remove();
      toast(`${item} en 86`, { type: 'success', desc: 'Désactivé sur la caisse et le QR table.' });
    });
    document.querySelector('[data-dismiss-modal]')?.addEventListener('click', () => document.querySelector('.kiwi-backdrop')?.remove());
  };
  handlers['kds-fullscreen'] = () => toast('Mode iPad mural activé', { type: 'info', desc: 'Police × 1,4 · auto-refresh 3 s · interface tactile gants compatible.' });
  handlers['kds-reassign'] = () => toast('Réaffecter ticket', { type: 'info', desc: 'Glissez le ticket vers Mehdi M. ou Ayoub Y. pour transférer.' });
  handlers['kds-print-summary'] = () => toast('Récap service midi imprimé', { type: 'success', desc: '47 plats servis · prép. moy. 8 min 14 s · 3 retours cuisine.' });
})();

/* First-use sections. Keep URLs literal so tools/stamps.js can version them. */
(() => {
  if (!window.Kiwi?.handlers) return;
  const H = window.Kiwi.handlers;
  const LAZY_SECTIONS = [
    { url: 'assets/pages-pro/spa-appointments.js?v=2', handlers: ["nav-appointments", "appt-filter", "appt-export", "appt-wait-add", "appt-auto-toggle", "appt-wait-detail", "appt-cancel-confirm", "appt-new", "nav-services", "svc-export", "svc-season", "svc-season-edit", "svc-ai-action", "pkg-edit-go"] },
    { url: 'assets/pages-pro/spa-practitioners.js?v=2', handlers: ["nav-practitioners", "practitioner-add", "practitioner-commission", "practitioner-edit", "practitioner-tracker"] },
    { url: 'assets/pages-pro/boutique-promos-returns.js?v=4', handlers: ["nav-promos", "nav-returns", "credit-adjust", "credit-adjust-confirm", "credit-cancel", "promo-archive-detail", "promo-edit", "promo-end", "promo-pause", "promo-schedule", "promo-segment", "ret-approve", "ret-block", "ret-detail", "ret-exchange", "ret-export", "ret-policy-jump", "ret-policy-save", "ret-refund-credit", "ret-refund-original", "ret-refund-whatsapp", "ret-refuse"] },
    { url: 'assets/pages-pro/restaurant-stations.js?v=2', handlers: ["nav-menu", "nav-kds", "menu-stations-manage", "menu-station-create", "menu-cat-add", "menu-cat-edit", "menu-opt-add", "menu-promote", "menu-add", "menu-schedule", "menu-publish", "kds-bump", "kds-recall", "kds-86", "kds-fullscreen", "kds-reassign", "kds-print-summary"] },
  ];
  LAZY_SECTIONS.forEach(entry => {
    let loading;
    const registered = new Set();
    function load() {
      if (loading) return loading;
      const script = document.createElement('script');
      script.src = entry.url;
      loading = new Promise((resolve, reject) => {
        script.onload = () => registered.size === entry.handlers.length
          ? resolve() : reject(new Error('Module incomplet'));
        script.onerror = () => reject(new Error('Module indisponible'));
        document.head.appendChild(script);
      }).catch(error => {
        loading = null;
        script.remove();
        throw error;
      });
      return loading;
    }
    entry.handlers.forEach(name => {
      let live, real, forwarding = false;
      function stub() {
        const self = this, args = arguments;
        function forward() {
          // Captured wrappers call this stub again: terminate at the real handler.
          if (forwarding) return real.apply(self, args);
          forwarding = true;
          try { return H[name].apply(self, args); }
          finally { forwarding = false; }
        }
        if (real) return forward();
        return load().then(forward, () => {
          window.Kiwi.toast('Module indisponible', { type: 'error', desc: 'Impossible de charger cette page. Réessayez.' });
        });
      }
      live = stub;
      Object.defineProperty(H, name, {
        configurable: true, enumerable: true,
        get: () => live,
        set(fn) {
          // Only assignments made by this chunk are registration. Later guards
          // retain their captured stub and must remain installed above the real fn.
          if (document.currentScript?.src === new URL(entry.url, document.baseURI).href) {
            real = fn;
            registered.add(name);
            if (live === stub) live = fn;
          } else live = fn;
        },
      });
    });
  });
})();
