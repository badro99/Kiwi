/* Owner: restaurant table workflow. Exposes nav-tables; needs Kiwi, floorplan core/live, table data and drawing factory. Loaded at first table open. */
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


let data;
function tableData() { return data || (data = window.__kiwiPagesTables.createData({ PDS_CANVAS_W, PDS_CANVAS_H })); }


let operations;
function tableOperations() { return operations || (operations = window.__kiwiPagesTables.operations({ Kiwi, PDS_FOLD, PDS_GRID, PDS_MAX_TABLE_SERVERS, PDS_MAX_VERSIONS, PDS_SERVICE_STATUSES, handlers, pdsApplyAssignment, pdsApplyVersion, pdsBusinessDayStart, pdsClearReservation, pdsClock, pdsDefaultState, pdsDuplicateNums, pdsFind, pdsFixLabel, pdsFreeSpot, pdsHandleAction, pdsHasServer, pdsHomeZones, pdsIcon, pdsInitials, pdsK, pdsManualStatuses, pdsNewZoneId, pdsNextNum, pdsNoir, pdsNoirFixture, pdsNormalize, pdsNumKey, pdsOnShift, pdsPalSeats, pdsPeriodLabel, pdsPlane, pdsPlaneOf, pdsPush, pdsReadingOrder, pdsRecordRotation, pdsRedo, pdsRenderStatusRow, pdsRestoreTableSnapshot, pdsRotationPreview, pdsSave, pdsServerIds, pdsSetNoir, pdsSetServerIds, pdsSetStatus, pdsStaffColor, pdsStatusLabel, pdsSweepGroups, pdsTableNum, pdsTableSnapshot, pdsTablesInOrder, pdsTodayKey, pdsTypeFor, pdsUndo, pdsVersions, pdsZoneName, pdsZoomBy, toast, trLang, wireDismiss })); }

