/* Pressing rack UI. Exports: create. Reads: the declared owner methods/context
 * below and live presentation bindings; no sibling module or private window state.
 * Browser reads: .
 */
import { root } from './custody.js?v=5';
export function create(owner) {
  'use strict';
  const { $, ORDERS, RAILS, RAIL_SIZE, assignSlot, custOf, dataText, findOrder, icons, openDetail, orderStatus, pad2, publicOrderNo, queueIfOffline, rackSlots, renderBadges, state, toast } = owner.rackContext();
function renderRack() {
    const panel = $('[data-px-panel="rangement"]', root);
    const queue = ORDERS.filter((o) => orderStatus(o) === 'pret' && !o.rack);
    if (state.rackSelect && !queue.some((o) => o.id === state.rackSelect)) state.rackSelect = null;
    const sel = state.rackSelect;
    panel.innerHTML = `
      <div class="px-rack">
        <div class="px-rack-queue">
          <div class="px-rack-queue-head"><i data-icon="archive"></i>À ranger <span class="ct">${queue.length}</span></div>
          ${queue.map((o) => `
            <button class="px-qcard ${sel === o.id ? 'on' : ''}" data-px-q="${o.id}">
              <div class="num">${publicOrderNo(o)}</div>
              <div class="who">${dataText(custOf(o).name)}</div>
              <div class="sub">${o.pieces.length} pièce${o.pieces.length > 1 ? 's' : ''} · ${o.notified ? 'client notifié' : 'pas encore notifié'}</div>
            </button>`).join('') || '<div class="px-rack-hint">Rien à ranger.<br>Quand une commande passe « prête », elle arrive ici.</div>'}
          ${queue.length ? `<div class="px-rack-hint">${sel ? 'Touchez un emplacement libre →' : 'Sélectionnez une commande, puis son emplacement.'}</div>` : ''}
        </div>
        <div class="px-rails">
          ${RAILS.map((r) => {
            const free = Array.from({ length: RAIL_SIZE }, (_, i) => `${r}-${pad2(i + 1)}`).filter((s) => !rackSlots[s]).length;
            return `<div class="px-rail-row">
              <div class="px-rail-lbl"><i data-icon="swap_horiz"></i>RAIL ${r}<span class="free">${free} libres</span></div>
              <div class="px-slots">
                ${Array.from({ length: RAIL_SIZE }, (_, i) => {
                  const slot = `${r}-${pad2(i + 1)}`;
                  const oid = rackSlots[slot];
                  if (oid) return `<button class="px-slot is-full" data-px-slot-full="${oid}"><span class="pos">${slot}</span><span class="oid">${oid.replace('P-', '')}</span></button>`;
                  return `<button class="px-slot ${sel ? 'is-target' : ''}" data-px-slot="${slot}"><span class="pos">${slot}</span></button>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    panel.onclick = (e) => {
      const qc = e.target.closest('[data-px-q]');
      if (qc) { state.rackSelect = state.rackSelect === qc.dataset.pxQ ? null : qc.dataset.pxQ; renderRack(); icons(); return; }
      const full = e.target.closest('[data-px-slot-full]');
      if (full) { openDetail(full.dataset.pxSlotFull); return; }
      const slot = e.target.closest('[data-px-slot]');
      if (slot && state.rackSelect) {
        const o = findOrder(state.rackSelect);
        if (!assignSlot(o, slot.dataset.pxSlot)) return;
        state.rackSelect = null;
        queueIfOffline('Rangement');
        toast(`${publicOrderNo(o)} → cintre ${o.rack}, retrouvable en un scan`);
        renderRack(); renderBadges(); icons();
        const flash = $(`[data-px-slot-full="${o.id}"]`, panel);
        if (flash) flash.classList.add('flash');
      }
    };
    icons();
  }
  return Object.freeze({ renderRack });
}
