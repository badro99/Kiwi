

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
