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
          ${label ? `<span class="pds-el-label" style="color:${caisseJour() ? 'rgba(10,15,13,0.85)' : 'rgba(255,255,255,0.8)'};">${escTeam(label)}</span>` : ''}
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
      const caisseTableLabel = (id, status, covers) => {
        const tr = (window.KiwiCaisseLang || { tr: s => s }).tr;
        return `${tr('Table')} ${id}, ${tr(status)}, ${covers} ${tr('couverts')}`;
      };

      const PAD = (window.KiwiFloorCore && window.KiwiFloorCore.PAD) || 19;
      const ring = caisseRing(o.status);
      const g = { w: o.w, h: o.h, seats: o.seats || 0, shape: o.shape || 'rect' };
      const label = ({ 'khawya': 'Libre', 'a-commander': 'À commander', 'ka-yaklo': 'En cours', 'bgha-ykhlass': 'Addition', 'khlass': 'Réglée' })[o.status] || 'Khawya';
      const urgent = o.status === 'bgha-ykhlass' ? '<span class="cplan-urgent" aria-hidden="true"></span>' : '';
      return `<div class="cplan-tbl" data-table="${escTeam(String(o.id))}" role="button" tabindex="0"
             data-status="${o.status || 'khawya'}"
             aria-label="${escTeam(caisseTableLabel(String(o.id), label, o.covers))}"
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
      /* Ids and colours of the plan land in attributes: cleaned on read too,
         for plans stored before the server cleaned them. */
      const clean = (d) => { try { if (window.KiwiFloorCore && window.KiwiFloorCore.cleanPlan) window.KiwiFloorCore.cleanPlan(d); } catch (_) {} return d; };
      let slug = '';
      try { const p = storePaired(); slug = (p && p.merchant) || ''; } catch (_) {}
      // Cross-device: a server-fed plan (future /api/floorplan) lands here first.
      try { if (window.KiwiFloorPlan && Array.isArray(window.KiwiFloorPlan.tables)) return clean(window.KiwiFloorPlan); } catch (_) {}
      // Same-browser: the dashboard designer's slug-keyed mirror.
      try {
        if (slug) {
          const raw = localStorage.getItem('kiwiPlanDeSalle:slug:' + slug);
          if (raw) { const d = JSON.parse(raw); if (d && Array.isArray(d.tables)) return clean(d); }
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
      const caisseTableLabel = (id, status, covers) => {
        const tr = (window.KiwiCaisseLang || { tr: s => s }).tr;
        return `${tr('Table')} ${id}, ${tr(status)}, ${covers} ${tr('couverts')}`;
      };

      const label = ({ 'khawya': 'Libre', 'a-commander': 'À commander', 'ka-yaklo': 'En cours', 'bgha-ykhlass': 'Addition', 'khlass': 'Réglée' })[t.status] || 'Khawya';
      const dot = t.status === 'bgha-ykhlass' ? '<span class="urgent-dot" aria-hidden="true"></span>' : '';
      let sb = '';
      if (t.server && servers[t.server]) {
        const s = servers[t.server];
        sb = `<span class="tbl-server" style="background:${s.color};--server-badge-ink:${serverBadgeInk(s.color)};" title="Section de ${escTeam(s.name)}">${serverInitials(s)}</span>`;
      }
      return `<div class="tbl-cell is-designed" data-table="${escTeam(id)}" role="button" tabindex="0" aria-label="${escTeam(caisseTableLabel(id, label, t.covers))}">` +
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
