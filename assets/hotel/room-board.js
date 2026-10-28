/* Owner: hotel roomBoard. Exports named methods below. Reads only the declared scope and browser globals in tools/fixtures/hotel/reception-interfaces.json. */
(window.__kiwiHotelSections ||= {}).roomBoard = (scope) => {
'use strict';
function cuFloorRows(...args) { return scope.cuFloorRows.apply(this, args); }
function cuStamp(...args) { return scope.cuStamp.apply(this, args); }
function esc(...args) { return scope.esc.apply(this, args); }
function ltr(...args) { return scope.ltr.apply(this, args); }
function tx(...args) { return scope.tx.apply(this, args); }
function cuPhotoEditorMarkup(photos) {
    return photos.length ? photos.map((p, i) => `<div class="hx-type-photo"><img src="${esc(p.url)}" alt="${esc(p.alt || '')}"><span>${i === 0 ? tx('PHOTO PRINCIPALE') : ltr((i + 1) + ' / ' + photos.length)}</span><div><button type="button" data-action="hx-type-photo-move" data-arg="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="${tx('Déplacer avant')}">←</button><button type="button" data-action="hx-type-photo-move" data-arg="${i}:1" ${i === photos.length - 1 ? 'disabled' : ''} aria-label="${tx('Déplacer après')}">→</button><button type="button" data-action="hx-type-photo-remove" data-arg="${i}" aria-label="${tx('Retirer la photo')}">×</button></div></div>`).join('') : `<div class="hx-type-photo-empty"><b>${tx('Aucune photo')}</b><span>${tx('Le visuel Kiwi reste affiché tant que vous n’ajoutez rien.')}</span></div>`;
  }

function cuRenderPhotoEditor(root) {
    const host = root?.querySelector('[data-hx-type-photos]');
    if (host) host.innerHTML = cuPhotoEditorMarkup(root.__hxPhotos || []);
    const add = root?.querySelector('[data-action="hx-type-photo-pick"]');
    if (add) add.disabled = (root.__hxPhotos || []).length >= 8;
  }

function cuShrinkHotelPhoto(file) {
    if (!file || !/^image\/(jpeg|png|webp|avif)$/i.test(file.type || '') || file.size < 900 * 1024 || typeof createImageBitmap !== 'function') return Promise.resolve(file);
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file)).then((image) => {
      if (!(image.width > 0 && image.height > 0)) { try { image.close(); } catch (_) {} throw new Error('photo-conversion'); }
      const scale = Math.min(1, 1800 / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('photo-conversion');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height); try { image.close(); } catch (_) {}
      return new Promise((resolve, reject) => canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('photo-conversion'));
        if (blob.size >= file.size) return resolve(file);
        const name = String(file.name || 'chambre').replace(/\.[a-z0-9]{1,6}$/i, '') + '.jpg';
        try { resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })); } catch (_) { resolve(blob); }
      }, 'image/jpeg', .84));
    }).catch(() => { console.warn('[hotel] photo conversion failed'); throw new Error('photo-conversion'); });
  }

function cuRefreshFloorSelectors() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    const floors = cuFloorRows();
    document.querySelectorAll('select[data-hx-room-floor-id], select[data-hx-bulk-floor-id]').forEach((sel) => {
      const currentVal = sel.value;
      const isBulk = sel.hasAttribute('data-hx-bulk-floor-id');
      const prefix = isBulk ? `<option value="">${tx('Ne pas modifier')}</option>` : '';
      sel.innerHTML = prefix + floors.map((f) => `<option value="${esc(f.id)}" ${f.id === currentVal ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
      if (currentVal && floors.some((f) => f.id === currentVal)) {
        sel.value = currentVal;
      }
    });
  }

function cuLinkConnectingRooms(st, roomA, roomB) {
    if (!roomA || !roomB || roomA.id === roomB.id) return;
    const now = cuStamp();
    if (!Array.isArray(roomA.connectingRoomIds)) roomA.connectingRoomIds = [];
    if (!Array.isArray(roomB.connectingRoomIds)) roomB.connectingRoomIds = [];
    if (!roomA.connectingRoomIds.includes(roomB.id)) roomA.connectingRoomIds.push(roomB.id);
    if (!roomB.connectingRoomIds.includes(roomA.id)) roomB.connectingRoomIds.push(roomA.id);
    roomA.connectingMeta = { ...(roomA.connectingMeta || {}) };
    roomB.connectingMeta = { ...(roomB.connectingMeta || {}) };
    roomA.connectingMeta[roomB.id] = { at: now, linked: true };
    roomB.connectingMeta[roomA.id] = { at: now, linked: true };
    roomA.updatedAt = now;
    roomB.updatedAt = now;
  }

return Object.freeze({ cuPhotoEditorMarkup, cuRenderPhotoEditor, cuShrinkHotelPhoto, cuRefreshFloorSelectors, cuLinkConnectingRooms });
};