let drawing;
function tableDrawing() {
  return drawing || (drawing = window.__kiwiPagesTables.drawing({
    get Kiwi() { return Kiwi; },
    get trLang() { return trLang; },
    get PDS_CANVAS_H() { return PDS_CANVAS_H; },
    get PDS_CANVAS_W() { return PDS_CANVAS_W; },
    get PDS_DEFAULT_STAFF() { return PDS_DEFAULT_STAFF; },
    get PDS_EL_RENAME() { return PDS_EL_RENAME; },
    get PDS_GRID() { return PDS_GRID; },
    get PDS_ICONS() { return PDS_ICONS; },
    get PDS_INLINE_CSS() { return PDS_INLINE_CSS; },
    get PDS_LS_KEY() { return PDS_LS_KEY; },
    get PDS_MAX_TABLE_SERVERS() { return PDS_MAX_TABLE_SERVERS; },
    get PDS_SCENE_MIGRATION() { return PDS_SCENE_MIGRATION; },
    get PDS_SEED_ZONES() { return PDS_SEED_ZONES; },
    get PDS_SERVICE_STATUSES() { return PDS_SERVICE_STATUSES; },
    get PDS_STAFF_COLORS() { return PDS_STAFF_COLORS; },
    get PDS_TRANSIENT_IDS() { return PDS_TRANSIENT_IDS; },
    get PDS_UNDO() { return PDS_UNDO; },
    get pdsAttachDrag() { return pdsAttachDrag; },
    get pdsAttachElDrag() { return pdsAttachElDrag; },
    get pdsCloud() { return pdsCloud; },
    get pdsEff() { return pdsEff; },
    get pdsK() { return pdsK; },
    get pdsKpis() { return pdsKpis; },
    get pdsLiveBadge() { return pdsLiveBadge; },
    get pdsPhoneLive() { return pdsPhoneLive; },
    get pdsRenderActions() { return pdsRenderActions; },
    get pdsRenderElement() { return pdsRenderElement; },
    get pdsRenderStage() { return pdsRenderStage; },
    get pdsRenderTable() { return pdsRenderTable; },
  }));
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

function pdsTenant() { return tableDrawing().pdsTenant.apply(this, arguments); }

/* Per-store floor plan: every store keeps its own layout under its own key.
 * Pour les identifiants transitoires ('scoped', 'own'), le seau est nommé par
 * le slug du locataire résolu ('kiwiPlanDeSalle:scoped@<slug>'). Sans slug
 * résolu, la clé retourne '' (fail-closed) : aucun cache partagé ni écriture. */
function pdsKey() { return tableDrawing().pdsKey.apply(this, arguments); }
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
function pdsNoir() { return tableDrawing().pdsNoir.apply(this, arguments); }
function pdsSetNoir() { return tableDrawing().pdsSetNoir.apply(this, arguments); }
/* Une matière sur la scène nuit : rabattue vers le charbon en gardant `keep`
 * de sa teinte — le noyer reste chaud, le sauge reste vert, mais tout devient
 * nocturne. Encres et chaises suivent d'elles-mêmes : pdsInk/pdsChairTone
 * raisonnent en luminance, pas en clair codé en dur. */
function pdsNoirC() { return tableDrawing().pdsNoirC.apply(this, arguments); }
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
function pdsJourC() { return tableDrawing().pdsJourC.apply(this, arguments); }
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
function pdsNoirTick() { return tableDrawing().pdsNoirTick.apply(this, arguments); }
function pdsNoirChairs() { return tableDrawing().pdsNoirChairs.apply(this, arguments); }
/* Plateau du mockup, couche par couche : le disque d'appel (dégradé radial
 * menthe, occupée seulement), le corps en dégradé vertical #101312→#050605
 * posé sur une ombre portée (fp-body + fp-lift), puis la couche de statut —
 * remplissage + contour 1.25 sur la MÊME forme, rx 8. L'occupée reçoit en
 * plus l'anneau d'appel qui pulse (classe .pds-noir-call, animée en CSS,
 * l'équivalent exact de .kw-plan-call sur l'accueil). Les dégradés et le
 * filtre vivent une seule fois dans les defs partagées de la scène — les SVG
 * inline résolvent url(#…) à l'échelle du document. */
function pdsNoirTableBody() { return tableDrawing().pdsNoirTableBody.apply(this, arguments); }
/* Le bâti au trait. Chaque genre a son idéogramme — la caisse porte son
 * interrupteur menthe, la cuisine ses hachures en filet, la porte son arc —
 * et l'inconnu retombe sur un simple contour. Les gabarits (couleur,
 * matière) ne jouent pas ici : la nuit dessine, elle ne peint pas. */
function pdsNoirFixture() { return tableDrawing().pdsNoirFixture.apply(this, arguments); }
/* Le sol la nuit : charbon teinté par le sol du commerçant, une grille fine
 * calée sur le pas d'aimantation (3 × PDS_GRID), et un souffle de lumière
 * depuis le haut — la même lumière que l'accueil sombre. Les finitions
 * (terrazzo, zellige) sont dessinées à l'encre sombre et disparaîtraient
 * ici ; la grille les remplace, la vue jour les garde. */
function pdsRoomShellNoir() { return tableDrawing().pdsRoomShellNoir.apply(this, arguments); }
/* Le sol le jour : le même dessin, à l'encre sur papier. Le sol choisi par le
 * commerçant devient un lavis sur le papier chaud (pdsJourC 0.30 — assez pour
 * distinguer chêne de béton, pas assez pour casser le dessin), la grille
 * passe à l'encre fine, la lumière entre par la même fenêtre décentrée que la
 * nuit — en blanc franc, c'est le matin — et le mur est un trait d'encre,
 * comme la nuit le fait en blanc : le mur du gabarit ne peint pas ici. */
function pdsRoomShellJour() { return tableDrawing().pdsRoomShellJour.apply(this, arguments); }


/* ─── Static i18n table — every label, status, role, template name ───────── */
const PDS_STR = tableData().PDS_STR;

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
function pdsStaffColor() { return tableDrawing().pdsStaffColor.apply(this, arguments); }
const PDS_MAX_TABLE_SERVERS = 3;
function pdsServerIds() { return tableDrawing().pdsServerIds.apply(this, arguments); }
function pdsSetServerIds() { return tableDrawing().pdsSetServerIds.apply(this, arguments); }
function pdsHasServer() { return tableDrawing().pdsHasServer.apply(this, arguments); }
function pdsIsFloorRole() { return tableDrawing().pdsIsFloorRole.apply(this, arguments); }
function pdsTeamStaff() { return tableDrawing().pdsTeamStaff.apply(this, arguments); }
/* Un vrai magasin, c'est soit une session réelle, soit un établissement créé
 * par le commerçant : les deux doivent voir leur équipe, pas la nôtre. */
function pdsIsRealStore() { return tableDrawing().pdsIsRealStore.apply(this, arguments); }
/* Rapproche le roster du plan de l'équipe réelle : les fiches Équipe font
 * autorité sur le nom, les pastilles ajoutées à la main ici (id « sv- »)
 * survivent, et les serveurs de démonstration disparaissent dès qu'un vrai
 * magasin est ouvert. Une table qui pointait sur un serveur disparu est
 * libérée — sinon elle porterait une pastille sans nom ni couleur. */
function pdsSyncStaff() { return tableDrawing().pdsSyncStaff.apply(this, arguments); }

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
function pdsBusinessDayStart() { return tableDrawing().pdsBusinessDayStart.apply(this, arguments); }

function pdsNormalize() { return tableDrawing().pdsNormalize.apply(this, arguments); }

function pdsLoad() { return tableDrawing().pdsLoad.apply(this, arguments); }
/* The live state carries the editor's own wiring (_selection, _openInspector,
   _rebind …). Functions vanish in JSON but a Set survived as `_selection: {}`
   on every saved plan, local and server. Persist the plan, not the editor. */
function pdsSerialize() { return tableDrawing().pdsSerialize.apply(this, arguments); }
function pdsWriteLocal() { return tableDrawing().pdsWriteLocal.apply(this, arguments); }
function pdsSave() { return tableDrawing().pdsSave.apply(this, arguments); }

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

function pdsRawState() { return tableDrawing().pdsRawState.apply(this, arguments); }

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
function pdsMerge() { return tableDrawing().pdsMerge.apply(this, arguments); }

/* Le plan a la même faiblesse d'identifiant que le reste : celui qui a créé le
 * restaurant l'a rangé sous `v`+horloge, une ré-adoption le range sous
 * `v-<slug>`, et le dessin d'origine reste en place sans lecteur. Le miroir par
 * slug (`kiwiPlanDeSalle:slug:<slug>`) partage ce préfixe mais n'est pas un
 * identifiant de venue : slugFor() ne le reconnaît pas et l'écarte. */
function pdsCarryForward() { return tableDrawing().pdsCarryForward.apply(this, arguments); }

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
function pdsZoneName() { return tableDrawing().pdsZoneName.apply(this, arguments); }
/* Libellé par défaut d'un élément de décor : COMPTOIR et CUISINE sont des mots
   français écrits en dur dans floorplan-core ; sous EN et AR ils prennent le
   nom traduit de l'élément. Le français et un libellé saisi restent tels quels. */
function pdsFixLabel() { return tableDrawing().pdsFixLabel.apply(this, arguments); }
function pdsDefaultState() { return tableDrawing().pdsDefaultState.apply(this, arguments); }

/* ─── Templates catalog — wipes state, repopulates ────────────────────── */
function pdsTemplate() { return tableDrawing().pdsTemplate.apply(this, arguments); }

/* ─── Stylesheet, injected once at the document level ──────────────────
 * NOT inside the drawer body. The `.pds-*` sheet used to ship as
 * `<style>${PDS_INLINE_CSS}</style>` at the top of pdsRenderBody()'s HTML
 * string, so its lifetime was tied to that body — and `open-templates`
 * opens a SECOND drawer over the first, replacing the body and taking the
 * only copy of the stylesheet with it. The template picker then rendered
 * with no CSS at all: no card fill, no border, no padding, just stacked
 * text bleeding through the glass. Anything that reuses `.pds-*` markup
 * outside the main drawer depends on this being document-level. */
function pdsEnsureCss() { return tableDrawing().pdsEnsureCss.apply(this, arguments); }

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
function pdsPhoneWanted() { return tableDrawing().pdsPhoneWanted.apply(this, arguments); }
function pdsInitials() { return tableDrawing().pdsInitials.apply(this, arguments); }
function pdsTableNum() { return tableDrawing().pdsTableNum.apply(this, arguments); }
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
function pdsPhoneBody() { return tableDrawing().pdsPhoneBody.apply(this, arguments); }
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

function pdsSubtitle() { return tableDrawing().pdsSubtitle.apply(this, arguments); }

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
function pdsOnShift() { return tableDrawing().pdsOnShift.apply(this, arguments); }

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

function pdsRenderBody() { return tableDrawing().pdsRenderBody.apply(this, arguments); }


/* Selection lives in pdsAttach's closure; the renderer needs to read it to
   draw handles on the selected object. This is the same Set, not a copy —
   pdsAttach assigns it — so there is still exactly one source of truth. */
let PDS_SEL = new Set();

/* Find any object by id across both arrays. Tables and fixtures use disjoint
   id prefixes, so one lookup serves both and the inspector, handles and
   keyboard nudge don't need to know which array they're editing. */
function pdsFind() { return tableDrawing().pdsFind.apply(this, arguments); }
function pdsPlane() { return tableDrawing().pdsPlane.apply(this, arguments); }
/* Plane of the zone currently on screen — the clamp bound for drag and resize.
   PDS_CANVAS_W/H are now only the default room size, not a global. */
function pdsPlaneOf() { return tableDrawing().pdsPlaneOf.apply(this, arguments); }

/* ─── Undo ────────────────────────────────────────────────────────────────
 *   Snapshots of the three mutable arrays. A designer who cannot undo does
 *   not experiment, and an editor nobody experiments in gets used once.
 *   pdsPush is called BEFORE a mutation, by the action that performs it. */
const PDS_UNDO = { stack: [], redo: [] };
function pdsSnap() { return tableDrawing().pdsSnap.apply(this, arguments); }
function pdsApplySnap() { return tableDrawing().pdsApplySnap.apply(this, arguments); }
function pdsPush() { return tableDrawing().pdsPush.apply(this, arguments); }
/* sessionStorage, keyed by the plan's own storage key: per tab, per store.
   A plan that changed underneath (another device, a reset) makes the stored
   history meaningless, so it is only restored when its tip matches the plan
   as loaded — otherwise it is dropped. */
function pdsUndoKey() { return tableDrawing().pdsUndoKey.apply(this, arguments); }
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
function pdsUndo() { return tableDrawing().pdsUndo.apply(this, arguments); }
function pdsRedo() { return tableDrawing().pdsRedo.apply(this, arguments); }

/* First grid position where a w×h object clears everything already placed,
   with an 8-unit breathing gap. Beats the old "centre + n×16 offset", which
   stacked the 7th item straight back onto the 1st. */
function pdsFreeSpot() { return tableDrawing().pdsFreeSpot.apply(this, arguments); }

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
function pdsMagnet() { return tableDrawing().pdsMagnet.apply(this, arguments); }

/* Repaint ONE cell from state and re-arm its handlers. The old code called
   refresh() on pointerup, which rebuilt the whole drawer body plus both
   rails and reopened the inspector — that rebuild is the hitch you feel at
   the end of every resize. Nothing outside this cell changed, so nothing
   outside it needs to be rebuilt. */
function pdsRepaintCell() { return tableDrawing().pdsRepaintCell.apply(this, arguments); }

/* Push geometry back into the inspector's number fields without rebuilding
   it — never clobbering a field the merchant is currently typing in. */
function pdsSyncInspector() { return tableDrawing().pdsSyncInspector.apply(this, arguments); }

function pdsAttachResize() { return tableDrawing().pdsAttachResize.apply(this, arguments); }

function pdsBindHandles() { return tableDrawing().pdsBindHandles.apply(this, arguments); }

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
function pdsIcon() { return tableDrawing().pdsIcon.apply(this, arguments); }

/* Zoom. 0 = ajusté : la salle tient en entier, en largeur ET en hauteur —
   c'est ce qui coupait le bas de la salle sur un portable. Au-delà, la
   salle grandit et le cadre défile (molette, trackpad, ou espace + glisser). */
let PDS_ZOOM = 0;
function pdsRoomSize(P) {
  if (!PDS_ZOOM) return `width:min(100%, calc((100dvh - var(--pds-chrome, 330px)) * ${P.w} / ${P.h})); max-width:${P.w * 1.6}px;`;
  return `width:${Math.round(P.w * PDS_ZOOM)}px; max-width:none;`;
}
function pdsFloorCount() { return tableDrawing().pdsFloorCount.apply(this, arguments); }

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

function pdsRenderEmpty() { return tableDrawing().pdsRenderEmpty.apply(this, arguments); }

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
function pdsTypeFor() { return tableDrawing().pdsTypeFor.apply(this, arguments); }
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
function pdsFixMini() { return tableOperations().pdsFixMini.apply(this, arguments); }

/* Thumbnail drawn from the candidate's OWN objects. The five templates
   shipped hand-drawn previews next to a stored cover count, which is how
   a card advertising 60 covers could load a plan holding 98 — two sources
   of truth for one number. Here there is only the plan. */
function pdsPlanThumb() { return tableOperations().pdsPlanThumb.apply(this, arguments); }

/* Room panel — floor, walls, finish, dimensions. Replaces the six-scene
   dropdown: instead of picking one of six frozen drawings, the merchant sets
   the four properties those drawings differed by. */
function pdsRenderRoomCard() { return tableOperations().pdsRenderRoomCard.apply(this, arguments); }

/* Assignation rail — roster of servers */
function pdsRenderAssignRail() { return tableOperations().pdsRenderAssignRail.apply(this, arguments); }

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

function pdsRenderAssignSummary() { return tableOperations().pdsRenderAssignSummary.apply(this, arguments); }

/* ─── Inspector ───────────────────────────────────────────────────────────
 *   One inspector serves tables and fixtures. Geometry (X/Y/W/H/rotation) is
 *   editable numerically as well as by handle, because "make both banquettes
 *   exactly 240 wide" is not a drag gesture.                               */
function pdsRenderInspector() { return tableOperations().pdsRenderInspector.apply(this, arguments); }

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

function pdsRenderBulkInspector() { return tableOperations().pdsRenderBulkInspector.apply(this, arguments); }

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

/* ─── Rotation ─────────────────────────────────────────────────────────────
 *   It used to promise « servers notified » and a schedule, and did neither:
 *   the period was stored and never read, « par paires » was the same
 *   round-robin as « par tables », and the fairness bars were drawn from a
 *   seeded demo week. Now:
 *     · pdsRotateStep computes one real step for each strategy;
 *     · pdsAutoRotate applies it once per service / day / week, the first
 *       time the plan opens in that period, on any device;
 *     · history only grows from rotations that actually happened. */
function pdsRotationKey() { return tableOperations().pdsRotationKey.apply(this, arguments); }
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
function pdsRotateStep() { return tableOperations().pdsRotateStep.apply(this, arguments); }
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
function pdsFairness() { return tableOperations().pdsFairness.apply(this, arguments); }
function pdsPeriodLabel(T, period) {
  return period === 'daily' ? T.rotateDaily : period === 'weekly' ? T.rotateWeekly : T.rotateShift;
}
function pdsRenderRotateStage() { return tableOperations().pdsRenderRotateStage.apply(this, arguments); }

/* What the old footer bar carried, in the page's own toolbar: Versions and
   Exporter in reach, the rarer tools (renuméroter, assistant, scan, réinitia-
   liser) behind Plus. Autosave needs no button and no banner. */
function pdsRenderActions() { return tableOperations().pdsRenderActions.apply(this, arguments); }

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
function pdsAttachDrag() { return tableOperations().pdsAttachDrag.apply(this, arguments); }

function pdsAttachElDrag() { return tableOperations().pdsAttachElDrag.apply(this, arguments); }

/* Server chip drag — drop on a table or a zone tab */
function pdsAttachChipDrag() { return tableOperations().pdsAttachChipDrag.apply(this, arguments); }

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
function pdsRenumber() { return tableOperations().pdsRenumber.apply(this, arguments); }

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
function pdsSaveVersion() { return tableOperations().pdsSaveVersion.apply(this, arguments); }
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
function pdsOpenVersions() { return tableOperations().pdsOpenVersions.apply(this, arguments); }

/* A booking without a table gets one: the table resource the floor-plan
   template uses (`tpl-floor-<id>`), created if Réservations does not have
   it yet. Goes through KiwiReservations.set, so the booking page, the public
   link and every device see the same placement. */
function pdsPlaceBooking() { return tableOperations().pdsPlaceBooking.apply(this, arguments); }

/* ─── Export ──────────────────────────────────────────────────────────────
 *   The old « Plan exporté · PDF A3 » toast exported nothing. Both formats
 *   are drawn from the plan itself (no screenshot of the editor, no
 *   selection handles): one vector drawing per zone, with table numbers,
 *   covers and the servers' initials. */
function pdsExportSvg() { return tableOperations().pdsExportSvg.apply(this, arguments); }
function pdsExportPrint() { return tableOperations().pdsExportPrint.apply(this, arguments); }
function pdsExportPng() { return tableOperations().pdsExportPng.apply(this, arguments); }

/* ═══ ACTION HANDLERS ═════════════════════════════════════════════════ */
function pdsHandleAction(action, btn, state, T, root, dr, refresh, selection) {
  const toast = Kiwi.toast;
  const modal = Kiwi.modal;
  const drawer = Kiwi.drawer;
  const newTableId = () => 'tbl' + Math.random().toString(36).slice(2, 8);
  const newElId = () => 'el' + Math.random().toString(36).slice(2, 8);

  switch (action) {
    case 'toggle-view': { tableOperations().tableAction26(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'reset': { tableOperations().tableAction27(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'export': { tableOperations().tableAction28(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'versions': { tableOperations().tableAction29(action, btn, state, T, root, dr, refresh, selection); break; }
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
    case 'zoom-out': { tableOperations().tableAction30(action, btn, state, T, root, dr, refresh, selection); break; }
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
    case 'add-shape': { tableOperations().tableAction31(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'zone-move': { tableOperations().tableAction32(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'zone-color': { tableOperations().tableAction33(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'zone-duplicate': { tableOperations().tableAction34(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'renumber': { tableOperations().tableAction35(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'add-zone': { tableOperations().tableAction36(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'rename-zone': { tableOperations().tableAction37(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'delete-zone': { tableOperations().tableAction38(action, btn, state, T, root, dr, refresh, selection); break; }
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
    case 'scan-salle': { tableOperations().tableAction39(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'open-templates':
    case 'open-wizard': { tableOperations().tableAction40(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'add-table':
    case 'add-table-default': { tableOperations().tableAction41(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'add-el': { tableOperations().tableAction42(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'clear-assign': { tableOperations().tableAction43(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'add-server': { tableOperations().tableAction44(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'del-server': { tableOperations().tableAction45(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'rotate-configure': { tableOperations().tableAction46(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'rotate-now': { tableOperations().tableAction47(action, btn, state, T, root, dr, refresh, selection); break; }
    /* ── Inspector actions ─────────────────────────────────────── */
    /* ── Object actions ────────────────────────────────────────────
     * These used to be table-only. They now resolve through pdsFind, so the
     * same buttons rotate, duplicate, lock and delete a comptoir or a kitchen
     * — the operations the merchant could not previously perform on anything
     * that came out of a scene. The action names keep their `table-` prefix
     * because the inspector markup and the keyboard bindings both reference
     * them; renaming would be churn for no behaviour change. */
    case 'table-rotate':
    case 'rot-90': { tableOperations().tableAction48(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'ambiance': { tableOperations().tableAction49(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'table-duplicate': { tableOperations().tableAction50(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'table-delete': { tableOperations().tableAction51(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'table-group': { tableOperations().tableAction52(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'table-ungroup': { tableOperations().tableAction53(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'obj-lock': { tableOperations().tableAction54(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'seats-up':
    case 'seats-down': { tableOperations().tableAction55(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'layer-back':
    case 'layer-front': { tableOperations().tableAction56(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'undo': { tableOperations().tableAction57(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'redo': { tableOperations().tableAction58(action, btn, state, T, root, dr, refresh, selection); break; }
    /* ── Bulk actions ──────────────────────────────────────────── */
    case 'bulk-align-h': { tableOperations().tableAction59(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-align-v': { tableOperations().tableAction60(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-dist-h': { tableOperations().tableAction61(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-dist-v': { tableOperations().tableAction62(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-delete': { tableOperations().tableAction63(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-group': { tableOperations().tableAction64(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-clear': { tableOperations().tableAction65(action, btn, state, T, root, dr, refresh, selection); break; }
    case 'bulk-status': { tableOperations().tableAction66(action, btn, state, T, root, dr, refresh, selection); break; }
    /* 'set-scene' retired with PDS_SCENES — the room is four editable
       properties now, wired through [data-pds-room-field]. */
    case 'deselect': { tableOperations().tableAction67(action, btn, state, T, root, dr, refresh, selection); break; }
    default: { tableOperations().tableAction68(action, btn, state, T, root, dr, refresh, selection); break; }
  }
}

/* ═══ INLINE CSS · scoped to .pds-* ══════════════════════════════════ */
const PDS_INLINE_CSS = tableData().PDS_INLINE_CSS;


})();
