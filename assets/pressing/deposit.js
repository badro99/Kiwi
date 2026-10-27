/* Pressing deposit UI. Exports: create. Reads: the declared owner methods/context
 * below and live presentation bindings; no sibling module or private window state.
 * Browser reads: KiwiImageProof, KiwiLens.
 */
import { CATALOG, ITEMS, root } from './custody.js?v=10';
export function create(owner) {
  'use strict';
  const { $, $$, COLOR, COLORS, CUST, CUSTOMERS, MAX_QTY, NOTES, ORDERS, STATUS, availServices, catalogLabel, clampQty, closeVeil, dataText, esc, fmtDT, fmtMAD, freshTicket, garmentIcon, icons, isLiveOrder, lineTotal, minPrice, mirrorClient, normalizePhone, openVeil, orderStatus, orderTotals, pad2, persistPressing, phoneDigits, pressingOps, priceTable, publicOrderNo, readyOptions, state, storeInstant, storeWall, svcCodes, svcShorts, toast, validReady, validateTicket } = owner.depositContext();
function counterCatalog() {
    return CATALOG.map((c) => ({ ...c, items: c.items.filter((it) => {
      if (it.active === false) return false;
      if (it.variants && it.variants.length) return it.variants.some((v) => availServices(it, v.id).length);
      return availServices(it, null).length > 0;
    }) })).filter((c) => c.items.length);
  }
function renderCats() {
    const visible = counterCatalog();
    const counts = Object.fromEntries(visible.map((c) => [c.id, c.items.length]));
    const all = visible.reduce((s, c) => s + c.items.length, 0);
    $('#px-cats', root).innerHTML =
      `<button class="px-cat ${state.cat === 'tous' ? 'on' : ''}" data-px-cat="tous">Tous <span class="px-cat-ct">${all}</span></button>` +
      visible.map((c) =>
        `<button class="px-cat ${state.cat === c.id ? 'on' : ''}" data-px-cat="${c.id}">${catalogLabel(c)} <span class="px-cat-ct">${counts[c.id]}</span></button>`
      ).join('');
    $('#px-cats', root).onclick = (e) => {
      const b = e.target.closest('[data-px-cat]');
      if (!b) return;
      state.cat = b.dataset.pxCat;
      renderCats(); renderGrid(); icons();
    };
  }
function renderGrid() {
    const visible = counterCatalog();
    const cats = state.cat === 'tous' ? visible : visible.filter((c) => c.id === state.cat);
    const query = state.catalogQuery.trim().toLocaleLowerCase('fr');
    const rows = cats.flatMap((category) => category.items.map((item) => ({ category, item }))).filter(({ category, item }) => {
      if (!query) return true;
      return [item.label, item.sub, category.label].some((value) => String(value || '').toLocaleLowerCase('fr').includes(query));
    });
    let i = 0;
    const count = $('#px-catalog-count', root);
    if (count) count.textContent = rows.length;
    $('#px-gridwrap', root).innerHTML = rows.length ? `
      <div class="px-grid px-grid-all">${rows.map(({ category, item: it }) => `
        <button class="px-card" data-px-item="${it.id}" style="--i:${i++}">
          <span class="px-card-art">${garmentIcon(it)}</span>
          <span class="px-card-cat">${catalogLabel(category)}</span>
          <span class="px-card-name">${catalogLabel(it)}</span>
          <span class="px-card-price">dès ${fmtMAD(minPrice(it))}${it.sub ? ` · ${esc(it.sub)}` : ''}</span>
          ${it.flag ? `<span class="px-card-flag">${esc(it.flag)}</span>` : ''}
        </button>`).join('')}
      </div>` : `<div class="px-grid-empty"><i data-icon="search_off"></i><b>Aucun article trouvé</b><span>Essayez un autre nom ou choisissez une autre catégorie.</span></div>`;
    $('#px-gridwrap', root).onclick = (e) => {
      const b = e.target.closest('[data-px-item]');
      if (b) openSheet(b.dataset.pxItem);
    };
  }
function ticketCount(t) {
    return t.lines.reduce((s, ln) => {
      const item = ITEMS[ln.itemId];
      /* Une variante n'a pas forcément de pièces nommées : les paliers de
         taille d'un tapis (petit / moyen / grand) sont des variantes de PRIX,
         pas de découpe. Sans ce garde-fou, ajouter un tapis au ticket plantait
         le comptoir — même règle qu'à buildPieces(), qui retombe déjà sur une
         seule étiquette quand `pieces` manque. */
      const variant = item.variants && (item.variants.find((v) => v.id === ln.variantId) || item.variants[0]);
      const per = (variant && Array.isArray(variant.pieces) && variant.pieces.length) || 1;
      return s + ln.qty * per;
    }, 0);
  }
function ticketTotals(t) {
    const b2b = t.customer && t.customer.type === 'known' && CUST[t.customer.id] && CUST[t.customer.id].b2b;
    return { ...orderTotals({ lines: t.lines, b2b }), b2b };
  }
function customerRow(t) {
    if (!t.customer) {
      return `<button class="px-tk-row" id="px-tk-client"><i data-icon="person_add"></i>
        <span class="l"><b>Attacher un client</b><span>Recherche par téléphone, jamais par ticket</span></span>
        <span class="edit">Chercher</span></button>`;
    }
    if (t.customer.type === 'guest') {
      return `<button class="px-tk-row is-set" id="px-tk-client"><i data-icon="person"></i>
        <span class="l"><b>Client de passage</b><span>Sans fiche, retrouvable par n° de ticket</span></span>
        <span class="edit">Changer</span></button>`;
    }
    const c = t.customer.type === 'known' ? CUST[t.customer.id] : t.customer;
    const prefs = (c.prefs && c.prefs.length) ? ` · ${c.prefs[0]}` : '';
    return `<button class="px-tk-row is-set" id="px-tk-client"><i data-icon="how_to_reg"></i>
      <span class="l"><b>${dataText(c.name)}</b><span>${esc(c.phone || 'sans téléphone')}${c.orders ? ` · ${c.orders} commandes` : ' · nouveau'}${esc(prefs)}</span></span>
      ${c.b2b ? '<span class="px-b2b-chip">B2B</span>' : ''}
      <span class="edit">Changer</span></button>`;
  }
function renderTicket() {
    const t = state.ticket;
    const { remise, total, b2b } = ticketTotals(t);
    const count = ticketCount(t);
    const el = $('#px-ticket', root);
    el.innerHTML = `
      <div class="px-tk-head">
        <div><span class="px-tk-title">Ticket</span> <span class="px-tk-num">· ${t.num}</span></div>
        ${t.lines.length ? `<button class="px-tk-reset" id="px-tk-reset">Vider</button>` : ''}
      </div>
      <div class="px-tk-meta">
        ${customerRow(t)}
        <button class="px-tk-row ${t.ready ? 'is-set' : ''}" id="px-tk-date"><i data-icon="calendar_clock"></i>
          <span class="l"><b>Prêt le ${esc(fmtDT(t.ready))}</b><span>Date de retrait, modifiable</span></span>
          <span class="edit">Modifier</span></button>
      </div>
      <div class="px-tk-lines" id="px-tk-lines">
        ${t.lines.length ? t.lines.map((ln, i) => lineRow(ln, i)).join('') : `
          <div class="px-tk-empty">
            <i data-icon="checkroom"></i>
            <div>Le ticket est vide.<br>Touchez un vêtement dans la grille, chaque pièce recevra son étiquette.</div>
          </div>`}
      </div>
      <div class="px-tk-foot">
        <div class="px-tk-tot">
          <span class="pcs"><i data-icon="sell"></i> ${count} pièce${count > 1 ? 's' : ''} · ${count} étiquette${count > 1 ? 's' : ''}</span>
          ${remise ? `<span>Remise B2B –15 % · −${fmtMAD(remise).replace(' MAD', '')} MAD</span>` : ''}
        </div>
        <div class="px-tk-total"><span class="lbl">Total${b2b ? ' (remisé)' : ''}</span><span class="val">${fmtMAD(total)}</span></div>
        <button class="px-validate" id="px-validate" ${t.lines.length ? '' : 'disabled'}>
          <i data-icon="sell"></i> Valider · étiquettes &amp; ticket
        </button>
      </div>`;
    const reset = $('#px-tk-reset', el);
    if (reset) reset.onclick = () => { freshTicket(); renderTicket(); icons(); };
    $('#px-tk-client', el).onclick = openClient;
    $('#px-tk-date', el).onclick = openDate;
    $('#px-validate', el).onclick = validateTicket;
    $('#px-tk-lines', el).onclick = (e) => {
      const minus = e.target.closest('[data-px-minus]');
      const plus = e.target.closest('[data-px-plus]');
      const idx = minus ? +minus.dataset.pxMinus : plus ? +plus.dataset.pxPlus : -1;
      if (idx < 0) return;
      const ln = t.lines[idx];
      if (plus) {
        if (ln.qty >= MAX_QTY) { toast(`Maximum ${MAX_QTY} pièces par ligne`); return; }
        ln.qty++;
      }
      else { ln.qty--; if (ln.qty <= 0) t.lines.splice(idx, 1); }
      renderTicket(); icons();
    };
    icons();
  }
function lineRow(ln, i) {
    const item = ITEMS[ln.itemId];
    const variant = item.variants ? (item.variants.find((v) => v.id === ln.variantId) || item.variants[0]) : null;
    const notesCt = ln.notes.length + (ln.freeNote ? 1 : 0);
    return `<div class="px-line">
        <span class="px-line-art">${garmentIcon({ ...item, variantId: ln.variantId })}</span>
      <span class="px-line-mid">
        <span class="px-line-name">${catalogLabel({ ...item, label: ln.label || item.label })}${variant ? ` · ${esc(variant.label)}` : ''}</span>
        <span class="px-line-sub">
          <i class="dot" style="background:${COLOR[ln.color] ? COLOR[ln.color].hex : '#ccc'}"></i>
          <span class="svc">${svcCodes(ln.services)}</span> ${esc(svcShorts(ln.services))}
          ${notesCt ? `<span class="meta"><i data-icon="sticky_note_2"></i>${notesCt}</span>` : ''}
          ${ln.photos ? `<span class="meta"><i data-icon="photo_camera"></i>${ln.photos}</span>` : ''}
        </span>
      </span>
      <span class="px-line-right">
        <span class="px-line-price">${fmtMAD(lineTotal(ln))}</span>
        <span class="px-line-qty">
          <button data-px-minus="${i}" aria-label="Retirer">−</button><b>${ln.qty}</b><button data-px-plus="${i}" aria-label="Ajouter">+</button>
        </span>
      </span>
    </div>`;
  }
const sheet = { itemId: null, services: [], variantId: null, qty: 1, color: 'blanc', notes: [], freeNote: '', photos: 0, photoData: [] };
function defaultService(item, variantId) {
    const avail = availServices(item, variantId);
    return (item.def && avail.some((s) => s.id === item.def)) ? item.def : avail[0].id;
  }
function openSheet(itemId) {
    const item = ITEMS[itemId];
    Object.assign(sheet, {
      itemId,
      variantId: item.variants ? item.variants[0].id : null,
      services: [], qty: 1, color: 'blanc', notes: [], freeNote: '', photos: 0, photoData: [],
    });
    sheet.services = [defaultService(item, sheet.variantId)];
    renderSheet();
    openVeil('#px-sheet-veil');
    icons();
    if (window.KiwiLens) KiwiLens.rescan();
  }
function sheetUnit() {
    const t = priceTable(ITEMS[sheet.itemId], sheet.variantId);
    return sheet.services.reduce((s, sv) => s + (t[sv] || 0), 0);
  }
function renderSheet() {
    const item = ITEMS[sheet.itemId];
    const avail = availServices(item, sheet.variantId);
    /* un changement de variante peut retirer des services du tarif */
    sheet.services = sheet.services.filter((sv) => avail.some((s) => s.id === sv));
    if (!sheet.services.length) sheet.services = [defaultService(item, sheet.variantId)];
    const unit = sheetUnit();
    const el = $('#px-sheet', root);
    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-icon="close"></i></button>
      <div class="px-sheet-head">
        <span class="px-sheet-art">${garmentIcon({ ...item, variantId: sheet.variantId })}</span>
        <span class="px-sheet-title"><h3>${catalogLabel(item)}</h3><span class="sub">${esc(CATALOG.find((c) => c.id === item.cat).label)}${item.sub ? ` · ${esc(item.sub)}` : ''}</span></span>
        <span class="px-sheet-price"><span class="val" id="px-sheet-total">${fmtMAD(unit * sheet.qty)}</span><span class="per">${fmtMAD(unit)} × ${sheet.qty}</span></span>
      </div>

      <div class="px-f">
        <div class="px-f-lbl">Service <span class="opt">· combinables, ex. lavage + repassage</span></div>
        <div class="px-seg is-multi" id="px-svc-seg">
          ${avail.map((s) => `<button class="px-seg-it ${sheet.services.includes(s.id) ? 'on' : ''}" data-px-svc="${s.id}" aria-pressed="${sheet.services.includes(s.id)}">${esc(s.short)}<small>${fmtMAD(priceTable(item, sheet.variantId)[s.id])}</small></button>`).join('')}
        </div>
      </div>

      <div class="px-row-2">
        ${item.variants ? `<div class="px-f">
          <div class="px-f-lbl">${item.id === 'costume' ? 'Pièces du costume' : 'Taille'}</div>
          <div class="px-seg" data-lens-demo id="px-var-seg">
            ${item.variants.map((v) => `<button class="px-seg-it ${v.id === sheet.variantId ? 'on' : ''}" data-lens-item data-px-var="${v.id}">${catalogLabel(v)}${v.pieces ? `<small>${v.pieces.length} étiquettes</small>` : ''}</button>`).join('')}
          </div>
        </div>` : ''}
        <div class="px-f">
          <div class="px-f-lbl">Quantité</div>
          <div class="px-stepper">
            <button id="px-qty-minus" aria-label="Moins">−</button>
            <b id="px-qty-val">${sheet.qty}</b>
            <button id="px-qty-plus" aria-label="Plus">+</button>
          </div>
        </div>
      </div>

      <div class="px-f">
        <div class="px-f-lbl">Couleur</div>
        <div class="px-colors" id="px-colors">
          ${COLORS.map((c) => `<button type="button" class="px-color ${c.id === sheet.color ? 'on' : ''}" data-px-color="${c.id}" data-c="${c.id}" style="background:${c.hex}" title="${esc(c.label)}" aria-label="${esc(c.label)}" aria-pressed="${c.id === sheet.color}"></button>`).join('')}
        </div>
      </div>

      <div class="px-f">
        <div class="px-f-lbl">Notes usuelles <span class="opt">· optionnel</span></div>
        <div class="px-chips" id="px-notes">
          ${NOTES.map((n) => `<button type="button" class="px-chip ${sheet.notes.includes(n) ? 'on' : ''}" data-px-note="${esc(n)}" aria-pressed="${sheet.notes.includes(n)}">${esc(n)}</button>`).join('')}
        </div>
        <input class="px-note-free" id="px-note-free" placeholder="Note libre (ex. « ourlet 2 cm »)…" value="${esc(sheet.freeNote)}" />
      </div>

      <div class="px-sheet-foot">
        <button class="px-btn secondary" data-px-close>Annuler</button>
        <button class="px-btn primary" id="px-sheet-add"><i data-icon="add"></i>Ajouter au ticket · <span id="px-sheet-cta-price">${fmtMAD(unit * sheet.qty)}</span></button>
      </div>`;

    const refreshPrice = () => {
      const u = sheetUnit();
      $('#px-sheet-total', el).textContent = fmtMAD(u * sheet.qty);
      $('#px-sheet-cta-price', el).textContent = fmtMAD(u * sheet.qty);
      $('.px-sheet-price .per', el).textContent = `${fmtMAD(u)} × ${sheet.qty}`;
      $('#px-qty-val', el).textContent = sheet.qty;
    };

    $('#px-svc-seg', el).onclick = (e) => {
      const b = e.target.closest('[data-px-svc]');
      if (!b) return;
      const id = b.dataset.pxSvc;
      const i = sheet.services.indexOf(id);
      if (i >= 0) {
        if (sheet.services.length === 1) return;          /* toujours ≥ 1 service */
        sheet.services.splice(i, 1);
      } else {
        sheet.services.push(id);
      }
      $$('[data-px-svc]', el).forEach((x) => {
        const on = sheet.services.includes(x.dataset.pxSvc);
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', on);
      });
      refreshPrice();
    };
    const varSeg = $('#px-var-seg', el);
    if (varSeg) varSeg.onclick = (e) => {
      const b = e.target.closest('[data-px-var]');
      if (!b) return;
      sheet.variantId = b.dataset.pxVar;
      renderSheet(); icons();             /* les prix par service changent */
      if (window.KiwiLens) KiwiLens.rescan();
    };
    $('#px-qty-minus', el).onclick = () => { if (sheet.qty > 1) { sheet.qty--; refreshPrice(); } };
    $('#px-qty-plus', el).onclick = () => {
      if (sheet.qty >= MAX_QTY) { toast(`Maximum ${MAX_QTY} pièces par ligne`); return; }
      sheet.qty++; refreshPrice();
    };
    $('#px-colors', el).onclick = (e) => {
      const b = e.target.closest('[data-px-color]');
      if (!b) return;
      sheet.color = b.dataset.pxColor;
      $$('[data-px-color]', el).forEach((x) => {
        const on = x === b;
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', on);
      });
    };
    $('#px-notes', el).onclick = (e) => {
      const b = e.target.closest('[data-px-note]');
      if (!b) return;
      const n = b.dataset.pxNote;
      const i = sheet.notes.indexOf(n);
      if (i >= 0) sheet.notes.splice(i, 1); else sheet.notes.push(n);
      b.classList.toggle('on', i < 0);
      b.setAttribute('aria-pressed', i < 0);
    };
    $('#px-note-free', el).oninput = (e) => { sheet.freeNote = e.target.value; };
    $('#px-sheet-add', el).onclick = addSheetToTicket;
    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-sheet-veil'); });
  }
function addSheetToTicket() {
    state.ticket.lines.push({
      itemId: sheet.itemId, variantId: sheet.variantId, services: sheet.services.slice(),
      qty: clampQty(sheet.qty), color: sheet.color, notes: sheet.notes.slice(), freeNote: sheet.freeNote.trim(),
      photos: (sheet.photoData || []).length,
      photoData: (sheet.photoData || []).slice(),
    });
    closeVeil('#px-sheet-veil');
    const item = ITEMS[sheet.itemId];
    toast(`${item.label} × ${sheet.qty} · ${svcShorts(sheet.services)}, sur le ticket`);
    renderTicket(); icons();
  }
function openPhoto() {
    const item = ITEMS[sheet.itemId];
    const el = $('#px-photom', root);
    el.innerHTML = `
      <div class="px-vf">
        <div class="px-vf-hint">Cadrez la zone (tache, accroc, bouton)…</div>
        ${garmentIcon({ ...item, variantId: sheet.variantId },'art')}
        <span class="px-vf-corner tl"></span><span class="px-vf-corner tr"></span>
        <span class="px-vf-corner bl"></span><span class="px-vf-corner br"></span>
        <div class="px-vf-flash" id="px-vf-flash"></div>
      </div>
      <div class="px-vf-foot">
        <button class="px-shutter" id="px-shutter" aria-label="Prendre la photo"></button>
        <button class="px-vf-close" id="px-vf-close">Fermer</button>
      </div>`;
    openVeil('#px-photo-veil');
    $('#px-shutter', el).onclick = async () => {
      if (!window.KiwiImageProof) { toast('Appareil photo indisponible'); return; }
      try {
        const photo = await KiwiImageProof.pick({ maxDimension: 640, quality: 0.58 });
        if (!photo) return;
        const flash = $('#px-vf-flash', el);
        flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
        sheet.photoData = sheet.photoData || [];
        sheet.photoData.push(photo);
        sheet.photos = sheet.photoData.length;
        setTimeout(() => {
          closeVeil('#px-photo-veil');
          renderSheet(); icons();
          if (window.KiwiLens) KiwiLens.rescan();
          toast(`Photo état ${sheet.photos} enregistrée, jointe à la pièce`);
        }, 220);
      } catch (_) { toast('Photo non enregistrée · vérifiez l’accès à l’appareil'); }
    };
    $('#px-vf-close', el).onclick = () => closeVeil('#px-photo-veil');
  }
function openClient(options = {}) {
    const el = $('#px-clientm', root);
    const onSelected = typeof options.onSelected === 'function' ? options.onSelected : null;
    const completeSelection = () => {
      closeVeil('#px-client-veil');
      renderTicket(); icons();
      if (onSelected) setTimeout(onSelected, 0);
    };
    let mode = 'search';
    const render = (q) => {
      const digits = phoneDigits(q);
      const ql = (q || '').toLowerCase();
      const hits = !q ? CUSTOMERS : CUSTOMERS.filter((c) =>
        (digits && phoneDigits(c.phone).includes(digits)) ||
        (!digits && c.name.toLowerCase().includes(ql)));
      el.innerHTML = `
        <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-icon="close"></i></button>
        <h3 class="modal-title">Client</h3>
        <p class="modal-subtle">Au pressing on cherche par téléphone, le client n'a jamais son ticket.</p>
        <div class="px-phone-in"><i data-icon="call"></i>
          <input id="px-cl-q" inputmode="tel" placeholder="06… ou nom du client" value="${esc(q || '')}" autocomplete="off" />
        </div>
        ${mode === 'search' ? `
          <div class="px-cl-results" id="px-cl-results">
            ${hits.map((c) => `
              <button class="px-cl-row" data-px-cl="${c.id}">
                <span class="px-cl-ava ${c.b2b ? 'b2b' : ''}">${c.b2b ? '<i data-icon="apartment"></i>' : esc(initials(c.name))}</span>
                <span class="px-cl-mid">
                  <span class="px-cl-name" data-nolang>${dataText(c.name)} ${c.b2b ? '<span class="px-b2b-chip">B2B</span>' : ''}</span>
                  <span class="px-cl-sub">${esc(c.phone)}</span>
                </span>
                <span class="px-cl-right"><b>${c.orders} cmd</b>${dueOf(c) ? `<span class="due">solde ${fmtMAD(dueOf(c))}</span>` : ''}</span>
              </button>`).join('') || `<div class="px-bempty">Aucun client pour « ${esc(q)} »</div>`}
          </div>
          ${hits.length === 1 ? recoPanel(hits[0]) : ''}
          <button class="px-cl-new" id="px-cl-new"><i data-icon="person_add"></i>Nouveau client${q && !hits.length ? ` · « ${esc(q)} »` : ''}</button>
          <div class="px-sheet-foot" style="margin-top:10px;">
            <button class="px-btn ghost" id="px-cl-guest">Client de passage, sans fiche</button>
          </div>` : `
          <div class="px-cl-form">
            <input class="px-in" id="px-cl-name" placeholder="Nom et prénom" value="${esc(/^[\d\s.+-]*$/.test(q || '') ? '' : (q || ''))}" />
            <input class="px-in" id="px-cl-tel" inputmode="tel" autocomplete="tel" placeholder="Téléphone · 06…, +212…, +33…, +49…" value="${esc(/^[\d\s().+-]+$/.test(q || '') ? q : '')}" />
            <div class="px-sheet-foot" style="margin-top:4px;">
              <button class="px-btn secondary" id="px-cl-back">Retour</button>
              <button class="px-btn primary" id="px-cl-create"><i data-icon="check"></i>Créer la fiche</button>
            </div>
          </div>`}`;
      $('#px-cl-q', el).oninput = (e) => { render(e.target.value); icons(); $('#px-cl-q', el).focus(); moveCaretEnd($('#px-cl-q', el)); };
      $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-client-veil'); });
      $$('[data-px-cl]', el).forEach((b) => {
        b.onclick = () => {
          state.ticket.customer = { type: 'known', id: b.dataset.pxCl };
          const c = CUST[b.dataset.pxCl];
          toast(c.b2b ? `${c.name}, compte B2B, remise –15 % appliquée` : `${c.name}, ${c.orders} ${c.orders < 2 ? 'commande' : 'commandes'}, bienvenue`);
          completeSelection();
        };
      });
      const newBtn = $('#px-cl-new', el);
      if (newBtn) newBtn.onclick = () => { mode = 'create'; render(q); icons(); };
      const guest = $('#px-cl-guest', el);
      if (guest) guest.onclick = () => {
        state.ticket.customer = { type: 'guest' };
        completeSelection();
      };
      const back = $('#px-cl-back', el);
      if (back) back.onclick = () => { mode = 'search'; render(q); icons(); };
      const create = $('#px-cl-create', el);
      if (create) create.onclick = () => {
        const name = $('#px-cl-name', el).value.trim();
        const tel = normalizePhone($('#px-cl-tel', el).value);
        if (!name) { toast('Le nom est requis pour la fiche'); return; }
        if (!tel) { toast('Numéro valide requis · pour l’étranger, ajoutez + et l’indicatif pays'); return; }
        const existing = CUSTOMERS.find((c) => phoneDigits(c.phone) === phoneDigits(tel));
        if (existing) { toast(`Ce numéro appartient déjà à ${existing.name}`); return; }
        const id = 'cx' + Date.now().toString(36);
        const c = { id, name, phone: tel, orders: 0, prefs: [] };
        CUSTOMERS.unshift(c); CUST[id] = c;
        mirrorClient(c);
        persistPressing();
        state.ticket.customer = { type: 'known', id };
        pressingOps?.save?.('customer-created');
        toast(`Fiche créée, ${name}`);
        completeSelection();
      };
    };
    render('');
    openVeil('#px-client-veil');
    icons();
    setTimeout(() => { const i = $('#px-cl-q', el); if (i) i.focus(); }, 60);
  }
function initials(name) {
    return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }
function dueOf(c) {
    return ORDERS.filter((o) => o.custId === c.id && isLiveOrder(o) && o.pay.mode !== 'compte')
      .reduce((s, o) => s + Math.max(0, orderTotals(o).total - o.pay.paid), 0);
  }
function recoPanel(c) {
    const hist = ORDERS.filter((o) => o.custId === c.id).slice(0, 2);
    return `<div class="px-reco">
      <div class="px-reco-head"><i data-icon="auto_awesome"></i><span>${dataText(c.name)}, client reconnu</span></div>
      <div class="px-reco-rows">
        ${(c.prefs || []).map((p) => `<div class="px-reco-row"><i data-icon="favorite"></i>${esc(p)}</div>`).join('')}
        ${c.contact ? `<div class="px-reco-row"><i data-icon="person"></i>${esc(c.contact)}</div>` : ''}
        ${hist.map((o) => `<div class="px-reco-row"><i data-icon="history"></i><b>${publicOrderNo(o)}</b> · ${o.pieces.length} pièces · ${STATUS[orderStatus(o)].label}</div>`).join('')}
      </div>
    </div>`;
  }
function moveCaretEnd(input) {
    const v = input.value; input.value = ''; input.value = v;
  }
function openDate(options = {}) {
    const el = $('#px-datemm', root);
    const onSelected = typeof options.onSelected === 'function' ? options.onSelected : null;
    const completeSelection = (ready) => {
      state.ticket.ready = ready;
      closeVeil('#px-date-veil');
      renderTicket(); icons();
      if (onSelected) setTimeout(() => onSelected(ready), 0);
    };
    const now = new Date();
    const opts = readyOptions(now);
    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-icon="close"></i></button>
      <div class="px-date-kicker">PROMESSE CLIENT</div>
      <h3 class="modal-title" id="px-date-title">Prêt pour quand ?</h3>
      <p class="modal-subtle">Choisissez un créneau réaliste. Il sera imprimé sur le ticket et suivi par l'atelier.</p>
      <div class="px-date-chips">
        ${opts.map((o, i) => `<button class="px-date-chip ${Math.abs(o.d - state.ticket.ready) < 60000 ? 'on' : ''}" data-px-d="${i}">
          <span class="px-date-day">${esc(o.day)}</span><b>${esc(o.time)}</b><span class="px-date-meta">${esc(o.sub)}</span>${o.recommended ? '<em>RECOMMANDÉ</em>' : ''}<i data-icon="check"></i>
        </button>`).join('')}
      </div>
      <div class="px-date-divider"><span>Autre date</span></div>
      <div class="px-date-custom">
        <label class="px-date-field" for="px-date-input" data-px-date-field>
          <input class="px-in" id="px-date-input" aria-labelledby="px-date-title" type="datetime-local" min="${localDT(new Date(Date.now() + 60000))}" value="${localDT(state.ticket.ready)}" />
        </label>
        <button class="px-btn primary" id="px-date-ok">Valider</button>
      </div>`;
    openVeil('#px-date-veil');
    icons();
    const dateInput = $('#px-date-input', el);
    const dateField = $('[data-px-date-field]', el);
    dateField?.addEventListener('click', () => {
      dateInput?.focus();
      try { dateInput?.showPicker?.(); } catch (_) { /* iOS opens the native picker from focus. */ }
    });
    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-date-veil'); });
    $$('[data-px-d]', el).forEach((b) => {
      b.onclick = () => {
        const ready = opts[+b.dataset.pxD].d;
        if (!validReady(ready)) { toast('Choisissez une date de retrait dans le futur'); return; }
        completeSelection(ready);
      };
    });
    $('#px-date-ok', el).onclick = () => {
      const v = $('#px-date-input', el).value;
      /* Le champ « Autre date » se lit, lui aussi, à l'heure du magasin. */
      const ready = v ? storeInstant(new Date(v + (v.length === 16 ? ':00Z' : 'Z'))) : null;
      if (!validReady(ready)) { toast('La date de retrait doit être dans le futur'); return; }
      completeSelection(ready);
    };
  }
function localDT(d) {
    const w = storeWall(d);
    return `${w.getUTCFullYear()}-${pad2(w.getUTCMonth() + 1)}-${pad2(w.getUTCDate())}T${pad2(w.getUTCHours())}:${pad2(w.getUTCMinutes())}`;
  }
  return Object.freeze({ counterCatalog, renderCats, renderGrid, ticketCount, ticketTotals, customerRow, renderTicket, lineRow, defaultService, openSheet, sheetUnit, renderSheet, addSheetToTicket, openPhoto, openClient, initials, dueOf, recoPanel, moveCaretEnd, openDate, localDT });
}
