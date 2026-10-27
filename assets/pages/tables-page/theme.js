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
