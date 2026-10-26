/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi Caisse · la salle : plan de salle et son miroir, étages et modes,
 * toast, panneau de l'addition, nouvelle table, liste d'attente, transferts
 * et fusions, commandes par table. Le dessin du plan n'a pas changé.
 *
 * Sorti de caisse-app.js le 22 octobre 2026 : uniquement des déclarations de
 * fonction de premier niveau, recopiées à l'octet et dans leur ordre. Script
 * classique bloquant, chargé après caisse-accounting.js et avant
 * caisse-app.js : ces fonctions sont globales comme avant, l'état (let/const)
 * et tout ce qui s'exécute au chargement restent dans caisse-app.js, où elles
 * le lisent à l'appel. Rien ici ne s'exécute au chargement.
 * ═══════════════════════════════════════════════════════════════════════════ */

    /* Le plan suit le thème de la caisse, jamais l'inverse : clair par défaut
       (l'attribut est absent), noir quand data-caisse-theme="dark". */
    function caisseJour() {
      try { return document.documentElement.getAttribute('data-caisse-theme') !== 'dark'; }
      catch (_) { return true; }
    }
    function caisseRing(status) {
      const R = caisseJour() ? CAISSE_RING_JOUR : CAISSE_RING_NOIR;
      return R[status] || R.khawya;
    }

    /* Une chaise = une coche plate, vue de dessus (pdsNoirTick). */
    function caisseNoirTick(x, y, deg, fill) {
      return `<rect x="-9" y="-3" width="18" height="6" rx="3" fill="${fill}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})"/>`;
    }

    /* Coches autour du plateau · anneau pour les rondes, répartition par côté
       (C.seatSlots, la même que le dashboard) pour les rectangulaires. */
    function caisseNoirChairs(g, seats, ring) {
      if (!seats || seats < 1) return '';
      const fill = (ring && ring.chair) || (caisseJour() ? 'rgba(10,15,13,0.14)' : 'rgba(255,255,255,0.12)');
      if (g.shape === 'round') {
        const rx = g.w / 2 + 12, ry = g.h / 2 + 12, cx = g.w / 2, cy = g.h / 2;
        let out = '';
        for (let i = 0; i < seats; i++) {
          const deg = -90 + (360 * i) / seats;
          const rad = deg * Math.PI / 180;
          out += caisseNoirTick(cx + rx * Math.cos(rad), cy + ry * Math.sin(rad), deg + 90, fill);
        }
        return out;
      }
      const FC = window.KiwiFloorCore;
      const a = FC ? FC.seatSlots(g.w, g.h, seats)
                   : { top: Math.ceil(seats / 2), bottom: Math.floor(seats / 2), left: 0, right: 0 };
      const along = (n, len) => Array.from({ length: n }, (_, j) => (len * (j + 1)) / (n + 1));
      let out = '';
      along(a.top, g.w).forEach(px => { out += caisseNoirTick(px, -12, 0, fill); });
      along(a.bottom, g.w).forEach(px => { out += caisseNoirTick(px, g.h + 12, 0, fill); });
      along(a.left, g.h).forEach(py => { out += caisseNoirTick(-12, py, 90, fill); });
      along(a.right, g.h).forEach(py => { out += caisseNoirTick(g.w + 12, py, 90, fill); });
      return out;
    }

    /* Le plateau fantôme : charbon dégradé + contour d'état. Les tables
       chaudes (ka-yaklo, bgha-ykhlass) portent le disque de halo sous elles
       et l'anneau qui pulse par-dessus. */
    function caisseNoirTableBody(g, ring, status) {
      const jour = caisseJour();
      const sfx = jour ? 'Jour' : 'Noir';
      const hot = status === 'ka-yaklo' || status === 'bgha-ykhlass';
      const callId = status === 'bgha-ykhlass' ? `url(#pds${sfx}CallRose)` : `url(#pds${sfx}Call)`;
      const dash = ring.dash ? `stroke-dasharray="${ring.dash}"` : '';
      const fill = ring.fill || (jour ? 'rgba(10,15,13,0.012)' : 'rgba(255,255,255,0.012)');
      const cx = g.w / 2, cy = g.h / 2;
      const call = hot ? `<circle cx="${cx}" cy="${cy}" r="${(Math.max(g.w, g.h) * 1.45).toFixed(0)}" fill="${callId}"/>` : '';
      if (g.shape === 'round') {
        return call
          + `<ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="url(#pds${sfx}Body)" filter="url(#pds${sfx}Lift)"/>`
          + `<ellipse cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="${fill}" stroke="${ring.s}" stroke-width="${ring.w}" ${dash}/>`
          + (hot ? `<ellipse class="pds-noir-call" cx="${cx}" cy="${cy}" rx="${cx}" ry="${cy}" fill="none" stroke="${ring.s}" stroke-width="${ring.w}"/>` : '');
      }
      const r = Math.min(8, g.w / 5, g.h / 5);
      return call
        + `<rect x="0" y="0" width="${g.w}" height="${g.h}" rx="${r}" fill="url(#pds${sfx}Body)" filter="url(#pds${sfx}Lift)"/>`
        + `<rect x="0" y="0" width="${g.w}" height="${g.h}" rx="${r}" fill="${fill}" stroke="${ring.s}" stroke-width="${ring.w}" ${dash}/>`
        + (hot ? `<rect class="pds-noir-call" x="0" y="0" width="${g.w}" height="${g.h}" rx="${r}" fill="none" stroke="${ring.s}" stroke-width="${ring.w}"/>` : '');
    }

    /* Mobilier au trait · pdsNoirFixture du dashboard, les deux branches :
       comptoir en pilule + tabourets, cuisine hachurée, escalier à marches
       comptées, plante mint (atlas de jour), porte en arc pointillé. */
    function caisseNoirFixture(e, g) {
      const jour = caisseJour();
      const line = jour ? 'rgba(10,15,13,0.45)' : 'rgba(255,255,255,0.38)';
      const dim = jour ? 'rgba(10,15,13,0.25)' : 'rgba(255,255,255,0.20)';
      const pillFill = jour ? 'rgba(10,15,13,0.035)' : 'rgba(255,255,255,0.05)';
      const pillLine = jour ? 'rgba(10,15,13,0.25)' : 'rgba(255,255,255,0.20)';
      const acc = jour ? '11,110,79' : '0,255,174';
      switch (e.type) {
        case 'texte': return '';
        case 'comptoir': {
          let t = '';
          if (g.w >= 100 && g.w > g.h * 2) {
            const n = Math.max(2, Math.min(8, Math.floor(g.w / 38)));
            for (let i = 0; i < n; i++) {
              const sx = (g.w * (i + 1)) / (n + 1);
              t += `<circle cx="${sx.toFixed(1)}" cy="-15" r="7" fill="none" stroke="${jour ? 'rgba(10,15,13,0.28)' : 'rgba(255,255,255,0.22)'}" stroke-width="1.25"/>`;
            }
          }
          return t + `<rect x="0.5" y="0.5" width="${g.w - 1}" height="${g.h - 1}" rx="${Math.max(3, Math.min(g.h / 2 - 1, 12))}" fill="${pillFill}" stroke="${pillLine}" stroke-width="1"/>`;
        }
        case 'caisse': {
          const th = Math.min(14, Math.max(8, g.h - 10)), tw = th / 14 * 22;
          const tx = g.w - tw - 10, ty = (g.h - th) / 2;
          return `<rect x="0.5" y="0.5" width="${g.w - 1}" height="${g.h - 1}" rx="${Math.max(3, Math.min(g.h / 2 - 1, 12))}" fill="${pillFill}" stroke="${pillLine}" stroke-width="1"/>`
            + `<rect x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="${tw.toFixed(1)}" height="${th.toFixed(1)}" rx="3" fill="rgba(${acc},0.14)" stroke="rgba(${acc},0.5)" stroke-width="1"/>`;
        }
        case 'cuisine': {
          const hid = jour ? 'pdsJourHatch' : 'pdsNoirHatch';
          return `<defs><pattern id="${hid}" width="16" height="16" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="16" stroke="${dim}" stroke-width="1"/></pattern></defs>`
            + `<rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="8" fill="url(#${hid})" stroke="${dim}" stroke-width="1.2" stroke-dasharray="5 4"/>`;
        }
        case 'porte':
          return `<path d="M2 ${g.h - 2} A ${g.w - 4} ${g.w - 4} 0 0 1 ${g.w - 2} ${g.h - 2}" fill="none" stroke="${dim}" stroke-width="1" stroke-dasharray="3 3"/>`
            + `<line x1="0" y1="${g.h - 1.5}" x2="${g.w}" y2="${g.h - 1.5}" stroke="${line}" stroke-width="1.5"/>`;
        case 'mur':
          return `<rect x="0" y="0" width="${g.w}" height="${g.h}" rx="${Math.min(2, g.h / 2)}" fill="${line}"/>`;
        case 'fenetre':
          return `<rect x="0" y="${g.h / 2 - 0.75}" width="${g.w}" height="1.5" fill="${line}"/>`
            + `<rect x="0" y="0" width="1.5" height="${g.h}" fill="${line}"/>`
            + `<rect x="${g.w - 1.5}" y="0" width="1.5" height="${g.h}" fill="${line}"/>`;
        case 'passe':
          return `<rect x="0.6" y="0.6" width="${g.w - 1.2}" height="${g.h - 1.2}" rx="${Math.min(g.h / 2, 6)}" fill="none" stroke="${dim}" stroke-width="1.2"/>`;
        case 'plante': {
          const cx = g.w / 2, cy = g.h / 2, r = Math.max(2, Math.min(g.w, g.h) / 2 - 1.5);
          return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(${acc},0.04)" stroke="rgba(${acc},0.35)" stroke-width="1.2"/>`
            + `<circle cx="${cx}" cy="${cy}" r="${Math.max(1, r * 0.45)}" fill="none" stroke="rgba(${acc},0.28)" stroke-width="1"/>`;
        }
        case 'colonne':
          return `<rect x="0.6" y="0.6" width="${g.w - 1.2}" height="${g.h - 1.2}" rx="3" fill="${jour ? 'rgba(10,15,13,0.05)' : 'rgba(255,255,255,0.06)'}" stroke="${line}" stroke-width="1.2"/>`;
        case 'wc':
          return `<rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="8" fill="none" stroke="${dim}" stroke-width="1.2" stroke-dasharray="5 4"/>`;
        case 'escalier': {
          const n = Math.max(3, Math.min(12, Math.round(g.h / 15))), step = g.h / n;
          let t = `<rect x="0.6" y="0.6" width="${g.w - 1.2}" height="${g.h - 1.2}" rx="4" fill="none" stroke="${dim}" stroke-width="1.2"/>`;
          for (let i = 1; i < n; i++) t += `<line x1="0" y1="${(step * i).toFixed(1)}" x2="${g.w}" y2="${(step * i).toFixed(1)}" stroke="${dim}" stroke-width="1"/>`;
          return t;
        }
        case 'banquette':
          return `<rect x="0.6" y="0.6" width="${g.w - 1.2}" height="${g.h - 1.2}" rx="${Math.min(6, g.h / 3, g.w / 3)}" fill="${pillFill}" stroke="${pillLine}" stroke-width="1"/>`;
        case 'claustra': {
          let t = `<rect x="0" y="${g.h / 2 - 0.75}" width="${g.w}" height="1.5" fill="${dim}"/>`;
          for (let x = 5.5; x < g.w; x += 11) t += `<rect x="${x.toFixed(1)}" y="0" width="1.5" height="${g.h}" fill="${line}"/>`;
          return t;
        }
        case 'garde': {
          let t = `<rect x="0" y="${g.h / 2 - 0.75}" width="${g.w}" height="1.5" fill="${line}"/>`;
          for (let x = 11; x < g.w; x += 22) t += `<rect x="${x.toFixed(1)}" y="0" width="1.5" height="${g.h}" fill="${dim}"/>`;
          return t;
        }
        case 'tapis':
          return `<rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="3" fill="${jour ? 'rgba(10,15,13,0.02)' : 'rgba(255,255,255,0.02)'}" stroke="${dim}" stroke-width="1" stroke-dasharray="2 3"/>`;
        case 'vitrine':
          return `<rect x="0.75" y="0.75" width="${g.w - 1.5}" height="${g.h - 1.5}" rx="6" fill="${jour ? 'rgba(64,102,124,0.08)' : 'rgba(191,217,232,0.05)'}" stroke="${jour ? 'rgba(64,102,124,0.45)' : 'rgba(191,217,232,0.35)'}" stroke-width="1.2"/>`;
        default:
          return `<rect x="0.6" y="0.6" width="${g.w - 1.2}" height="${g.h - 1.2}" rx="6" fill="none" stroke="${dim}" stroke-width="1.2"/>`;
      }
    }

    /* Un meuble complet : wrapper positionné + SVG au trait + étiquette. */
    function caisseNoirElHTML(e) {
      const FC = window.KiwiFloorCore;
      const g = FC ? FC.geom(e) : { w: Math.max(8, +e.w || 80), h: Math.max(8, +e.h || 80) };
      const K = (FC && FC.FIX && FC.FIX[e.type]) || {};
      const label = (e.label != null ? e.label : (K.label || ''));
      return `<div class="pds-el pds-el-${e.type}" style="left:${e.x}px; top:${e.y}px; width:${g.w}px; height:${g.h}px; transform:rotate(${e.rot || 0}deg); z-index:${10 + (e.z || 0)};">
          <div class="pds-el-fill"><svg class="pds-el-svg" viewBox="0 0 ${g.w} ${g.h}" aria-hidden="true">${caisseNoirFixture(e, g)}</svg></div>
          ${label ? `<span class="pds-el-label" style="color:${caisseJour() ? 'rgba(10,15,13,0.45)' : 'rgba(255,255,255,0.45)'};">${escTeam(label)}</span>` : ''}
        </div>`;
    }

    /* Le sol quadrillé · pdsRoomShellNoir / pdsRoomShellJour du dashboard :
       la couleur du sol du commerçant éteinte vers le charbon (nuit) ou tirée
       vers le papier (jour), le voile de lumière et la grille 31px. */
    function caisseRoomShellNoir(zone) {
      const FC = window.KiwiFloorCore;
      const r = FC ? FC.room(zone) : ((zone && zone.room) || {});
      const floor = r.floor || '#FBF7EE';
      const wallW = (r.wallW != null) ? +r.wallW : 2;
      if (caisseJour()) {
        return `<div class="pds-floor" data-pds-floor style="
          background-color:${caisseJourC(floor, 0.30)};
          background-image:
            radial-gradient(78% 78% at 42% 34%, rgba(255,255,255,0.50), rgba(255,255,255,0.15) 60%, transparent 100%),
            linear-gradient(rgba(10,15,13,0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(10,15,13,0.055) 1px, transparent 1px);
          background-size: 100% 100%, 31px 31px, 31px 31px;
          background-repeat: no-repeat, repeat, repeat;
          ${wallW > 2 ? `box-shadow: inset 0 0 0 ${wallW}px rgba(10,15,13,0.30);` : ''}
        "></div>`;
      }
      return `<div class="pds-floor" data-pds-floor style="
        background-color:${caisseNoirC(floor, 0.03)};
        background-image:
          radial-gradient(78% 78% at 42% 34%, rgba(255,255,255,0.04), rgba(255,255,255,0.012) 60%, transparent 100%),
          linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px);
        background-size: 100% 100%, 31px 31px, 31px 31px;
        background-repeat: no-repeat, repeat, repeat;
        ${wallW > 2 ? `box-shadow: inset 0 0 0 ${wallW}px rgba(255,255,255,0.20);` : ''}
      "></div>`;
    }

    /* Dégradés/filtres partagés par toutes les tables d'un plan. IDs identiques
       au dashboard (pages-pro.js ne charge jamais ici, aucune collision) +
       le halo rose propre à bgha-ykhlass. Les deux jeux (Jour/Noir) sont émis
       ensemble : caisseNoirTableBody choisit le suffixe selon le thème, et un
       changement de thème n'a alors qu'à repeindre les tables.
       La classe pds-defs permet de retirer ce bloc au re-rendu. */
    function caisseNoirDefs() {
      return '<svg class="pds-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
        + '<linearGradient id="pdsNoirBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#101312"/><stop offset="100%" stop-color="#050605"/></linearGradient>'
        + '<radialGradient id="pdsNoirCall"><stop offset="0%" stop-color="#00FFAE" stop-opacity="0.20"/><stop offset="100%" stop-color="#00FFAE" stop-opacity="0"/></radialGradient>'
        + '<radialGradient id="pdsNoirCallRose"><stop offset="0%" stop-color="#FF7DA9" stop-opacity="0.20"/><stop offset="100%" stop-color="#FF7DA9" stop-opacity="0"/></radialGradient>'
        + '<filter id="pdsNoirLift" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.8"/></filter>'
        + '<linearGradient id="pdsJourBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="#F0EDE6"/></linearGradient>'
        + '<radialGradient id="pdsJourCall"><stop offset="0%" stop-color="#0B6E4F" stop-opacity="0.20"/><stop offset="100%" stop-color="#0B6E4F" stop-opacity="0"/></radialGradient>'
        + '<radialGradient id="pdsJourCallRose"><stop offset="0%" stop-color="#C2456F" stop-opacity="0.20"/><stop offset="100%" stop-color="#C2456F" stop-opacity="0"/></radialGradient>'
        + '<filter id="pdsJourLift" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0A0F0D" flood-opacity="0.18"/></filter>'
        + '</defs></svg>';
    }

    /* LA cellule table · démo et plan réel confondus. x/y en px du plan
       (coin haut-gauche du plateau), la bande de chaises déborde de PAD. */
    function caisseNoirCellHTML(o) {
      const PAD = (window.KiwiFloorCore && window.KiwiFloorCore.PAD) || 19;
      const ring = caisseRing(o.status);
      const g = { w: o.w, h: o.h, seats: o.seats || 0, shape: o.shape || 'rect' };
      const label = ({ 'khawya': 'Libre', 'a-commander': 'À commander', 'ka-yaklo': 'En cours', 'bgha-ykhlass': 'Addition', 'khlass': 'Réglée' })[o.status] || 'Khawya';
      const urgent = o.status === 'bgha-ykhlass' ? '<span class="cplan-urgent" aria-hidden="true"></span>' : '';
      return `<div class="cplan-tbl" data-table="${escTeam(String(o.id))}" role="button" tabindex="0"
             data-status="${o.status || 'khawya'}"
             aria-label="Table ${escTeam(String(o.id))}, ${label}, ${o.covers} couverts"
             style="left:${o.x - PAD}px; top:${o.y - PAD}px;
                    width:${g.w + PAD * 2}px; height:${g.h + PAD * 2}px;
                    --pad:${PAD}px; transform:rotate(${o.rot || 0}deg);">
          <svg viewBox="${-PAD} ${-PAD} ${g.w + PAD * 2} ${g.h + PAD * 2}" aria-hidden="true">
            ${caisseNoirChairs(g, g.seats, ring)}${caisseNoirTableBody(g, ring, o.status)}
          </svg>
          <div class="cplan-face" style="color:${caisseJour() ? 'rgba(10,15,13,0.5)' : 'rgba(255,255,255,0.5)'};">
            <span class="cplan-num">${escTeam(String(o.id))}</span>
            ${o.covers ? `<span class="cplan-cov">${o.covers}p</span>` : ''}
          </div>${urgent}${o.serverHTML || ''}${o.phoneHTML || ''}${o.elapsedHTML || ''}
        </div>`;
    }
    /* Injecte (une fois) le sol, le mobilier et les defs dans chaque scène
       démo. La terrasse reste sans sol · cadre mint pointillé, comme la zone
       terrasse du dashboard. */
    function initDemoPlanes() {
      document.querySelectorAll('.view-salle .cplan-room[data-plan-zone]').forEach(roomEl => {
        const zone = roomEl.getAttribute('data-plan-zone');
        const scale = roomEl.querySelector('.cplan-scale');
        if (!scale || scale.dataset.planeInit) return;
        scale.dataset.planeInit = '1';
        const fx = (DEMO_FIXTURES[zone] || []).map(e => caisseNoirElHTML(e)).join('');
        const shell = zone === 'terrasse' ? '' : caisseRoomShellNoir({ room: { floor: '#FBF7EE', wallW: 2 } });
        scale.insertAdjacentHTML('afterbegin', caisseNoirDefs() + shell + fx);
      });
    }

    function tableHTML(id, t) {
      if (t.designed) return designedTableHTML(id, t);  // real store: grid card, not the demo canvas node
      const P = DEMO_PLANES[t.zone] || DEMO_PLANES.interieur;
      const PAD = (window.KiwiFloorCore && window.KiwiFloorCore.PAD) || 19;
      const shape = t.shape || 'rect';
      // Coordonnées démo en % du plan → px de la scène (comme le dashboard).
      const w = ((+t.w || 9) / 100) * P.w;
      const h = shape === 'rect' ? Math.max(40, ((+t.h || 12) / 100) * P.h) : w;
      const x = Math.max(PAD, Math.min(P.w - w - PAD, ((+t.x || 0) / 100) * P.w));
      const y = Math.max(PAD, Math.min(P.h - h - PAD, ((+t.y || 0) / 100) * P.h));
      const hasOrder = (tableOrders[id] && tableOrders[id].length > 0) || (orders[id] && orders[id].length > 0);
      const elapsed = ((t.status === 'ka-yaklo' || t.status === 'bgha-ykhlass' || t.status === 'a-commander') && hasOrder && t.elapsed != null)
        ? `<div class="tbl-elapsed cplan-since">${t.elapsed} mn</div>`
        : '';
      // Server avatar badge · always shown (even on empty tables) so the
      // cashier/manager always knows who's responsible for the section
      let serverBadge = '';
      if (t.server && servers[t.server]) {
        const s = servers[t.server];
        const isPause = s.status === 'pause';
        const isOff   = s.status === 'off';
        const isEmpty = t.status === 'khawya' || t.status === 'khlass';
        const cls = [
          isPause ? 'is-pause' : '',
          isEmpty ? 'is-idle'  : '',
          isOff   ? 'is-off'   : '',
        ].filter(Boolean).join(' ');
        const why = isPause ? ' (en pause)' : isOff ? ' (hors service)' : '';
        serverBadge = `<span class="tbl-server ${cls}" style="background:${s.color};--server-badge-ink:${serverBadgeInk(s.color)};" title="Section de ${s.name}${why}">${serverInitials(s)}</span>`;
      }
      return caisseNoirCellHTML({
        id, status: t.status, x, y, w, h,
        shape: shape === 'round' ? 'round' : 'rect',
        seats: t.covers, covers: t.covers, rot: 0,
        serverHTML: serverBadge, phoneHTML: phoneBadgeHTML(id), elapsedHTML: elapsed,
      });
    }

    function renderSalle() {
      // A real store never renders the demo architecture · its floor is the
      // owner's dashboard design (or a clean empty state). Repaint that grid
      // from the live `tables` and stop.
      if (storeIsReal()) { renderRealGrid(); return; }
      // Clear all layers
      document.querySelectorAll('.view-salle .table-layer').forEach(layer => layer.innerHTML = '');

      // Render each table into its zone layer on its floor
      Object.keys(tables).forEach(id => {
        const t = tables[id];
        const layer = document.querySelector(
          `.plan-canvas[data-floor="${t.floor}"] .table-layer[data-zone="${t.zone}"]`
        );
        if (layer) layer.insertAdjacentHTML('beforeend', tableHTML(id, t));
      });

      // Per-floor occupancy counter
      [0, 1].forEach(floor => {
        const floorIds = Object.keys(tables).filter(id => tables[id].floor === floor);
        const occupied = floorIds.filter(id => tables[id].status !== 'khawya').length;
        const el = document.querySelector(`.plan-floor-count[data-floor-count="${floor}"]`);
        if (el) el.textContent = `${occupied} / ${floorIds.length} occupées`;
      });
    }
    function designedCovers(tb) {
      if (tb && tb.seats != null && isFinite(+tb.seats)) return +tb.seats;
      return DESIGN_COVERS[tb && tb.type] || 4;
    }

    function caisseFloorPlan() {
      if (!storeIsReal()) return null;                // demo uses the built-in plan
      let slug = '';
      try { const p = storePaired(); slug = (p && p.merchant) || ''; } catch (_) {}
      // Cross-device: a server-fed plan (future /api/floorplan) lands here first.
      try { if (window.KiwiFloorPlan && Array.isArray(window.KiwiFloorPlan.tables)) return window.KiwiFloorPlan; } catch (_) {}
      // Same-browser: the dashboard designer's slug-keyed mirror.
      try {
        if (slug) {
          const raw = localStorage.getItem('kiwiPlanDeSalle:slug:' + slug);
          if (raw) { const d = JSON.parse(raw); if (d && Array.isArray(d.tables)) return d; }
        }
      } catch (_) {}
      return null;
    }

    function emptyPlanHTML() {
      return '' +
        '<div class="plan-empty"><div class="plan-empty-card">' +
          '<div class="plan-empty-ico"><i data-lucide="layout-dashboard"></i></div>' +
          '<div class="plan-empty-title">Plan de salle pas encore conçu</div>' +
          '<div class="plan-empty-sub">Dessinez vos tables depuis votre tableau de bord · <b>Plan de salle</b>. Une fois conçu, il apparaîtra ici automatiquement.</div>' +
        '</div></div>';
    }

    function designedTableHTML(id, t) {
      const label = ({ 'khawya': 'Libre', 'a-commander': 'À commander', 'ka-yaklo': 'En cours', 'bgha-ykhlass': 'Addition', 'khlass': 'Réglée' })[t.status] || 'Khawya';
      const dot = t.status === 'bgha-ykhlass' ? '<span class="urgent-dot" aria-hidden="true"></span>' : '';
      let sb = '';
      if (t.server && servers[t.server]) {
        const s = servers[t.server];
        sb = `<span class="tbl-server" style="background:${s.color};--server-badge-ink:${serverBadgeInk(s.color)};" title="Section de ${escTeam(s.name)}">${serverInitials(s)}</span>`;
      }
      return `<div class="tbl-cell is-designed" data-table="${escTeam(id)}" role="button" tabindex="0" aria-label="Table ${escTeam(id)}, ${label}, ${t.covers} couverts">` +
        `<div class="tbl" data-status="${t.status}">${dot}` +
          `<div class="tbl-head"><span class="tbl-num">${escTeam(id)}</span><span class="tbl-covers">${t.covers}p</span></div>` +
          `<div class="tbl-status">${label}</div>` +
        `</div>${sb}${phoneBadgeHTML(id)}</div>`;
    }

    /* CAISSE_RING_NOIR + caisseRing vivent plus haut, dans le bloc du
       renderer noir unifié (avant le premier renderSalle()). */
    /* Nuit : les matières du plan (noyer, sable, laiton) s'éteignent vers le
       charbon en gardant 18 % de leur teinte · le même pdsNoirC que le
       dashboard (pages-pro.js), recopié ici parce que floorplan-core ne
       l'exporte pas. L'encre et le ton des chaises suivent tout seuls :
       pdsInk/pdsChairTone lisent la luminance de la couleur aplatie. */
    function caisseNoirC(hex, keep) {
      const k = keep == null ? 0.18 : keep;
      const h = String(hex || '#FBF7EE').replace('#', '');
      const n = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h;
      if (!/^[0-9a-fA-F]{6}$/.test(n)) return hex;
      const base = [4, 5, 4];
      const out = [0, 2, 4].map((i, j) => {
        const c = parseInt(n.slice(i, i + 2), 16);
        return Math.round(base[j] + (c - base[j]) * k);
      });
      return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
    }

    /* Jour : la même matière tirée vers le papier (#F7F5F0) au lieu du
       charbon · pdsJourC du dashboard. */
    function caisseJourC(hex, keep) {
      const k = keep == null ? 0.16 : keep;
      const h = String(hex || '#FBF7EE').replace('#', '');
      const n = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h;
      if (!/^[0-9a-fA-F]{6}$/.test(n)) return hex;
      const base = [247, 245, 240];
      const out = [0, 2, 4].map((i, j) => {
        const c = parseInt(n.slice(i, i + 2), 16);
        return Math.round(base[j] + (c - base[j]) * k);
      });
      return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
    }

    /* ═══════════════════════════════════════════════════════════════════════
       LE TÉLÉPHONE DU CLIENT, SUR LE PLAN DE SALLE
       ---------------------------------------------------------------------
       Deux choses différentes, et il faut les distinguer d'un coup d'œil :
         · un client est ASSIS et lit la carte sur son téléphone · discret, une
           pastille ; il n'y a rien à faire, c'est juste bon à savoir ;
         · une commande ATTEND d'être acceptée · ça clignote et ça porte un
           compte, parce que tant que personne ne tape, la cuisine ne voit rien.
       L'état ne vit PAS dans `tables` : setupRealSalle() efface et reconstruit
       cet objet dès que le patron touche son plan depuis son téléphone, ce qui
       emporterait les sessions avec. Il vit dans sa propre carte, indexée par
       table, et survit à la reconstruction.
       ═══════════════════════════════════════════════════════════════════════ */
    /* La même normalisation que le serveur (functions/api/order/_lib.js) :
       « T7 », « t7 » et « T 7 » désignent la table que le patron a nommée T7. */
    function tableKey(v) {
      return String(v == null ? '' : v).toUpperCase().replace(/\s+/g, '').trim();
    }
    function phoneBadgeHTML(id) {
      const k = tableKey(id);
      const n = phonePending.get(k) || 0;
      if (n > 0) {
        return `<span class="cplan-order" aria-label="${n} commande${n > 1 ? 's' : ''} à accepter">${n}</span>`;
      }
      if (phoneSeats.has(k)) {
        return '<span class="cplan-phone" aria-label="Un client commande depuis son téléphone"></span>';
      }
      return '';
    }
    function phoneSessionOf(id) {
      const s = phoneSeats.get(tableKey(id));
      // The queue create response may arrive before the next floor poll. The
      // cashier must still settle that exact visit, not a reusable table no.
      return (s && s.session) || String(tables[id]?.timerSession || '');
    }
    function locallySettledVisit(id, session) {
      return !!session && journal.some(entry => entry && entry.visitClosed === true
        && entry.table === String(id) && entry.session === String(session));
    }
    /* The visits of this table already paid at this till. The first ticket of
       a new party used to join the previous visit whenever that visit's close
       had not reached the server yet; the old party's replayed settlement then
       paid the new ticket and emptied the table (Pasta Corner, table 6, #86).
       The queue closes these visits, without marking anything paid, before
       it files the ticket. */
    function settledVisitsFor(id) {
      if (!id) return undefined;
      return [...new Set(journal.filter(e => e && e.visitClosed === true && e.session
        && e.table === String(id)).map(e => String(e.session)))].slice(-20);
    }
    /* A closed visit may only clear the bill it belonged to. The floor poll
       hides a fresh visit for a minute after the previous party leaves, and a
       poll read before "Envoyer en cuisine" can land after it: in both cases
       the previous party's closure used to wipe the new party's bill. */
    function billBelongsToOtherVisit(id, closedId) {
      const own = String(tables[id]?.timerSession || '');
      if (own && own !== String(closedId || '')) return true;
      /* A ticket the server never acknowledged belongs to a visit the server
         has not seen, so no server closure can be about it. This guard used to
         expire after two minutes: at Pasta Corner (#0163) the first relay of a
         new table 9 visit stalled past that, and the earlier, already-paid
         table 9 visit (closedSessions spans twelve hours) erased the new bill. */
      return kdsOrders.some(o => o && o.type === 'dineIn' && String(o.table) === String(id)
        && !o.paid && o.opId && !o.session && o.opNum == null);
    }
    function locallySettledOrder(id, number) {
      if (number == null || String(number).trim() === '') return false;
      const ref = tableSaleLabel(id, String(number));
      return journal.some(entry => entry && entry.table === String(id)
        && entry.ref === ref && entry.kind !== 'refund' && !entry.voided && !entry.split);
    }
    function paidReceiptForCurrentTable(id) {
      const table = tables[id];
      if (!table) return null;
      const session = phoneSessionOf(id);
      const orderNo = String(table.orderNo || '').trim();
      return journal.find(entry => entry && entry.table === String(id)
        && entry.kind !== 'refund' && !entry.voided && !entry.split
        && ((session && entry.session === session)
          || (orderNo && entry.ref === tableSaleLabel(id, orderNo)
            && (!session || !entry.session || entry.session === session)))) || null;
    }

    /* Libérer la table côté téléphone. Appelée quand l'addition est réglée, et
       aussi quand la table est rendue sans encaissement · sinon un téléphone
       resterait « assis » à une table libre et pourrait continuer à commander.
       L'état local part TOUT DE SUITE (la pastille s'éteint sous le doigt du
       caissier) et le réseau suit à son rythme, porté par orderpro-inbox.js. */
    function releasePhoneTable(id, why, force, actorProof = '', alreadyClosed = false) {
      const k = tableKey(id);
      tableClosedAt[k] = Date.now();
      const seat = phoneSeats.get(k);
      const session = (seat && seat.session) || String(tables[id]?.timerSession || '');
      phoneSeats.delete(k);
      phonePending.delete(k);
      /* A caisse may not have observed the phone session yet. A forced
         release must still close the table remotely, otherwise OrderPro keeps
         the guest seated after the cashier has made the table free. */
      if (alreadyClosed || (!seat && !force)) return;
      document.dispatchEvent(new CustomEvent('kiwi-table-released', {
        detail: { table: String(id), session, why: why || 'settle', actorProof },
      }));
    }
    function markSelectedTable(id) {
      $$(TBL_SEL).forEach(c => {
        const on = c.dataset.table === id;
        // La carte a un fond intérieur à teinter ; la table dessinée, non.
        const inner = c.querySelector('.tbl');
        if (inner) inner.classList.toggle('is-selected', on);
        else c.classList.toggle('is-selected', on);
      });
    }

    /* UNE table du plan spatial. Extraite de renderRealGrid pour qu'on puisse
       en redessiner une seule : elle vivait dans un .map() anonyme, donc le
       seul moyen de rafraîchir une table était de reconstruire la salle
       entière · ce qui coupe toute animation en cours et efface la sélection.
       refreshTableNode() s'en sert maintenant, exactement comme la démo se sert
       de tableHTML(). */
    function planTableOf(id) {
      const list = (__realPlan && __realPlan.tables) || [];
      return list.find(t => String(t.num || t.id) === String(id)) || null;
    }

    function cplanTableHTML(t) {
      const C = window.KiwiFloorCore;
      if (!C || !t) return '';
      const id = String(t.num || t.id);
      const live = tables[id] || {};
      const g = C.geom(t);
      const covers = live.covers != null ? live.covers : g.seats;
      const sv = live.server && servers[live.server];
      const badge = sv
        ? `<span class="tbl-server" style="background:${sv.color};--server-badge-ink:${serverBadgeInk(sv.color)};">${serverInitials(sv)}</span>` : '';
      const hasOrder = (tableOrders[id] && tableOrders[id].length > 0) || (orders[id] && orders[id].length > 0);
      const hot = (live.status === 'ka-yaklo' || live.status === 'bgha-ykhlass' || live.status === 'a-commander') && hasOrder;
      const elapsed = hot && live.elapsed != null
        ? `<div class="tbl-elapsed cplan-since">${live.elapsed} mn</div>` : '';
      return caisseNoirCellHTML({
        id, status: live.status, x: +t.x || 0, y: +t.y || 0,
        w: g.w, h: g.h, shape: g.shape, seats: g.seats, covers,
        rot: t.rot || 0, serverHTML: badge, phoneHTML: phoneBadgeHTML(id), elapsedHTML: elapsed
      });
    }
    function renderRealGrid() {
      const host = document.querySelector('.view-salle .plan-real');
      if (!host) return;
      const C = window.KiwiFloorCore;
      const plan = __realPlan;
      const ids = Object.keys(tables);
      if (!ids.length) { host.innerHTML = emptyPlanHTML(); if (window.lucide) lucide.createIcons(); return; }

      /* No core or no coordinates → fall back to the card grid rather than
         render an empty room. */
      const spatial = !!(C && plan && (plan.tables || []).some(t => +t.x || +t.y));
      if (!spatial) {
        const byZone = {};
        ids.forEach(id => {
          const zid = tables[id].zone || 'z1';
          if (__activeRealZoneFilter && __activeRealZoneFilter !== 'all' && zid !== __activeRealZoneFilter) return;
          const z = tables[id].zoneName || 'Salle';
          (byZone[z] || (byZone[z] = [])).push(id);
        });
        const order = __realZoneOrder.length ? __realZoneOrder : Object.keys(byZone);
        let html = '';
        order.forEach(z => {
          const zi = byZone[z]; if (!zi || !zi.length) return;
          html += `<div class="plan-real-zone"><div class="plan-real-zone-h">${escTeam(z)} <em>· ${zi.length} table${zi.length > 1 ? 's' : ''}</em></div><div class="plan-real-grid">`;
          zi.forEach(id => { html += designedTableHTML(id, tables[id]); });
          html += '</div></div>';
        });
        host.innerHTML = html;
        if (window.lucide) lucide.createIcons();
        return;
      }

      let html = caisseNoirDefs();
      (plan.zones || []).forEach(z => {
        if (__activeRealZoneFilter && __activeRealZoneFilter !== 'all' && z.id !== __activeRealZoneFilter) return;
        const zTables = (plan.tables || []).filter(t => (t.zone || 'z1') === z.id);
        const zEls = (plan.elements || []).filter(e => (e.zone || 'z1') === z.id)
                       .slice().sort((a, b) => (a.z || 0) - (b.z || 0));
        if (!zTables.length && !zEls.length) return;
        const W = Math.max(240, +((z.room || {}).w) || 880);
        const H = Math.max(200, +((z.room || {}).h) || 540);
        const occ = zTables.filter(t => {
          const st = (tables[String(t.num || t.id)] || {}).status;
          return st && st !== 'khawya';
        }).length;

        const items = zTables.map(t => cplanTableHTML(t)).join('');

        html += `<div class="cplan-zone">
            <div class="plan-real-zone-h">${escTeam(z.name || 'Salle')}
              <em>· ${zTables.length} table${zTables.length > 1 ? 's' : ''} · ${occ} occupée${occ > 1 ? 's' : ''}</em></div>
            <div class="cplan-room" style="aspect-ratio:${W} / ${H};">
              <div class="cplan-scale" style="width:${W}px; height:${H}px;
                   transform:scale(calc(100cqw / ${W}px));">
                ${caisseRoomShellNoir(z)}
                ${zEls.map(e => caisseNoirElHTML(e)).join('')}
                ${items}
              </div>
            </div>
          </div>`;
      });
      host.innerHTML = html;
      if (window.lucide) lucide.createIcons();
    }

    // Read the plan, (re)build `tables` from it, then paint. Runtime service
    // state must survive this rebuild: the cloud plan can refresh while an
    // OrderPro order is being accepted, and geometry is not authority for the
    // current bill or occupancy.
    function setupRealSalle() {
      if (!storeIsReal()) return;                      // demo untouched
      const view = document.querySelector('.view-salle');
      if (!view) return;
      view.classList.add('has-real-plan');
      view.querySelectorAll('.plan-canvas').forEach(c => { c.style.display = 'none'; });  // hide demo architecture
      let host = view.querySelector('.plan-real');
      if (!host) { host = document.createElement('div'); host.className = 'plan-real'; view.appendChild(host); }

      const plan = caisseFloorPlan();
      const runtimeTables = new Map();
      Object.keys(tables).forEach((id) => runtimeTables.set(tableKey(id), tables[id]));
      Object.keys(tables).forEach(k => { delete tables[k]; });
      __realZoneOrder = [];
      __realPlan = plan;
      if (!plan || !Array.isArray(plan.tables) || !plan.tables.length) {
        host.innerHTML = emptyPlanHTML();
        if (window.lucide) lucide.createIcons();
        return;
      }

      const validZones = (plan.zones || []).filter(z => {
        const zTables = (plan.tables || []).filter(t => (t.zone || 'z1') === z.id);
        const zEls = (plan.elements || []).filter(e => (e.zone || 'z1') === z.id);
        return zTables.length || zEls.length;
      });

      const tog = document.querySelector('.main-head[data-mode-section="salle"] .floor-toggle');
      if (tog) {
        if (validZones.length > 1) {
          tog.style.display = 'inline-flex';
          tog.innerHTML = `<button class="floor-pill is-active" role="tab" data-real-zone="all"><span>Toutes</span></button>` +
            validZones.map(z => `<button class="floor-pill" role="tab" data-real-zone="${escTeam(z.id)}"><span>${escTeam(z.name || 'Salle')}</span></button>`).join('');
          tog.querySelectorAll('.floor-pill').forEach(btn => {
            btn.addEventListener('click', () => {
              tog.querySelectorAll('.floor-pill').forEach(b => {
                b.classList.toggle('is-active', b === btn);
                b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
              });
              __activeRealZoneFilter = btn.dataset.realZone;
              renderRealGrid();
            });
          });
        } else {
          tog.style.display = 'none';
        }
      }
      const zn = {}; (plan.zones || []).forEach(z => { zn[z.id] = z.name || 'Salle'; });

      /* ── L'AFFECTATION DES SERVEURS, enfin reprise ──────────────────────
         Le patron répartit ses sections en glissant un serveur sur une table
         (mode Affectation du plan de salle) ; le plan garde ça dans
         `tb.server`, un identifiant de `plan.staff`. Cette fonction écrivait
         `server: null` en dur, donc l'affectation était jetée à l'arrivée :
         aucune table de vrai commerçant n'a JAMAIS porté de serveur, ni sur le
         plan, ni sur le bandeau de l'addition, ni sur le ticket cuisine.
         Les deux moitiés existaient et ne se parlaient pas.

         Les identifiants ne coïncident pas, et ne peuvent pas : `servers` est
         reconstruit depuis les codes d'accès du personnel (rebuildRealRoster,
         clés S1…Sn), tandis que le plan a ses propres ids. Le NOM est le seul
         mot commun aux deux. On rapproche donc là-dessus, et faute de
         correspondance on laisse vide plutôt que d'attribuer une table au
         mauvais serveur · se tromper de nom est pire que ne pas en avoir. */
      const staffById = {};
      (plan.staff || []).forEach(s => { if (s && s.id) staffById[String(s.id)] = s; });
      const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
      const localByName = {};
      Object.keys(servers).forEach(k => { localByName[norm(servers[k].name)] = k; });
      function localServerFor(tb) {
        if (!tb || !tb.server) return null;
        const key = String(tb.server);
        // Le plan peut déjà porter la clé locale (S1…) ou un id de son staff.
        if (servers[key]) return key;
        const s = staffById[key];
        const byName = s && localByName[norm(s.name)];
        return byName || null;
      }

      plan.tables.forEach(tb => {
        const id = String(tb.num || tb.id);
        const key = tableKey(id);
        const previous = runtimeTables.get(key);
        const hasBill = !!((tableOrders[id] || []).length);
        const hasLiveVisit = hasBill || phoneSeats.has(key) || phonePending.has(key)
          || !!(previous && previous.status && previous.status !== 'khawya');
        const zone = zn[tb.zone] || 'Salle';
        if (__realZoneOrder.indexOf(zone) < 0) __realZoneOrder.push(zone);
        /* Carry the designed geometry through · the owner's layout is the
           point of the mirror, so shape/position/size come from the plan
           rather than being flattened to a round table at 0,0. */
        const rebuilt = {
          designed: true, floor: 0, zone: tb.zone || 'z1', zoneName: zone,
          shape: tb.shape || 'round', covers: designedCovers(tb),
          status: hasLiveVisit
            ? ((previous && previous.status && previous.status !== 'khawya') ? previous.status : 'ka-yaklo')
            : 'khawya',
          server: (hasLiveVisit && previous && previous.server) || localServerFor(tb),
          x: +tb.x || 0, y: +tb.y || 0, w: +tb.w || 0, h: +tb.h || 0,
          rot: +tb.rot || 0, color: tb.color || null, num: tb.num || id,
          elapsed: hasLiveVisit && previous ? Math.max(0, +previous.elapsed || 0) : 0,
        };
        if (hasLiveVisit && previous) {
          if (+previous.covers > 0) rebuilt.covers = +previous.covers;
          ['orderStartedAt', 'timerSession', 'orderNo', 'discount', 'reopenRef', 'reopenSessionId', 'reopenedBill', 'settlement'].forEach((field) => {
            if (previous[field] != null) rebuilt[field] = previous[field];
          });
        }
        tables[id] = {};
        tableSettlement().project(tables[id], rebuilt);
      });
      renderRealGrid();
    }

    /* ---------- Floor switching (RDC ↔ 1er étage) ---------- */
    function setFloor(floor) {
      const f = String(floor);
      document.querySelectorAll('.floor-pill').forEach(p => {
        const isActive = p.dataset.floor === f;
        p.classList.toggle('is-active', isActive);
        p.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      document.querySelectorAll('.plan-canvas').forEach(c => {
        const isActive = c.dataset.floor === f;
        c.classList.toggle('is-active', isActive);
        c.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      });
      document.querySelectorAll('.plan-floor-count').forEach(el => {
        el.hidden = el.dataset.floorCount !== f;
      });
    }

    function isFeatureOff(key) {
      try {
        if (window.KiwiConfig && typeof window.KiwiConfig.off === 'function') {
          return window.KiwiConfig.off(key);
        }
        if (window.KiwiConfig && window.KiwiConfig.features) {
          const feats = window.KiwiConfig.features;
          if (feats[key] === false) return true;
          if (key === 'salle' && feats.tables === false) return true;
          if (key === 'tables' && feats.salle === false) return true;
          if (key === 'vrap' && (feats['a-emporter'] === false || feats.takeout === false)) return true;
          if (key === 'waitlist' && feats.attente === false) return true;
          if (key === 'tableTransfer' && (feats['table-transfer'] === false || feats['caisse-transfer'] === false)) return true;
          if (key === 'table-transfer' && (feats.tableTransfer === false || feats['caisse-transfer'] === false)) return true;
          if (key === 'tableMerge' && (feats['table-merge'] === false || feats['caisse-merge'] === false)) return true;
          if (key === 'table-merge' && (feats.tableMerge === false || feats['caisse-merge'] === false)) return true;
          if (key === 'remboursement' && (feats.refund === false || feats.returns === false)) return true;
          if (key === 'cash-move' && (feats.cashMove === false || feats['mouvement-caisse'] === false)) return true;
          if (key === 'cashMove' && (feats['cash-move'] === false || feats['mouvement-caisse'] === false)) return true;
          if (key === 'open-drawer' && feats.openDrawer === false) return true;
          if (key === 'openDrawer' && feats['open-drawer'] === false) return true;
          if (key === 'kds' && feats.kds === false) return true;
        }
      } catch (_) {}
      return false;
    }

    function syncActiveMode() {
      if (isFeatureOff(mode)) {
        const fallback = ['salle', 'vrap', 'waitlist'].find(m => !isFeatureOff(m));
        if (fallback && fallback !== mode) {
          setMode(fallback);
        }
      }
    }



    function setMode(newMode) {
      if (isFeatureOff(newMode)) {
        const fallback = ['salle', 'vrap', 'waitlist'].find(m => !isFeatureOff(m));
        if (!fallback || fallback === newMode) return;
        newMode = fallback;
      }
      if (newMode === mode) return;
      mode = newMode;
      document.body.dataset.mode = newMode;

      // Pills: only salle/vrap get pressed; order mode = neither
      $$('.mode-pill').forEach(p =>
        p.setAttribute('aria-pressed',
          (newMode === 'salle' || newMode === 'vrap' || newMode === 'waitlist') && p.dataset.mode === newMode ? 'true' : 'false'));

      const ttTools = $('#rp-table-tools');
      if (ttTools && newMode !== 'salle') {
        ttTools.hidden = true;
        ttTools.style.display = 'none';
      }

      // Toggle main headers + views
      // 'order' mode reuses the vrap menu sections
      $$('[data-mode-section]').forEach(el => {
        const sec = el.dataset.modeSection;
        const match = sec === newMode || (newMode === 'order' && sec === 'vrap');
        el.hidden = !match;
        el.classList.toggle('is-active', match);
      });

      // Update vrap header text depending on context
      const vrapTitle = $('.main-head[data-mode-section="vrap"] .main-title');
      if (vrapTitle) {
        if (newMode === 'order' && selectedId) {
          setCaisseTableLock(selectedId, 'acquire');
          const t = tables[selectedId];
          vrapTitle.innerHTML = `Commande <strong style="color:var(--forest)">${selectedId}</strong>
            <span class="order-mode-badge"><i data-lucide="pencil-line"></i> en cours</span>
            <em>· ${t.covers} couvert${t.covers > 1 ? 's' : ''}</em>`;
        } else {
          vrapTitle.innerHTML = 'À emporter<em>· vente au comptoir</em>';
        }
      }

      // Update mode-specific labels
      const cancelLabel = $('[data-cancel-label]');
      if (cancelLabel) {
        cancelLabel.textContent = newMode === 'vrap' ? "Vider la commande"
          : newMode === 'order' ? 'Annuler commande' : 'Annuler la table';
      }

      // Reset right panel · persist any À emporter edit, drop the edit state
      if (vrapEditingNum != null) { saveVrapEdits(); currentOrder().setEditing(null); currentOrder().replaceCart([]); }
      currentOrder().setDiscount(null);
      // Changer de mode change de note : la fiche client attachée se relâche.
      try { renderSaleClient(); } catch (_) {}
      if (newMode === 'salle') {
        showPayButtons(false);
        if (selectedId) renderRightPanel(selectedId);
        else showEmpty();
      } else if (newMode === 'order') {
        currentOrder().replaceCart([]);
        setVrapView('builder');
        renderOrderPanel(selectedId);
      } else if (newMode === 'waitlist') {
        if (selectedId) { setCaisseTableLock(selectedId, 'release'); selectedId = null; }
        renderWaitlist();  // the right addition panel is hidden via body[data-mode] CSS
      } else {
        if (selectedId) { setCaisseTableLock(selectedId, 'release'); selectedId = null; }
        setVrapView('board');
        showPayButtons(false);
        renderCart();
      }
      /* A persisted native shift can reach setMode() while this inline script is
         still parsing, before the deferred icon runtime has executed. Icons are
         decorative; their loader's own first-paint pass will fill them in. */
      if (window.lucide) lucide.createIcons();
    }

    /* ---------- Toast ---------- */
    function toast(msg, ms = 3200, kind = '', desc = '') {
      const lower = String(msg || '').toLowerCase();
      if (!kind) kind = /refus|erreur|illisible|impossible|requis/.test(lower) ? 'danger' : /d'abord|attention|d\u00e9j\u00e0|scannez/.test(lower) ? 'warn' : 'success';
      if (window.KiwiCaisseLang) { msg = window.KiwiCaisseLang.tr(msg); if (desc) desc = window.KiwiCaisseLang.tr(desc); }
      const el = document.createElement('div');
      el.className = `toast is-${kind}`;
      el.setAttribute('role', kind === 'danger' ? 'alert' : 'status');
      const copy = document.createElement('span'); copy.className = 'toast-copy';
      const title = document.createElement('span'); title.className = 'toast-title'; title.textContent = msg;
      copy.appendChild(title);
      if (desc) { const detail = document.createElement('span'); detail.className = 'toast-desc'; detail.textContent = desc; copy.appendChild(detail); }
      el.appendChild(copy);
      $('#toast-stack').appendChild(el);
      setTimeout(() => { el.classList.add('fade'); }, ms);
      setTimeout(() => { el.remove(); }, ms + 280);
      try { window.dispatchEvent(new CustomEvent('kiwi:toast', { detail: { title: String(msg || ''), desc: String(desc || ''), type: kind } })); } catch (_) {}
    }

    function setCaisseTableLock(tableId, action) {
      if (window.KiwiTillTenant?.mismatch()) return;
      const merchant = currentMerchantSlug();
      if (!merchant || !storeIsReal() || !tableId) return;
      fetch('/api/service/events', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant,
          lock: {
            table: tableId,
            action: action || 'acquire',
            actor: (typeof cashierName !== 'undefined' && cashierName) || 'Caisse'
          }
        })
      }).catch(() => {});
    }

    function renderRightPanel(id) {
      const t = tables[id];
      const lines = generateOrder(id, t);
      const total = lines.reduce((sum, l) => sum + l.total, 0);
      // La note change → la fiche client attachée suit (ou se détache).
      try { renderSaleClient(); } catch (_) {}

      $('#rp-table').textContent = `${id} · ${t.covers} couvert${t.covers > 1 ? 's' : ''}`;

      const subEl = $('#rp-substatus');
      const flag = t.status === 'bgha-ykhlass' ? 'bgha-ykhlass' : (t.status === 'a-commander' ? 'a-commander' : 'ka-yaklo');
      subEl.dataset.flag = flag;
      const hasOrder = (tableOrders[id] && tableOrders[id].length > 0) || (orders[id] && orders[id].length > 0);
      const subText = !hasOrder
        ? (phoneSeats.has(tableKey(id)) ? 'Client connecté sur téléphone' : (t.status === 'a-commander' ? 'À commander' : 'Table ouverte'))
        : ({
            'bgha-ykhlass': `Addition · ${t.elapsed || 0} mn`,
            'a-commander':  `À commander · ${t.elapsed || 0} mn`,
            'ka-yaklo':     `En cours · ${t.elapsed || 0} mn`,
          })[flag];
      subEl.textContent = subText;

      // Server row
      const serverRow = $('#rp-server-row');
      if (mode !== 'vrap' && t.server && servers[t.server]) {
        const s = servers[t.server];
        $('#rp-server-avatar').textContent = serverInitials(s);
        $('#rp-server-avatar').style.background = s.color;
        $('#rp-server-name').textContent = s.name + (s.status === 'pause' ? ' · en pause' : '');
        serverRow.hidden = false;
      } else {
        serverRow.hidden = true;
      }

      // Split-in-progress card and table tools
      renderRpSplitCard(id);
      const tt = $('#rp-table-tools');
      if (tt) {
        const canUseTableTools = hasTables();
        const transferOff = !canUseTableTools || isFeatureOff('tableTransfer') || isFeatureOff('table-transfer');
        const mergeOff = !canUseTableTools || isFeatureOff('tableMerge') || isFeatureOff('table-merge');
        const trBtn = $('#rp-transfer-table');
        const mgBtn = $('#rp-merge-table');
        if (trBtn) { trBtn.hidden = transferOff; trBtn.style.display = transferOff ? 'none' : ''; }
        if (mgBtn) { mgBtn.hidden = mergeOff; mgBtn.style.display = mergeOff ? 'none' : ''; }
        [trBtn, mgBtn].forEach(button => {
          if (!button) return;
          button.disabled = false;
          button.title = '';
        });
        tt.hidden = transferOff && mergeOff;
        tt.style.display = (transferOff && mergeOff) ? 'none' : '';
      }

      // Remise · recompute the discount amount against the current gross
      const discAmt = discountAmountFor(id, total);
      const net = Math.max(0, total - discAmt);
      const savedSplit = liveTableSplit(id);
      const splitRemaining = savedSplit ? splitRemainingTotal(savedSplit) : null;

      let itemsHTML = lines.map(l => `
        <div class="rp-item">
          <span class="rp-item-qty">${l.qty}×${l.sent && l.kind !== 'formula-part' && l.uid
            ? `<button type="button" class="qty-btn" data-table-void="${kdsEsc(l.uid)}" aria-label="Annuler un ${kdsEsc(l.name)} envoyé en cuisine">−</button>` : ''}</span>
          <span class="rp-item-name">${lineName(l)}${promoTag(l)}${l.held ? ' <span class="rp-hold-mark">À suivre</span>' : ''}</span>
          <span class="rp-item-price mono">${fmtMAD(l.total)}</span>
          ${l.note && l.note.trim() ? `<span class="rp-item-noteline">Note cuisine · ${kdsEsc(l.note)}</span>` : ''}
        </div>
      `).join('');
      if (discAmt > 0) {
        const d = t.discount;
        const tag = d.kind === 'pct' ? `Remise ${d.value} %` : 'Remise';
        itemsHTML += `
        <div class="rp-item rp-item--discount">
          <span class="rp-item-qty" style="cursor:pointer;" data-action="edit-discount" title="Modifier la remise"><i data-lucide="badge-percent"></i></span>
          <span class="rp-item-name" style="cursor:pointer;" data-action="edit-discount" title="Modifier la remise">${tag}${d.reason ? ' · ' + d.reason : ''}</span>
          <span class="rp-item-price mono" style="cursor:pointer;" data-action="edit-discount" title="Modifier la remise">−${fmtMAD(discAmt)}</span>
          <button type="button" class="rp-item-del-btn" data-action="remove-table-discount" title="Supprimer la remise" aria-label="Supprimer la remise">
            <i data-lucide="trash-2"></i>
          </button>
        </div>`;
      }
      const currentCashier = (typeof cashierName !== 'undefined' && cashierName) || 'Caisse';
      const activeLock = caisseTableLocks && caisseTableLocks[id];
      const isLockedByOther = activeLock && activeLock.actor && activeLock.actor !== currentCashier && (Date.now() - Number(activeLock.ts || 0) < 60000);
      /* `esc` n'a jamais existé dans cette page — une seule occurrence, aucune
         déclaration, et aucun des assets chargés n'en expose. Le littéral était
         donc évalué dès qu'un collègue tenait la table (le verrou porte SON nom,
         jamais celui de la caisse : le cas normal en service), il levait une
         ReferenceError, et renderRightPanel s'arrêtait AVANT d'écrire le
         sous-total, le total, le montant carte, le montant espèces et le rendu.
         Le panneau gardait les montants de la table affichée juste avant : on
         encaissait la table 5 en croyant encaisser la table 7.

         Deux corrections, pas une. On échappe avec escTeam, qui existe et est
         dans la portée ; et on met la bannière hors d'état de nuire, parce qu'un
         libellé décoratif ne doit jamais pouvoir empêcher un montant de
         s'afficher. */
      let lockBanner = '';
      if (isLockedByOther) {
        try {
          lockBanner = `
        <div class="td-lock-banner" style="margin-bottom:10px;background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;padding:8px 12px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#92400E;">
          <i data-lucide="lock" style="width:16px;height:16px;color:#B45309;flex-shrink:0;"></i>
          <span><b>${escTeam(activeLock.actor)}</b> prend la commande sur cette table</span>
        </div>
      `;
        } catch (_) { lockBanner = ''; }
      }
      /* A table is managed as one bill, not as a stack of kitchen ticket
         numbers the cashier has to remember. Whole-table cancellation lives
         on “Annuler mesa”; individual corrections live on each line's −. */
      $('#rp-items').innerHTML = lockBanner + itemsHTML;

      $('#rp-total').textContent = fmtMAD(splitRemaining != null ? splitRemaining : net);
      window.CaisseFx && window.CaisseFx.countTotal();

      // Sync modal labels too
      payMeta({ prefix: true, table: id, covers: t.covers, unit: +t.covers > 1 ? 'couverts' : 'couvert' });
      $('#card-amount').textContent = fmtMADcents(net);
      $('#cash-amount').textContent = fmtMADcents(net);
      $('#cash-received').value = net;
      updateRendu();
      showPayButtons(false);
      /* A resumed split is the only valid payment route. Leaving the ordinary
         button visible here charged the full 60 MAD again after a 35 MAD part
         had already been recorded, even though the split card showed 25 MAD
         remaining. */
      if (savedSplit && splitPaidCount(savedSplit) < savedSplit.parts.length) {
        const normal = $('#rp-pay-normal');
        if (normal) {
          normal.hidden = true;
          normal.style.display = 'none';
        }
      }
      /* Une commande OrderPro à table est rattachée à l'addition avant d'être
         acceptée. Elle doit pouvoir partir depuis CETTE fiche, sans obliger le
         caissier à découvrir le panneau secondaire « Commandes ». Le bouton
         reste caché quand toutes les lignes sont déjà parties. */
      const kitchenBtn = $('#rp-send-kitchen');
      const tableKitchenPending = (tableOrders[id] || []).some(l => l && (l.orderProPending || !l.sent));
      kitchenBtn.hidden = !tableKitchenPending;
      const kitchenBtnLabel = kitchenBtn.querySelector('span');
      const heldQty = tableHeldQty(id);
      if (kitchenBtnLabel) kitchenBtnLabel.textContent = (tableOrders[id] || []).some(l => l && l.orderProPending)
        ? 'Accepter · envoyer en cuisine'
        : tableSuiteOnly(id) ? `Envoyer la suite · ${heldQty}` : 'Envoyer en cuisine';
      /* La seule porte de retour vers le menu depuis une addition ouverte. Elle
         n'existe qu'en salle, et pas sur une table déjà encaissée · on ne
         rouvre pas une note soldée, on rouvre une mesa. */
      const addBtn = $('#rp-add-items');
      if (addBtn) addBtn.hidden = !(mode === 'salle' && t.status !== 'khlass');
    }

    function openTable(id) {
      const t = tables[id];
      // Keep the table's real status (Ka-yaklo / Addition) · the selection
      // highlight already shows which bill is open, so there's no separate
      // "payment in progress" status.
      selectedId = id;
      if (document.documentElement.classList.contains('kiwi-native')) renderMenu();
      refreshTableNode(id);

      markSelectedTable(id);

      renderRightPanel(id);
      $('#rp-empty').hidden = true;
      $('#rp-empty').style.display = 'none';
      const active = $('#rp-active');
      active.hidden = false;
      active.style.display = 'flex';
      // re-trigger slide-in animation
      active.style.animation = 'none';
      void active.offsetWidth;
      active.style.animation = '';

      lucide.createIcons();
    }

    function showEmpty() {
      $$('.tbl').forEach(el => el.classList.remove('is-selected')); // inner tabletops only
      $('#rp-active').hidden = true;
      $('#rp-active').style.display = 'none';
      const empty = $('#rp-empty');
      empty.hidden = false;
      empty.style.display = 'flex';
      /* Remettre l'addition à zéro AVANT de la masquer. Le panneau caché garde
         son dernier montant, et sur la disposition téléphone/tablette portrait
         la barre repliée « Addition » le recopie (caisse-motion.js countTotal) :
         une caisse vide affichait donc encore les 40 MAD de la note précédente,
         seul chiffre visible tant que la feuille n'est pas dépliée. Un montant
         faux en évidence sur un comptoir, c'est une erreur de caisse qui attend
         son tour. */
      $('#rp-total').textContent = fmtMAD(0);
      window.CaisseFx && window.CaisseFx.countTotal();
      // Mode-aware prompt text
      const txt = $('#rp-empty-text');
      if (txt) {
        txt.textContent = mode === 'vrap'
          ? 'Commande vide. Choisissez un article dans le menu.'
          : "Touchez une table pour voir l'addition.";
      }
    }

    function closeRightPanel() {
      $$('.tbl').forEach(el => el.classList.remove('is-selected')); // inner tabletops only
      selectedId = null;
      if (mode === 'order') {
        backToSalle();
        return;
      }
      showEmpty();
    }

    function refreshTableNode(id) {
      /* Every live table transition also schedules the reverse Wi-Fi bridge.
         The snapshot signature suppresses duplicates, so callers stay simple
         while short-lived states such as `khlass` cannot disappear before the
         four-second heartbeat sees them. */
      try { setTimeout(publishServiceFloor, 0); } catch (_) {}
      const t = tables[id];
      if (!t) return;
      /* Le plan SPATIAL (celui que tout vrai commerçant obtient dès qu'il a
         dessiné sa salle) rend des `.cplan-tbl`, pas des `.tbl-cell`. Cette
         fonction ne cherchait que la seconde forme : `if (!old) return`
         partait donc en silence, et AUCUN changement d'état ne se repeignait
         jamais chez un vrai client · une table encaissée restait verte jusqu'au
         prochain rechargement complet de la salle. */
      const cell = document.querySelector(`.tbl-cell[data-table="${id}"]`);
      if (cell) {
        cell.outerHTML = tableHTML(id, t);
        lucide.createIcons();
        updateFloorCount(t.floor);
        return;
      }
      const spatial = document.querySelector(`.cplan-tbl[data-table="${id}"]`);
      if (!spatial) return;
      const was = spatial.classList.contains('is-selected');
      /* La démo et le plan réel émettent désormais tous deux des .cplan-tbl
         (renderer noir unifié) · on distingue par le conteneur. */
      if (spatial.closest('.plan-canvas')) {
        spatial.outerHTML = tableHTML(id, t);
        updateFloorCount(t.floor);
      } else {
        const pt = planTableOf(id);
        if (!pt) return;
        spatial.outerHTML = cplanTableHTML(pt);
      }
      if (was) {
        const now = document.querySelector(`.cplan-tbl[data-table="${id}"]`);
        if (now) now.classList.add('is-selected');
      }
    }

    function updateFloorCount(floor) {
      const f = Number(floor);
      const floorIds = Object.keys(tables).filter(id => tables[id].floor === f);
      const occupied = floorIds.filter(id => tables[id].status !== 'khawya').length;
      const countEl = document.querySelector(`.plan-floor-count[data-floor-count="${f}"]`);
      if (countEl) countEl.textContent = `${occupied} / ${floorIds.length} occupées`;
    }
    // Back-compat alias (older code paths may still call updateZoneCount).
    function updateZoneCount(_unused) {
      // The plan no longer has per-zone counters; refresh both floors instead.
      updateFloorCount(0); updateFloorCount(1);
    }

    function markPaid(id) {
      const t = tables[id];
      const visit = phoneSessionOf(id);
      if (visit) {
        // A local receipt is durable even if /api/sale or the close request is
        // still in the offline outbox. Never resurrect this paid visit on reload.
        journal.forEach(entry => {
          if (entry && entry.table === String(id) && entry.session === visit) entry.visitClosed = true;
        });
        try { persistShift(); } catch (_) {}
        kdsOrders.forEach(order => {
          if (order && order.type === 'dineIn' && String(order.table) === String(id)
            && String(order.session || '') === visit) order.paid = true;
        });
      }
      tableSettlement().settle(t);
      tableSettlement().project(t, {}, ['discount']); // clear remise immédiatement à l'encaissement
      /* The final tender ends this bill's split. A stale completed flow must
         never make the next party's fresh order look already paid. The paid
         receipt keeps its own immutable snapshot for an audited reopen. */
      tableSplits.delete(id);
      tableSettlement().project(t, {}, ['reopenedBill']);
      tableSettlement().project(t, {}, ['reopenRef']);
      tableSettlement().project(t, {}, ['reopenSessionId']);
      tableSettlement().project(t, {}, ['orderNo']);
      currentOrder().replaceTable(id, []);
      delete orders[id];
      /* L'addition est réglée : le téléphone posé sur cette table cesse d'être
         un terminal de commande. C'est LE point de passage de tous les
         encaissements · carte, espèces, addition partagée · donc c'est ici et
         nulle part ailleurs qu'on coupe, sinon le partage d'addition aurait
         laissé la session ouverte. L'appel réseau est délégué à
         orderpro-inbox.js par un évènement : une vente ne doit jamais attendre
         le réseau, ni échouer parce qu'il est tombé. */
      releasePhoneTable(id, 'settle', true);
      resetTableTimer(t);
      refreshTableNode(id);
      shift.tablesPaid += 1;
      renderShiftStats();
      try { persistShift(); } catch (_) {}
      // Fade to khawya after 3s
      setTimeout(() => {
        if (tables[id] && tables[id].status === 'khlass') {
          tableSettlement().project(tables[id], { status: 'khawya' });
          delete orders[id]; // clear order
          currentOrder().removeTable(id); // clear cashier-built order
          tableSettlement().project(tables[id], {}, ['discount']); // clear remise · table reset
          tableSettlement().project(tables[id], {}, ['orderNo']); // next party gets its own order number
          refreshTableNode(id);
          try { persistShift(); } catch (_) {}
        }
      }, 3000);
    }

    /* ===========================================================
       New Table · open empty table, take order
       =========================================================== */

    /* ---- helpers ---- */
    function showPayButtons(forOrder) {
      const normal = $('#rp-pay-normal');
      const order  = $('#rp-pay-order');
      normal.hidden = forOrder;
      normal.style.display = forOrder ? 'none' : '';
      order.hidden  = !forOrder;
      order.style.display = forOrder ? 'flex' : 'none';
      // Order-builder mode has its own "Envoyer en cuisine" · hide the À emporter one
      if (forOrder) {
        const sk = $('#rp-send-kitchen'); if (sk) sk.hidden = true;
      }
      /* « Ajouter des articles » n'appartient qu'à l'addition d'une mesa en
         salle. On l'éteint ICI, au point de passage commun, et renderRightPanel
         le rallume pour le seul cas qui le mérite : sinon il survivrait au
         passage en « À emporter » (qui partage ce bloc de boutons) et
         rouvrirait la commande d'une table qu'on ne regarde plus. */
      const ai = $('#rp-add-items'); if (ai) ai.hidden = true;
    }

    /* ---- covers modal ---- */
    function openNewTableModal(tableId) {
      newTableId = tableId;
      newTableCovers = Math.max(2, tables[tableId]?.covers || 2);
      $('#nt-table-id').textContent = tableId;
      renderNewTableChips();
      $('#new-table-modal').classList.add('is-open');
      lucide.createIcons();
    }

    function renderNewTableChips() {
      $('#nt-covers-chips').innerHTML = [1,2,3,4,5,6,7,8].map(n =>
        `<button class="nt-chip ${n === newTableCovers ? 'is-active' : ''}" data-nt-covers="${n}">${n}</button>`
      ).join('');
    }

    function confirmNewTable() {
      if (!newTableId) return;
      $('#new-table-modal').classList.remove('is-open');
      const t = tables[newTableId];
      tableSettlement().project(t, { covers: newTableCovers });
      t.size    = newTableCovers >= 5 ? 6 : (newTableCovers <= 2 ? 2 : 4);
      tableSettlement().project(t, { status: 'ka-yaklo' });
      resetTableTimer(t);
      tableSettlement().project(t, {}, ['discount']); // Toute nouvelle table démarre sans remise
      /* A former party's split can survive an older till snapshot. Starting a
         genuinely new table invalidates it even if the old close was missed. */
      tableSplits.delete(newTableId);
      delete tableClosedAt[tableKey(newTableId)]; // Nouvelle table légitime · lever le filtre de fermeture
      currentOrder().replaceTable(newTableId, []);
      serviceFloorLocalVersion[newTableId] = Date.now();
      serviceFloorRemoteVersion[newTableId] = Math.max(serviceFloorRemoteVersion[newTableId] || 0, Date.now());
      refreshTableNode(newTableId);
      selectedId = newTableId;
      newTableId = null;
      setMode('order');
    }

    function openWaitlistModal() {
      wlDraft = { name: '', size: 2, pref: 'peu-importe' };
      $('#wl-name').value = '';
      renderWaitlistChips();
      $('#waitlist-modal').classList.add('is-open');
      setTimeout(() => $('#wl-name').focus(), 60);
      lucide.createIcons();
    }

    function renderWaitlistChips() {
      $('#wl-size-chips').innerHTML = [1,2,3,4,5,6,7,8].map(n =>
        `<button class="nt-chip ${n === wlDraft.size ? 'is-active' : ''}" data-wl-size="${n}">${n}</button>`
      ).join('');
      $('#wl-pref-chips').innerHTML = Object.entries(WL_PREFS).map(([key, p]) =>
        `<button class="wl-pref-chip ${key === wlDraft.pref ? 'is-active' : ''}" data-wl-pref="${key}"><i data-lucide="${p.icon}"></i>${p.label}</button>`
      ).join('');
      lucide.createIcons();
    }

    function confirmWaitlistAdd() {
      const name = ($('#wl-name').value || '').trim();
      if (!name) { $('#wl-name').focus(); toast('Ajoute un nom'); return; }
      waitlist.push({ id: ++wlSeq, name, size: wlDraft.size, pref: wlDraft.pref, addedAt: Date.now() });
      $('#waitlist-modal').classList.remove('is-open');
      renderWaitlist();
      toast(`${name} ajouté·e à la file`);
    }

    function wlWaitMins(entry) {
      return Math.max(0, Math.round((Date.now() - entry.addedAt) / 60000));
    }

    function renderWaitlist() {
      const list = $('#waitlist-list');
      if (!list) return;
      if (!waitlist.length) {
        list.innerHTML = `<div class="wl-empty">
          <i data-lucide="users"></i>
          <div class="wl-empty-title">Personne en attente</div>
          <div class="wl-empty-sub">Clique « Ajouter à la file » quand un client se présente sans réservation.</div>
        </div>`;
        lucide.createIcons();
        return;
      }
      list.innerHTML = waitlist.map((e, i) => {
        const pref = WL_PREFS[e.pref] || WL_PREFS['peu-importe'];
        const mins = wlWaitMins(e);
        const wait = mins === 0 ? "à l'instant" : `${mins} min`;
        return `<div class="wl-card" data-wl-id="${e.id}">
          <div class="wl-pos">${i + 1}</div>
          <div class="wl-main">
            <div class="wl-name">${kdsEsc(e.name)}</div>
            <div class="wl-meta">
              <span class="wl-size"><i data-lucide="users"></i>${e.size} pers.</span>
              <span class="wl-pref"><i data-lucide="${pref.icon}"></i>${pref.label}</span>
              <span class="wl-wait">${wait}</span>
            </div>
          </div>
          <div class="wl-acts">
            <button class="wl-act seat" data-wl-seat="${e.id}"><i data-lucide="door-open"></i>Attabler</button>
            <button class="wl-act remove" data-wl-remove="${e.id}"><i data-lucide="x"></i>Retirer</button>
          </div>
        </div>`;
      }).join('');
      lucide.createIcons();
    }

    /* "Attabler" · open the Plan de salle and let the hostess tap a free table. */
    function startSeating(id) {
      const e = waitlist.find(w => w.id === id);
      if (!e) return;
      wlSeating = e;
      const pref = WL_PREFS[e.pref] || WL_PREFS['peu-importe'];
      const bn = $('#wl-seat-banner-text');
      if (bn) bn.innerHTML = `<i data-lucide="armchair"></i><span>Installer <strong>${kdsEsc(e.name)}</strong> <em>· ${e.size} pers. · ${pref.label} · touche une table libre</em></span>`;
      document.body.classList.add('is-seating');
      setMode('salle');
      markSeatTables();
      lucide.createIcons();
    }

    /* Flag free tables (selectable) vs occupied (dimmed) for the seating overlay. */
    function markSeatTables() {
      $$(TBL_SEL).forEach(c => {
        const t = tables[c.dataset.table];
        const free = !!(t && t.status === 'khawya');
        c.classList.toggle('wl-seat-free', free);
        c.classList.toggle('wl-seat-dim', !free);
      });
    }

    function endSeating(backToList) {
      wlSeating = null;
      document.body.classList.remove('is-seating');
      $$(TBL_SEL).forEach(c => c.classList.remove('wl-seat-free', 'wl-seat-dim'));
      if (backToList) { setMode('waitlist'); renderWaitlist(); }
    }

    function seatPartyAt(tableId) {
      if (!wlSeating) return;
      const e = wlSeating;
      const idx = waitlist.findIndex(w => w.id === e.id);
      const t = tables[tableId];
      if (t && t.status === 'khawya') {  // occupy the chosen table on the floor
        tableSettlement().project(t, { status: 'a-commander' });    // seated · server still needs to take the order
        tableSettlement().project(t, { covers: e.size });
        resetTableTimer(t);
        delete orders[tableId];       // drop any cached/fabricated order
        currentOrder().replaceTable(tableId, []);    // fresh table, ready to take their order
        refreshTableNode(tableId);
      }
      if (idx >= 0) waitlist.splice(idx, 1);
      endSeating(true);
      toast(`${e.name} · installé·e à ${tableId}`);
      /* This used to stop at the cashier's toast. Publish the seating fact to
         the one waiter assigned to this table by the owner's floor plan. The
         event is best-effort: seating never waits for the network. */
      try {
        const assigned = t && t.server && servers[t.server];
        // Caisse réappairée en plein service : pas d'événement chez l'autre commerce.
        const merchant = window.KiwiTillTenant?.mismatch() ? '' : currentMerchantSlug();
        if (t && merchant) {
          fetch('/api/service/events', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant, event: {
              type: 'table-seated', table: tableId, serverId: (t && t.server) || '',
              server: (assigned && assigned.name) || '', customer: e.name, covers: e.size,
            } }),
          }).catch(() => {});
        }
      } catch (_) {}
    }

    function removeWaitlist(id) {
      const idx = waitlist.findIndex(e => e.id === id);
      if (idx < 0) return;
      const name = waitlist[idx].name;
      waitlist.splice(idx, 1);
      renderWaitlist();
      toast(`${name} retiré·e de la file`);
    }

    function caisseTableKitchenLocked(id) {
      return (tableOrders[id] || []).some(line => line.sent && !line.orderProPending);
    }

    function caisseMobilityIntent(handler, from, to) {
      const merchant = currentMerchantSlug();
      const saved = handler.pendingIntent;
      // Keep the same operation after an ambiguous network response.
      if (saved && saved.merchant === merchant && saved.from === from && saved.to === to) return saved;
      let seat = phoneSeats.get(tableKey(from));
      if (!seat || !Number.isFinite(seat.revision)) {
        // Empty visits are movable too. Recover the existing canonical visit
        // from the inbox snapshot if its local badge has not been installed.
        const sessions = window.KiwiOrderInbox?.sessions?.();
        const visit = Array.isArray(sessions) && sessions.find(s => s.mode === 'table'
          && caisseTableId(s.table) === from && (!seat?.session || String(s.id) === String(seat.session)));
        if (visit && Number.isFinite(Number(visit.seen_ts))) {
          seat = { session: visit.id, since: visit.opened_ts, revision: Number(visit.seen_ts) };
        }
      }
      const intent = {
        merchant, from, to, operationId: crypto.randomUUID(),
        since: seat?.since || Date.now(), destinationClosedAt: Number(tableClosedAt[tableKey(to)] || 0),
      };
      /* A caisse-created visit can be fully valid on D1 before the inbox poll
         has installed its local badge. In that case the server resolves the
         current open visit atomically; missing local cache is not a reason to
         turn Déplacer/Fusionner into dead controls. */
      if (seat && seat.session && Number.isFinite(seat.revision)) {
        intent.expectedSession = String(seat.session);
        intent.expectedRevision = seat.revision;
      }
      return (handler.pendingIntent = intent);
    }

    function applyCaisseMovedVisit(from, to, data, intent, merge) {
      if (!data || !intent) return;
      const session = String((merge ? data.targetSessionId : (data.movedSession || data.sessionId)) || '');
      if (!session) return;
      const fromKey = tableKey(from), toKey = tableKey(to);
      const targetSeat = phoneSeats.get(toKey);
      phoneSeats.delete(fromKey);
      phoneSeats.set(toKey, {
        session, since: merge && targetSeat?.session === session ? targetSeat.since : intent.since,
        // Merge does not return a revision; wait for the canonical poll before another move.
        revision: Number.isFinite(data.revision) ? data.revision : undefined,
      });
      phoneMovedVisits.set(session, { to: toKey, from: fromKey,
        closedAt: intent.destinationClosedAt, revision: Number(data.revision || data.now) || 0 });
      const pending = phonePending.get(fromKey) || 0;
      phonePending.delete(fromKey);
      phonePending.set(toKey, pending + (merge ? (phonePending.get(toKey) || 0) : 0));
      (tableOrders[to] || []).forEach(line => {
        if (line.orderProLine) currentOrder().patchLine(line, { ["orderSession"]: session });
      });
      // Acknowledged movement changes location/visit, never acceptance or payment.
      try {
        const inbox = window.KiwiOrderInbox?.orders?.() || {};
        Object.values(inbox).forEach(order => {
          if (order.mode === 'table' && tableKey(caisseTableId(order.table) || order.table) === fromKey && !order.paid && order.status !== 'rejected') {
            order.table = to; order.session = session;
          }
        });
      } catch (_) {}
      if (tables[to]) tableSettlement().project(tables[to], { timerSession: session });
    }

    function openCaisseTransferModal(tableId) {
      if (!hasTables() || isFeatureOff('tableTransfer') || isFeatureOff('table-transfer')) {
        toast('Déplacement de table non disponible');
        return;
      }
      ctrfFromId = tableId;
      ctrfSelectedToId = null;
      $('#ctrf-from-id').textContent = tableId;
      const btnText = $('#ctrf-btn-text');
      if (btnText) btnText.textContent = 'Déplacer';
      const confirmBtn = $('#ctrf-confirm');
      if (confirmBtn) confirmBtn.disabled = true;
      renderCaisseTransferGrid();
      $('#caisse-transfer-modal').classList.add('is-open');
      lucide.createIcons();
    }

    function renderCaisseTransferGrid() {
      const grid = $('#ctrf-target-grid');
      if (!grid) return;
      const freeTables = Object.keys(tables).filter(id => id !== ctrfFromId && tables[id] && tables[id].status === 'khawya');
      if (!freeTables.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:var(--ink-3);font-size:13px;">Aucune table libre disponible actuellement.</div>';
        return;
      }
      grid.innerHTML = freeTables.map(id => {
        const t = tables[id];
        const isSel = id === ctrfSelectedToId;
        return `
          <div class="trf-target-card ${isSel ? 'is-selected' : ''}" data-ctrf-to="${id}">
            <div class="trf-tname">${id}</div>
            <div class="trf-tmeta">${t.covers || 2} pl. · Libre</div>
          </div>
        `;
      }).join('');
    }

    async function confirmCaisseTransfer() {
      if (!ctrfFromId || !ctrfSelectedToId) return;
      if (window.KiwiTillTenant?.mismatch()) return;
      const from = ctrfFromId;
      const to = ctrfSelectedToId;
      const confirmBtn = $('#ctrf-confirm');
      if (confirmBtn) confirmBtn.disabled = true;

      const fromT = tables[from];
      const toT = tables[to];
      if (!fromT || !toT) return;

      let transferData = null;
      let transferIntent = null;
      if (!IS_DEMO) {
        try {
          transferIntent = caisseMobilityIntent(confirmCaisseTransfer, from, to);
          const res = await fetch('/api/order/queue', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merchant: currentMerchantSlug(),
              transferTable: { from, to, covers: fromT.covers, server: fromT.server || 'Caisse',
                operationId: transferIntent.operationId, expectedSession: transferIntent.expectedSession,
                expectedRevision: transferIntent.expectedRevision }
            })
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data || !data.ok) {
            if (res.status >= 400 && res.status < 500) delete confirmCaisseTransfer.pendingIntent;
            throw new Error((data && data.error) || 'transfer-failed');
          }
          transferData = data;
        } catch (err) {
          if (confirmBtn) confirmBtn.disabled = false;
          toast(`Déplacement impossible : ${err.message === 'source-session-required' || err.message === 'stale-table-visit'
            ? 'visite à actualiser · synchronisez puis réessayez' : (err.message || 'erreur réseau')}`);
          return;
        }
      }

      // Local state migration
      if ((tableOrders[from] || orders[from] || []).length) startTableTimer(from);
      tableSettlement().transfer(from, to, { id: transferIntent?.operationId || ('local-transfer:' + from + ':' + to + ':' + (fromT.timerSession || fromT.orderStartedAt || Date.now())) });
      if (Array.isArray(orders[from]) && orders[from].length) orders[to] = orders[from];
      else delete orders[to];
      applyCaisseMovedVisit(from, to, transferData, transferIntent, false);
      delete confirmCaisseTransfer.pendingIntent;
      if (typeof tableSplits !== 'undefined' && tableSplits.has(from)) {
        tableSplits.set(to, tableSplits.get(from));
        tableSplits.delete(from);
      }
      kdsOrders.forEach(order => {
        if (order && order.type === 'dineIn' && String(order.table) === String(from) && !order.paid) order.table = to;
      });

      delete orders[from];

      try { persistShift(); publishServiceFloor(); } catch (_) {}

      refreshTableNode(from);
      refreshTableNode(to);

      $('#caisse-transfer-modal').classList.remove('is-open');
      selectedId = to;
      openTable(to);
      // Annonce ce que le serveur a VRAIMENT déplacé : un transfert qui
      // laisse des lignes réglées derrière lui n'est pas un échec, mais
      // l'annoncer « déplacée » sans compter mentirait autant que l'ancien
      // silence sur les lignes non déplacées.
      {
        const moved = transferData && Number.isFinite(+transferData.ordersMoved) ? +transferData.ordersMoved : null;
        const left = transferData && Number.isFinite(+transferData.paidLeftBehind) ? +transferData.paidLeftBehind : 0;
        let msg = `Table ${from} déplacée vers Table ${to}`;
        if (moved !== null) msg += ` · ${moved} ligne${moved > 1 ? 's' : ''}`;
        if (left > 0) msg += ` · ${left} réglée${left > 1 ? 's' : ''} reste${left > 1 ? 'nt' : ''} sur ${from}`;
        toast(msg);
      }
    }

    function openCaisseMergeModal(tableId) {
      if (!hasTables() || isFeatureOff('tableMerge') || isFeatureOff('table-merge')) {
        toast('Fusion de tables non disponible');
        return;
      }
      cmrgSourceId = tableId;
      cmrgSelectedTargetId = null;
      $('#cmrg-source-id').textContent = tableId;
      const btnText = $('#cmrg-btn-text');
      if (btnText) btnText.textContent = 'Fusionner';
      const confirmBtn = $('#cmrg-confirm');
      if (confirmBtn) confirmBtn.disabled = true;
      renderCaisseMergeGrid();
      $('#caisse-merge-modal').classList.add('is-open');
      lucide.createIcons();
    }

    function renderCaisseMergeGrid() {
      const grid = $('#cmrg-target-grid');
      if (!grid) return;
      const otherTables = Object.keys(tables).filter(id => id !== cmrgSourceId && tables[id] && tables[id].status !== 'khawya' && tables[id].status !== 'khlass');
      if (!otherTables.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:var(--ink-3);font-size:13px;">Aucune autre table active à fusionner.</div>';
        return;
      }
      grid.innerHTML = otherTables.map(id => {
        const t = tables[id];
        const isSel = id === cmrgSelectedTargetId;
        return `
          <div class="trf-target-card ${isSel ? 'is-selected' : ''}" data-cmrg-target="${id}">
            <div class="trf-tname">${id}</div>
            <div class="trf-tmeta">${t.covers || 2} cvts · ${statusLabel[t.status] || t.status}</div>
          </div>
        `;
      }).join('');
    }

    async function confirmCaisseMerge() {
      if (!cmrgSourceId || !cmrgSelectedTargetId) return;
      if (window.KiwiTillTenant?.mismatch()) return;
      const source = cmrgSourceId;
      const target = cmrgSelectedTargetId;
      const confirmBtn = $('#cmrg-confirm');
      if (confirmBtn) confirmBtn.disabled = true;

      const sourceT = tables[source];
      const targetT = tables[target];
      if (!sourceT || !targetT) return;
      /* A split that already took a part lives only in tableSplits, and the
         merge below clears both entries: the merged bill would then ask for the
         whole amount again, parts already paid included. Refuse until the split
         is settled rather than lose the record of what was paid. */
      if ([source, target].some((id) => { const sp = liveTableSplit(id); return sp && splitPaidCount(sp) > 0; })) {
        if (confirmBtn) confirmBtn.disabled = false;
        toast('Un split déjà encaissé est en cours : terminez-le avant de fusionner');
        return;
      }

      let mergeData = null;
      let mergeIntent = null;
      if (!IS_DEMO) {
        try {
          mergeIntent = caisseMobilityIntent(confirmCaisseMerge, source, target);
          const res = await fetch('/api/order/queue', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merchant: currentMerchantSlug(),
              mergeTables: { targetTable: target, sourceTable: source, server: targetT.server || 'Caisse',
                operationId: mergeIntent.operationId, expectedSession: mergeIntent.expectedSession,
                expectedRevision: mergeIntent.expectedRevision }
            })
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data || !data.ok) {
            if (res.status >= 400 && res.status < 500) delete confirmCaisseMerge.pendingIntent;
            throw new Error((data && data.error) || 'merge-failed');
          }
          mergeData = data;
        } catch (err) {
          if (confirmBtn) confirmBtn.disabled = false;
          toast(`Fusion impossible : ${err.message === 'source-session-required' || err.message === 'stale-table-visit'
            ? 'visite à actualiser · synchronisez puis réessayez' : (err.message || 'erreur réseau')}`);
          return;
        }
      }

      // Merge order lines
      const sourceLines = tableOrders[source] || [];
      const targetLines = tableOrders[target] || [];
      const timerAnchors = [];
      if (sourceLines.length || (orders[source] || []).length) timerAnchors.push(startTableTimer(source));
      if (targetLines.length || (orders[target] || []).length) timerAnchors.push(startTableTimer(target));
      if (timerAnchors.length) {
        tableSettlement().project(targetT, { orderStartedAt: Math.min(...timerAnchors) });
        tableSettlement().project(targetT, {}, ['timerSession']);
        startTableTimer(target);
      }
      tableSettlement().merge(source, target, { id: mergeIntent?.operationId || ('local-merge:' + source + ':' + target + ':' + (sourceT.timerSession || sourceT.orderStartedAt || Date.now())) });
      // Cached rendered bills must include both sides, or yield to the live lines.
      if ((orders[source] || []).length || (orders[target] || []).length) {
        orders[target] = [
          ...((orders[target] || []).length ? orders[target] : targetLines.map(l => ({ ...l, total: l.price * l.qty }))),
          ...((orders[source] || []).length ? orders[source] : sourceLines.map(l => ({ ...l, total: l.price * l.qty }))),
        ];
      } else delete orders[target];
      applyCaisseMovedVisit(source, target, mergeData, mergeIntent, true);
      delete confirmCaisseMerge.pendingIntent;
      if (typeof tableSplits !== 'undefined') {
        tableSplits.delete(source);
        tableSplits.delete(target);
      }
      kdsOrders.forEach(order => {
        if (order && order.type === 'dineIn' && String(order.table) === String(source) && !order.paid) order.table = target;
      });

      delete orders[source];

      try { persistShift(); publishServiceFloor(); } catch (_) {}

      refreshTableNode(source);
      refreshTableNode(target);

      $('#caisse-merge-modal').classList.remove('is-open');
      selectedId = target;
      openTable(target);
      {
        const moved = mergeData && Number.isFinite(+mergeData.ordersMerged) ? +mergeData.ordersMerged : null;
        const left = mergeData && Number.isFinite(+mergeData.paidLeftBehind) ? +mergeData.paidLeftBehind : 0;
        let msg = `Table ${source} fusionnée dans Table ${target}`;
        if (moved !== null) msg += ` · ${moved} ligne${moved > 1 ? 's' : ''}`;
        if (left > 0) msg += ` · ${left} réglée${left > 1 ? 's' : ''} reste${left > 1 ? 'nt' : ''} sur ${source}`;
        toast(msg);
      }
    }

    /* Never leave an item correction locked behind a stalled network. A timed
       out write may still have committed, so the line keeps one stable request
       id and the next tap verifies/replays that same operation. */
    async function postCaisseCancellation(body) {
      if (window.KiwiTillTenant?.mismatch()) throw new Error('caisse appairée à un autre commerce · réappairez-la avant d\u2019annuler');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch('/api/order/queue', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error(data?.error || `serveur ${res.status}`);
        return data;
      } catch (err) {
        if (controller.signal.aborted) throw new Error('délai dépassé · vérifiez la commande après synchronisation avant de réessayer');
        throw err;
      } finally { clearTimeout(timer); }
    }

    /* One tap on a sent line removes one unit from the unpaid bill and records
       an approved kitchen void. The paired till is the authorization: unlike
       a whole-table cancellation, this frequent correction has no PIN or
       reason dialog. The amount changes only after the server confirms it. */
    /* UN PLAT ANNULÉ APRÈS SON ENVOI. L'écran cuisine reçoit l'annulation ;
       une cuisine qui travaille au papier n'a que le bon déjà imprimé, et
       continue de préparer le plat. Le chemin de l'envoi (file durable, un
       bon par station) imprime donc « ANNULÉ » sur la même imprimante que le
       plat, dédupliqué par l'identifiant de l'annulation : une réponse perdue
       puis rejouée n'imprime pas deux bons. Une formule part avec ses choix,
       pour une unité, comme le geste qui l'annule. */
    function printKitchenVoid(tableId, line, requestId, scope, qtyBefore) {
      try {
        if (!line || line.kind === 'formula-part' || !requestId) return;
        const all = scope && scope.cart ? cart : (tableOrders[tableId] || []);
        const per = Math.max(1, Number(qtyBefore) || 1);
        const parts = line.kind === 'formula' && line.formulaUid
          ? all.filter(l => l && l.kind === 'formula-part' && l.formulaUid === line.formulaUid)
          : [];
        const unit = [Object.assign({}, line, { qty: 1 })].concat(parts.map(p =>
          Object.assign({}, p, { qty: Math.max(1, Math.round((Number(p.qty) || 1) / per)) })));
        return printKitchenTickets({ table: tableId || '', sentAt: new Date() }, kitchenItemsFromLines(unit),
          { sourceId: 'void-' + requestId, voided: true });
      } catch (_) {}
    }

    async function cancelCaisseLineImmediately(tableId, line, scope) {
      if (!line || line.voidBusy) return;
      scope = scope || { tableId };
      const qtyBefore = Number(line.qty) || 1;
      const slug = currentMerchantSlug();
      if (storeIsReal() && !slug) {
        toast('Annulation impossible · caisse non appairée, article conservé');
        return;
      }
      currentOrder().patchLine(line, { ["voidBusy"]: true });
      toast(`Annulation de ${line.name}…`);

      if (slug) {
        try {
          // Keep the operation identity across a lost response / retry.
          currentOrder().patchLine(line, { ["cancelRequestId"]: line.cancelRequestId || ('voi-' + crypto.randomUUID()) });
          const owner = tableId && canonicalOrdersForTable(tableId).find(entry =>
            (entry.order.relayLines || []).some(item => item.uid === line.uid));
          const data = await postCaisseCancellation({
              merchant: slug,
              voidLine: {
                /* Une commande à emporter n'a pas de table : elle se désigne
                 * par son identifiant de file, que `voidLine` accepte déjà
                 * (functions/api/order/queue.js · `if (b.voidLine.orderId)`). */
                ...(scope.orderId || line.canonicalOrderId || owner?.id ? { orderId: scope.orderId || line.canonicalOrderId || owner.id } : {}),
                ...(tableId ? { table: tableId } : {}),
                immediate: true,
                requestId: line.cancelRequestId,
                lineId: line.canonicalUid || line.uid || line.id,
                itemId: line.id || '',
                qty: 1,
                reason: 'item_cancelled',
                isWaste: 0,
                actor: 'Caisse'
              }
          });
          if (data && data.alertSent) {
            currentOrder().patchLine(line, { ["voidPending"]: true });
            toast(`Annulation demandée · attente de la cuisine · ${line.name}`);
            if (tableId) renderRightPanel(tableId);
            return;
          }
          // A poll may already have applied this revision while the request
          // was in flight. Set server quantities, never subtract twice.
          if (!Array.isArray(data.remainingLines)) throw new Error('réponse incomplète · synchronisez la commande');
          const reconcile = (list) => (list || []).filter(item => {
            const owned = item === line || item.uid === line.uid
              || (line.formulaUid && item.formulaUid === line.formulaUid);
            if (!owned) return true;
            const remote = data.remainingLines.find(row => String(row.uid || row.id) === String(item.canonicalUid || item.uid))
              || (!item.canonicalUid && data.remainingLines.find(row => !row.uid && row.id === item.id));
            if (!remote) return false;
            currentOrder().patchLine(item, { qty: Number(remote.qty), voidPending: !!remote.voidAlert }, ['cancelRequestId']);
            return item.qty > 0;
          });
          const voidRequestId = line.cancelRequestId;
          printKitchenVoid(tableId, line, voidRequestId, scope, qtyBefore);
          if (scope.cart) currentOrder().replaceCart(reconcile(cart));
          else currentOrder().replaceTable(tableId, reconcile(tableOrders[tableId]));
          try { persistShift(); } catch (_) {}
          currentOrder().patchLine(line, {}, ["cancelRequestId"]);
          toast(`${line.name} annulé en cuisine`);
          return;
        } catch (err) {
          toast(`Article conservé · ${err.message || 'annulation non transmise'} · touchez − pour réessayer`);
          return;
        } finally {
          currentOrder().patchLine(line, { ["voidBusy"]: false });
          renderMenu();
          if (tableId) {
            if (mode === 'order') renderOrderPanel(tableId);
            else renderRightPanel(tableId);
          } else renderCart();
        }
      }

      /* Local demo: there is no kitchen server to notify. A paper kitchen
         still gets its slip. */
      printKitchenVoid(tableId, line, 'demo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8), scope, qtyBefore);
      if (scope.cart) {
        currentOrder().replaceCart(applyGroupedLineQtyDelta(cart, line, -1));
      } else {
        currentOrder().replaceTable(tableId, applyGroupedLineQtyDelta(tableOrders[tableId] || [], line, -1));
      }
      currentOrder().patchLine(line, { ["voidBusy"]: false });
      renderMenu();
      if (tableId) {
        try { persistShift(); } catch (_) {}
        if (mode === 'order') renderOrderPanel(tableId);
        else renderRightPanel(tableId);
      } else renderCart();
    }

    /* ---- table order management ---- */
    function pushTableOrderLine(tableId, item, opts) {
      nativeHapticLight();
      if (!tableOrders[tableId]) currentOrder().replaceTable(tableId, []);
      // First item taken → order started, table is now being served (eating)
      if (tables[tableId] && tables[tableId].status === 'a-commander') {
        tableSettlement().project(tables[tableId], { status: 'ka-yaklo' });
        refreshTableNode(tableId);
      }
      const sig = optSig(opts);
      const extra = (opts || []).reduce((s, x) => s + (+x.p || 0), 0);
      /* Stack onto the un-noted line ; a noted line splits off so it keeps its
         note. Et JAMAIS sur une ligne déjà partie en cuisine (`l.sent`) : la
         cuisine n'envoie que ce qui ne l'est pas encore, donc empiler un
         deuxième café sur la ligne du premier aurait fait monter l'addition
         sans qu'aucun bon ne parte. Le plat aurait été facturé et jamais
         préparé · la panne la plus coûteuse qu'un ajout puisse produire.
         Deux choix différents restent également deux lignes : salade + harissa
         ne doit jamais se confondre avec sans salade + sauce blanche. */
      const priced = promoPrice(item, item.price + extra);
      const line = tableOrders[tableId].find(l => l.id === item.id && !l.sent
        && !l.hold && !l.committed
        && !(l.note || '').trim() && (l.optSig || '') === sig && promoKey(l.promo) === promoKey(priced.promo));
      if (line) currentOrder().patchLine(line, { qty: +line.qty + 1 });
      else currentOrder().append(tableOrders[tableId], Object.assign({ uid: newLineUid(), id: item.id, name: item.name,
        price: priced.price, qty: 1, note: '', opts: (opts || []).slice(), optSig: sig },
        priced.promo ? { promo: priced.promo } : null));
      startTableTimer(tableId);
      // Pop animation on card
      const card = document.querySelector(`.menu-item[data-menu-id="${item.id}"]`);
      if (card) { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
      renderMenu();
      renderOrderPanel(tableId);
    }

    function addToTableOrder(tableId, itemId) {
      const item = standaloneMenuItem(itemId);
      if (!item) return;
      const groups = itemOptGroups(item);
      if (item.formula && Array.isArray(item.formula.slots) && item.formula.slots.length) {
        openCaisseFormula(item, (parent, parts) => { currentOrder().append((currentOrder().replaceTable(tableId, tableOrders[tableId] || [])), parent, ...parts); startTableTimer(tableId); nativeHapticLight(); renderMenu(); renderOrderPanel(tableId); });
        return;
      }
      if (groups.length) {
        openOptSheet(item, groups, (_item, chosen) => pushTableOrderLine(tableId, item, chosen));
        return;
      }
      pushTableOrderLine(tableId, item, []);
    }

    /* Order panel +/- · targets one specific line by its uid. */
    function changeTableOrderLineQty(tableId, uid, delta) {
      if (!tableOrders[tableId]) return;
      const line = tableOrders[tableId].find(l => l.uid === uid);
      if (!line) return;
      /* Déjà transmis : le − retire immédiatement une unité et prévient la cuisine. */
      if (line.sent) {
        if (delta < 0) cancelCaisseLineImmediately(tableId, line);
        return;
      }
      currentOrder().replaceTable(tableId, applyGroupedLineQtyDelta(tableOrders[tableId], line, delta));
      renderMenu();
      renderOrderPanel(tableId);
    }

    /* Menu-card − in order mode · removes one unit (plain line, else the last).
       On ne retire que parmi les lignes ENCORE RETIRABLES : le − de la carte
       s'appliquait à la première ligne trouvée, donc sur une mesa rouverte il
       tombait sur le plat déjà en cuisine et refusait, alors que le serveur
       venait juste d'en ajouter un qu'il pouvait parfaitement reprendre. */
    function tableOrderMinusMenu(tableId, itemId) {
      const lines = (tableOrders[tableId] || []).filter(l => l.id === itemId && !l.sent);
      const line = lines.find(l => !(l.note || '').trim()) || lines[lines.length - 1];
      if (line) { changeTableOrderLineQty(tableId, line.uid, -1); return; }
      if ((tableOrders[tableId] || []).some(l => l.id === itemId)) {
        toast('Déjà en cuisine · ça s\'annule à la cuisine');
      }
    }

    /* ---- order panel (right panel while building an order) ---- */
    function renderOrderPanel(tableId) {
      if (!tableId) return;
      if (document.documentElement.classList.contains('kiwi-native')) { try { persistShift(); } catch (_) {} }
      const t = tables[tableId];
      const order = tableOrders[tableId] || [];
      const total = order.reduce((s, l) => s + l.price * l.qty, 0);
      const itemCount = order.reduce((s, l) => s + l.qty, 0);

      $('#rp-empty').hidden = true;
      $('#rp-empty').style.display = 'none';
      const active = $('#rp-active');
      active.hidden = false;
      active.style.display = 'flex';

      // Show server row in order mode too
      const sr = $('#rp-server-row');
      if (sr && t.server && servers[t.server]) {
        const s = servers[t.server];
        $('#rp-server-avatar').textContent = serverInitials(s);
        $('#rp-server-avatar').style.background = s.color;
        $('#rp-server-name').textContent = s.name + (s.status === 'pause' ? ' · en pause' : '');
        sr.hidden = false;
      } else if (sr) {
        sr.hidden = true;
      }
      const sc = $('#rp-split-card'); if (sc) sc.hidden = true;
      const tt = $('#rp-table-tools'); if (tt) tt.hidden = true;

      $('#rp-table').textContent = `${tableId} · ${t.covers} couvert${t.covers > 1 ? 's' : ''}`;
      /* Ce qui est DÉJÀ parti, et ce qui reste à envoyer. La distinction est le
         cœur d'un ajout : le serveur rouvre une mesa avec quatre plats en
         cuisine et doit voir, sans compter, que seuls les deux derniers
         partiront au prochain appui. */
      const heldQty = order.filter(l => l.kind !== 'formula-part' && lineHeld(l, order)).reduce((s, l) => s + l.qty, 0);
      const fresh = order.filter(l => !l.sent && !lineHeld(l, order)).reduce((s, l) => s + l.qty, 0);
      const sentQty = order.filter(l => l.sent).reduce((s, l) => s + l.qty, 0);
      const heldTxt = heldQty > 0 ? ` · ${heldQty} à suivre` : '';
      const orderProPendingQty = order.filter(l => l.orderProPending).reduce((s, l) => s + l.qty, 0);
      const sub = $('#rp-substatus');
      sub.dataset.flag = 'ka-yaklo';
      sub.textContent = order.length === 0
        ? 'Nouvelle table, en attente de commande'
        : orderProPendingQty > 0
          ? `${orderProPendingQty} OrderPro à accepter · ${fmtMAD(total)}`
        : sentQty > 0
          ? `${sentQty} en cuisine · ${fresh} à envoyer${heldTxt} · ${fmtMAD(total)}`
          : `${itemCount} article${itemCount > 1 ? 's' : ''}${heldTxt} · ${fmtMAD(total)}`;

      if (order.length === 0) {
        try { window.KiwiPairs && KiwiPairs.reset('table:' + tableId); } catch (_) {}
        $('#rp-items').innerHTML = `
          <div class="rp-order-empty">
            <i data-lucide="shopping-cart" style="width:34px;height:34px;color:var(--ink-3);display:block;margin:0 auto 10px;"></i>
            <p>Sélectionnez des articles dans le menu à gauche</p>
          </div>`;
      } else {
        $('#rp-items').innerHTML = order.map(l => l.sent ? `
          <div class="rp-item rp-item--cart rp-item--sent" data-order-uid="${l.uid}">
            ${l.kind === 'formula-part' ? `<span class="rp-sent-qty">${l.qty}×</span>` : `<div class="qty-control">
              <button type="button" class="qty-btn" data-cart-action="dec" aria-label="Annuler un ${kdsEsc(l.name)} envoyé en cuisine">−</button>
              <span class="qty-num mono">${l.qty}</span>
            </div>`}
            <span class="rp-item-name">${lineName(l)}${(l.opts && l.opts.length) ? `<i class="rp-item-opts">${kdsEsc(optText(l.opts))}</i>` : ''}${promoTag(l)}</span>
            <span class="rp-item-price mono">${fmtMAD(l.price * l.qty)}</span>
            <span class="rp-sent-mark">${KDS_SVG.check}${l.orderProPending ? 'OrderPro · à accepter' : 'En cuisine'}</span>
            ${(l.note || '').trim() ? `<span class="rp-item-noteline">Note cuisine · ${kdsEsc(l.note)}</span>` : ''}
          </div>` : `
          <div class="rp-item rp-item--cart" data-order-uid="${l.uid}">
            ${l.kind === 'formula-part' ? `<span class="rp-sent-qty">${l.qty}×</span>` : `<div class="qty-control">
              <button class="qty-btn" data-cart-action="dec" aria-label="Moins">−</button>
              <span class="qty-num mono">${l.qty}</span>
              <button class="qty-btn" data-cart-action="inc" aria-label="Plus">+</button>
            </div>`}
            <span class="rp-item-name">${lineName(l)}${(l.opts && l.opts.length) ? `<i class="rp-item-opts">${kdsEsc(optText(l.opts))}</i>` : ''}${promoTag(l)}</span>
            <span class="rp-item-price mono">${fmtMAD(l.price * l.qty)}</span>
            <div class="rp-item-noterow">
              <input class="rp-item-note${(l.note || '').trim() ? ' has-note' : ''}" data-note-uid="${l.uid}"
                value="${kdsEsc(l.note || '')}" placeholder="Note cuisine, ex. bien chaud, sans oignon"
                aria-label="Note cuisine, ${kdsEsc(l.name)}" />
              ${l.kind === 'formula-part' ? (lineHeld(l, order) ? '<span class="rp-hold-mark">À suivre</span>' : '') : `<button type="button" class="rp-hold${l.hold ? ' is-on' : ''}" data-hold-uid="${l.uid}"
                aria-pressed="${l.hold ? 'true' : 'false'}" title="Garder ce plat pour la suite : il part en cuisine au prochain « Envoyer la suite »">À suivre</button>`}
            </div>
          </div>`).join('') + pairSuggestHtml(order, 'table:' + tableId);
      }

      $('#rp-total').textContent = fmtMAD(total);
      window.CaisseFx && window.CaisseFx.countTotal();
      showPayButtons(true);
      /* Same guard as renderRightPanel: once a split has taken a part, the only
         valid route is to resume it. The « Encaisser » of the order panel opens
         the cash flow for the WHOLE bill, so it charged the full amount again
         after a part was already paid. */
      if (tableHasOpenSplit(tableId)) {
        const chargeOrder = $('#pay-charge-order');
        if (chargeOrder) { chargeOrder.hidden = true; chargeOrder.style.display = 'none'; }
      } else {
        const chargeOrder = $('#pay-charge-order');
        if (chargeOrder) { chargeOrder.hidden = false; chargeOrder.style.display = ''; }
      }
      lucide.createIcons();
    }

    /* ---- validate (send to kitchen) ---- */
    function validateOrder(tableId) {
      if (!tableId) return;
      const t = tables[tableId];
      /* La table a disparu pendant la saisie (le patron a retouché son plan
         depuis son téléphone : setupRealSalle() reconstruit `tables`). Sans ce
         garde, la ligne suivante lève, l'écouteur du bouton meurt sur place, et
         « Envoyer en cuisine » devient un bouton mort de plus · le symptôme même
         qu'on est en train de corriger. On sort proprement. */
      if (!t) { backToSalle(); toast('Cette table n\'existe plus sur le plan'); return; }
      /* Un AJOUT ou une première commande ? La question se pose AVANT l'envoi,
         parce que c'est l'envoi qui pose les drapeaux `sent`. */
      const wasAddition = tableSentCount(tableId) > 0;
      const n = tableFreshQty(tableId);
      const held = tableHeldQty(tableId);

      tableSettlement().project(t, { status: 'ka-yaklo' });
      if ((tableOrders[tableId] || []).length) startTableTimer(tableId);
      refreshTableNode(tableId);

      // Retour salle, mesa toujours ouverte et sélectionnée : le serveur voit
      // l'addition à jour à la seconde où il a validé.
      backToSalle(tableId);

      /* « … en cuisine » était un mot, pas un geste : rien ne partait vers
         l'écran cuisine et aucun bon ne s'imprimait. Le serveur validait, la
         cuisine ne voyait rien, et le plat n'était lancé qu'au moment où
         quelqu'un s'en étonnait. */
      const sent = sendTableToKitchen(tableId);
      /* `backToSalle(tableId)` rendered the bill before sendTableToKitchen()
         marked its lines as sent. The destructive kitchen-void control is
         intentionally shown only for sent lines, so it stayed invisible until
         staff closed and reopened the table. Refresh the still-selected bill
         after the flags and canonical kitchen ticket have been created. */
      if (selectedId === tableId) renderRightPanel(tableId);
      const what = (n > 0 ? `${n} article${n > 1 ? 's' : ''} en cuisine` : 'rien de neuf à envoyer')
        + (held > 0 ? ` · ${held} à suivre` : '');
      toast(`${wasAddition ? 'Ajout table ' + tableId : 'Table ' + tableId + ' ouverte'} · ${what}`
        + (sent && sent.num ? ` · bon #${sent.num}` : ''));
    }
