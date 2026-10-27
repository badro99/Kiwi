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
