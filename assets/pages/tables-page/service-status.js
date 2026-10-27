
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
function pdsSyncGroupService() { return tableOperations().pdsSyncGroupService.apply(this, arguments); }

/* Time-only reservations belong to the day on which they were entered. Once
   that instant is over by two hours, the next render returns the whole group
   to libre. Keeping the date internally prevents yesterday's 23:30 booking
   from surviving until tonight when the dashboard opens after midnight. */
function pdsExpireReservations() { return tableOperations().pdsExpireReservations.apply(this, arguments); }

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

function pdsOfferTableUndo() { return tableOperations().pdsOfferTableUndo.apply(this, arguments); }

function pdsRenderGroups() { return tableOperations().pdsRenderGroups.apply(this, arguments); }

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
