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
      if (window.KiwiFloorCore && window.KiwiFloorCore.cleanPlan) window.KiwiFloorCore.cleanPlan(d);
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
