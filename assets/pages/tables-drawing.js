/* Owner: table drawing and normalization helpers. Exposes private drawing factory; needs the live table owner scope. */
window.__kiwiPagesTables.drawing = (scope) => {
'use strict';
const { Kiwi, trLang, PDS_CANVAS_H, PDS_CANVAS_W, PDS_DEFAULT_STAFF, PDS_EL_RENAME, PDS_GRID, PDS_ICONS, PDS_INLINE_CSS, PDS_LS_KEY, PDS_MAX_TABLE_SERVERS, PDS_SCENE_MIGRATION, PDS_SEED_ZONES, PDS_SERVICE_STATUSES, PDS_STAFF_COLORS, PDS_TRANSIENT_IDS, PDS_UNDO, pdsAttachDrag, pdsAttachElDrag, pdsCloud, pdsEff, pdsK, pdsKpis, pdsLiveBadge, pdsPhoneLive, pdsRenderActions, pdsRenderElement, pdsRenderStage, pdsRenderTable } = scope;
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

function pdsKey(id) {
  const vid = id || (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || 'default';
  const transients = (window.KiwiVenue && window.KiwiVenue.TRANSIENT_IDS) || PDS_TRANSIENT_IDS;
  if (transients.indexOf(vid) < 0) return PDS_LS_KEY + ':' + vid;
  const slug = pdsTenant(vid);
  return slug ? PDS_LS_KEY + ':' + vid + '@' + slug : '';
}

function pdsNoir() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function pdsSetNoir(on) {
  if (window.KiwiDashTheme && window.KiwiDashTheme.set) window.KiwiDashTheme.set(on ? 'dark' : 'light');
  else document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
}

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

function pdsStaffColor(seed) {
  const s = String(seed || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PDS_STAFF_COLORS[h % PDS_STAFF_COLORS.length];
}

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

function pdsIsRealStore() {
  try {
    if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
    if (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()) return true;
  } catch (e) {}
  return false;
}

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

function pdsBusinessDayStart(now) {
  const d = new Date(now == null ? Date.now() : now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 5, 0, 0, 0);
  if (d.getHours() < 5) start.setDate(start.getDate() - 1);
  return start.getTime();
}

function pdsNormalize(state) {
  if (!state || !Array.isArray(state.zones)) return state;
  /* Ids and colours end up in attributes: keep only what an attribute can
     carry (functions/api/_rules-floorplan-clean.js). */
  if (window.KiwiFloorCore && window.KiwiFloorCore.cleanPlan) window.KiwiFloorCore.cleanPlan(state);
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

function pdsZoneName(z) {
  const n = z && z.name != null ? String(z.name) : '';
  const tr = Object.prototype.hasOwnProperty.call(PDS_SEED_ZONES, n) ? PDS_SEED_ZONES[n] : null;
  return (tr && tr[trLang()]) || n;
}

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

function pdsEnsureCss() {
  if (document.getElementById('pds-css')) return;
  const s = document.createElement('style');
  s.id = 'pds-css';
  s.textContent = PDS_INLINE_CSS;
  document.head.appendChild(s);
}

function pdsPhoneWanted() {
  try { return !!(window.matchMedia && matchMedia('(max-width: 640px)').matches); } catch (_) { return false; }
}

function pdsInitials(name) {
  return String(name || '·').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase() || '·';
}

function pdsTableNum(t) { return /^\d$/.test(String(t.num)) ? '0' + t.num : String(t.num || '·'); }

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

function pdsSubtitle(state, T, v) {
  v = v || window.KiwiVenue?.getCurrentVenueData?.() || {};
  const effs = state.tables.map(pdsEff);
  const busy = effs.filter(e => e.status === 'occupied' || e.status === 'ordering' || e.status === 'bill').length;
  return T.subtitle(v.name || '', state.tables.length, busy);
}

function pdsOnShift() {
  try {
    const roster = window.KiwiTeam && window.KiwiTeam.roster ? window.KiwiTeam.roster() : null;
    if (!roster || !roster.length) return null;
    const map = {};
    roster.forEach(m => { if (m && m.id) map['tm-' + m.id] = m.status || 'off-duty'; });
    return map;
  } catch (_) { return null; }
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

function pdsPlaneOf(state) {
  return pdsPlane(state.zones.find(z => z.id === state.activeZone) || state.zones[0]);
}

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

function pdsUndoKey() { const k = pdsKey(); return k ? 'kiwiPdsUndo:' + k : ''; }

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

function pdsMagnet(v, grid, tol) {
  const n = Math.round(v / grid) * grid;
  return Math.abs(v - n) <= tol ? n : v;
}

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

function pdsIcon(name) {
  const d = PDS_ICONS[name];
  return d ? `<svg viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>` : '';
}

function pdsFloorCount(tables, T) {
  const busy = tables.map(pdsEff).filter(e => e.status === 'occupied' || e.status === 'ordering' || e.status === 'bill').length;
  return T.floorCount(busy, tables.length);
}

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

function pdsTypeFor(shape, seats) {
  seats = Math.max(1, +seats || 4);
  if (shape === 'round') return seats <= 2 ? 'round2' : seats <= 4 ? 'round4' : seats <= 6 ? 'round6' : 'round8';
  if (shape === 'square') return seats <= 2 ? 'sq2' : 'sq4';
  if (shape === 'rect') return seats <= 4 ? 'rect4' : seats <= 6 ? 'rect6' : seats <= 8 ? 'rect8' : 'rect10';
  return shape === 'bar' ? 'bar' : 'high';
}
return { pdsTenant, pdsKey, pdsNoir, pdsSetNoir, pdsNoirC, pdsJourC, pdsNoirTick, pdsNoirChairs, pdsNoirTableBody, pdsNoirFixture, pdsRoomShellNoir, pdsRoomShellJour, pdsStaffColor, pdsServerIds, pdsSetServerIds, pdsHasServer, pdsIsFloorRole, pdsTeamStaff, pdsIsRealStore, pdsSyncStaff, pdsBusinessDayStart, pdsNormalize, pdsLoad, pdsSerialize, pdsWriteLocal, pdsSave, pdsRawState, pdsMerge, pdsCarryForward, pdsZoneName, pdsFixLabel, pdsDefaultState, pdsTemplate, pdsEnsureCss, pdsPhoneWanted, pdsInitials, pdsTableNum, pdsPhoneBody, pdsSubtitle, pdsOnShift, pdsRenderBody, pdsFind, pdsPlane, pdsPlaneOf, pdsSnap, pdsApplySnap, pdsPush, pdsUndoKey, pdsUndo, pdsRedo, pdsFreeSpot, pdsMagnet, pdsRepaintCell, pdsSyncInspector, pdsAttachResize, pdsBindHandles, pdsIcon, pdsFloorCount, pdsRenderEmpty, pdsTypeFor };
};
