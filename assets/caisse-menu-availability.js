/* Kiwi Caisse — operational menu availability.
 * A cashier can hide a sold-out dish from OrderPro and the employee app. The
 * change is server-owned and merchant-scoped; no dashboard menu is overwritten.
 */
(function () {
  'use strict';

  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const merchant = () => {
    try { return String(window.KiwiLive?.merchant?.() || window.KiwiConfig?.storeSlug?.() || localStorage.getItem('kiwiLiveMerchant') || ''); }
    catch (_) { return ''; }
  };
  const restaurant = () => {
    const type = String(window.KiwiConfig?.type || '').toLowerCase();
    return !type || ['restaurant', 'cafe', 'café', 'fastfood', 'snack'].includes(type);
  };

  let menu = null;
  let query = '';
  let category = 'all';
  let view = 'all';
  let busy = new Set();
  const managedItems = () => !menu ? [] : (Array.isArray(menu.items) ? menu.items : []).concat(Array.isArray(menu.formulaItems) ? menu.formulaItems : []);

  /* « Épuisé jusqu'à… » — la fin d'un 86 se calcule ICI, sur l'horloge de la
   * caisse, qui est celle du commerce ; le serveur ne reçoit qu'un instant
   * absolu et rend le plat tout seul quand il est passé (functions/api/menu.js
   * › availUntilOf). La fin du service suit la journée de la caisse, qui
   * bascule à 5 h et non à minuit. */
  const pad2 = (n) => String(n).padStart(2, '0');
  function endOfService(now) {
    const d = new Date(now);
    d.setHours(5, 0, 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  function nextClock(value, now) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    const d = new Date(now);
    d.setHours(+m[1], +m[2], 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  function returnLabel(until, now) {
    const d = new Date(until);
    const clock = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    const today = new Date(now);
    const sameDay = d.toDateString() === today.toDateString();
    today.setDate(today.getDate() + 1);
    return 'Revient ' + (sameDay ? '' : d.toDateString() === today.toDateString() ? 'demain ' : 'le ' + d.getDate() + '/' + (d.getMonth() + 1) + ' ') + 'à ' + clock;
  }

  function install() {
    if (document.getElementById('open-menu-availability')) return;
    const rail = document.querySelector('.rail-links');
    if (!rail) return;
    const button = document.createElement('button');
    button.className = 'team-trigger';
    button.id = 'open-menu-availability';
    button.type = 'button';
    button.innerHTML = '<i data-lucide="utensils"></i><span>Menu</span><span class="count" id="menu-unavailable-count" hidden></span>';
    rail.insertBefore(button, rail.querySelector('#open-kds'));

    const screen = document.createElement('div');
    screen.className = 'kds-screen km-screen';
    screen.id = 'menu-availability-screen';
    screen.setAttribute('role', 'dialog');
    screen.setAttribute('aria-modal', 'true');
    screen.setAttribute('aria-label', 'Disponibilité du menu');
    screen.innerHTML = '<div class="kds-head"><div class="kds-head-l"><h2>Menu</h2><div class="sub">Masquez immédiatement les articles épuisés</div></div><button class="kds-close" id="menu-availability-close"><i data-lucide="x"></i><span>Fermer</span></button></div><div class="km-tools"><div class="km-search"><i data-lucide="search" aria-hidden="true"></i><input id="km-search" type="search" aria-label="Rechercher un article" placeholder="Rechercher un article…" autocomplete="off"></div><div class="km-summary" id="km-summary"></div></div><div class="km-cats" id="km-cats"></div><div class="km-body" id="km-body"></div><div class="km-sheet" id="km-sheet" role="dialog" aria-modal="true" aria-labelledby="km-sheet-title" hidden><div class="km-sheet-card"><h3 id="km-sheet-title">Masquer l’article</h3><p class="km-sheet-sub">Le plat disparaît d’OrderPro et de l’app équipe. Il revient tout seul à l’heure choisie.</p><div class="km-sheet-opts"><button type="button" data-km-until="none">Jusqu’à nouvel ordre</button><button type="button" data-km-until="hour">Pendant 1 heure</button><button type="button" data-km-until="service">Jusqu’à la fin du service</button></div><form class="km-sheet-time" id="km-sheet-time"><label for="km-until-clock">Jusqu’à</label><input id="km-until-clock" type="time" required><button type="submit">Valider</button></form><button type="button" class="km-sheet-cancel" data-km-until="cancel">Annuler</button></div></div>';
    document.body.appendChild(screen);

    /* Structure only, so the screen works wherever the module loads: the sheet
       floats over the screen and the list scrolls. The look lives in
       assets/caisse-screens.css (#menu-availability-screen). */
    const style = document.createElement('style');
    style.textContent = '.km-body{flex:1;min-height:0;overflow:auto}.km-sheet{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;padding:20px}.km-sheet[hidden]{display:none}';
    document.head.appendChild(style);
    button.addEventListener('click', open);
    screen.querySelector('#menu-availability-close').addEventListener('click', close);
    screen.querySelector('#km-search').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); render(); });
    screen.querySelector('#km-cats').addEventListener('click', (e) => {
      const v = e.target.closest('[data-km-view]');
      if (v) { view = v.dataset.kmView; return render(); }
      const b = e.target.closest('[data-km-cat]'); if (!b) return; category = b.dataset.kmCat; render();
    });
    screen.querySelector('#km-body').addEventListener('click', (e) => {
      const back = e.target.closest('[data-km-restore]');
      if (back) return save(back.dataset.kmRestore, true, null);
      const b = e.target.closest('[data-km-toggle]'); if (b) toggle(b.dataset.kmToggle);
    });
    screen.querySelector('#km-sheet').addEventListener('click', (e) => {
      const b = e.target.closest('[data-km-until]');
      if (!b && e.target.id !== 'km-sheet') return;
      const kind = b ? b.dataset.kmUntil : 'cancel';
      const now = Date.now();
      if (kind === 'cancel') return closeSheet();
      hideItem(kind === 'hour' ? now + 3600e3 : kind === 'service' ? endOfService(now) : null);
    });
    screen.querySelector('#km-sheet-time').addEventListener('submit', (e) => {
      e.preventDefault();
      const until = nextClock(screen.querySelector('#km-until-clock').value, Date.now());
      if (until) hideItem(until);
    });
    document.addEventListener('kiwi-paired', refreshBadge);
    document.addEventListener('kiwi-config', () => { button.hidden = !restaurant(); refreshBadge(); });
    if (window.lucide) window.lucide.createIcons();
    button.hidden = !restaurant();
    refreshBadge();
  }

  async function fetchMenu() {
    const slug = merchant();
    if (!slug) throw new Error('merchant-required');
    const response = await fetch('/api/menu?merchant=' + encodeURIComponent(slug), { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('menu-read-failed');
    const payload = await response.json();
    if (!payload.menu) throw new Error('menu-not-published');
    menu = payload.menu;
    return menu;
  }

  async function refreshBadge() {
    if (!restaurant()) return;
    updateBadge();
    if (!merchant()) return;
    try { await fetchMenu(); updateBadge(); } catch (_) {}
  }
  function updateBadge() {
    const badge = document.getElementById('menu-unavailable-count');
    if (!badge) return;
    const count = menu ? managedItems().length : window.KiwiCaisseCarte?.itemCount?.();
    badge.hidden = count == null;
    badge.textContent = count == null ? '' : String(count);
  }
  async function open() {
    const screen = document.getElementById('menu-availability-screen');
    screen.classList.add('is-open');
    screen.querySelector('#km-body').innerHTML = '<div class="km-empty">Chargement du menu…</div>';
    try { await fetchMenu(); render(); }
    catch (_) { screen.querySelector('#km-body').innerHTML = '<div class="km-empty">Le menu publié est indisponible. Vérifiez la connexion puis réessayez.</div>'; }
  }
  function close() { closeSheet(); document.getElementById('menu-availability-screen')?.classList.remove('is-open'); }
  let pending = null;
  function openSheet(item) {
    pending = String(item.id);
    const sheet = document.getElementById('km-sheet');
    sheet.querySelector('#km-sheet-title').textContent = 'Masquer « ' + String(item.name || '') + ' »';
    const inHour = new Date(Date.now() + 3600e3);
    sheet.querySelector('#km-until-clock').value = pad2(inHour.getHours()) + ':00';
    sheet.hidden = false;
    sheet.querySelector('[data-km-until="none"]').focus();
  }
  function closeSheet() {
    pending = null;
    const sheet = document.getElementById('km-sheet');
    if (sheet) sheet.hidden = true;
  }
  function hideItem(until) {
    const id = pending;
    closeSheet();
    if (id) save(id, false, until);
  }
  /* The dish's photo when it has one, else its initial on the sunk tile. */
  function thumb(it) {
    const src = String(it.photo || '');
    if (/^(?:https?:\/\/[^"'<>\s]+|\/?\w[\w./%?=&-]*)$/.test(src)) return '<span class="km-thumb"><img src="' + esc(src) + '" alt="" loading="lazy"></span>';
    return '<span class="km-thumb" aria-hidden="true">' + esc(String(it.name || '?').trim().charAt(0).toUpperCase()) + '</span>';
  }
  function card(it, catLabel) {
    const off = it.avail === false;
    const timed = off && it.availUntil > Date.now();
    const meta = (catLabel ? esc(catLabel) + ' · ' : '') + Math.round(Number(it.price) || 0) + ' MAD' + (timed ? ' · <span class="km-back">' + esc(returnLabel(it.availUntil, Date.now())) + '</span>' : '');
    return '<article class="km-card' + (off ? ' is-off' : '') + '">' + thumb(it) + '<div class="km-info"><div class="km-name">' + esc(it.name) + (off && !timed ? '<span class="km-flag">Épuisé</span>' : '') + '</div><div class="km-meta">' + meta + '</div></div><button type="button" class="km-switch ' + (off ? '' : 'on') + '" data-km-toggle="' + esc(it.id) + '" aria-label="' + (off ? 'Rendre disponible ' : 'Masquer ') + esc(it.name) + '" aria-pressed="' + (off ? 'false' : 'true') + '" ' + (busy.has(String(it.id)) ? 'disabled' : '') + '></button></article>';
  }
  function render() {
    if (!menu) return;
    const cats = Array.isArray(menu.cats) ? menu.cats : [];
    const catName = new Map(cats.map((c) => [String(c.id), String(c.name || 'Sans catégorie')]));
    const live = managedItems().filter((it) => it && !it.archived);
    const offList = live.filter((it) => it.avail === false);
    const items = live.filter((it) => (!query || String(it.name || '').toLowerCase().includes(query)) && (category === 'all' || String(it.catId || '') === category) && (view === 'all' || (view === 'off') === (it.avail === false)));
    /* One row of filters: what to show (all, available, hidden), then the categories. */
    const seg = (v, label, n) => '<button type="button" class="' + (view === v ? 'on' : '') + '" data-km-view="' + v + '" aria-pressed="' + (view === v) + '">' + label + (n == null ? '' : ' <b>' + n + '</b>') + '</button>';
    document.getElementById('km-cats').innerHTML = '<div class="km-view" role="group">' + seg('all', 'Tout', live.length) + seg('on', 'Disponibles', live.length - offList.length) + seg('off', 'Masqués', offList.length) + '</div>' + '<button class="km-cat ' + (category === 'all' ? 'on' : '') + '" data-km-cat="all">Toutes</button>' + cats.map((c) => '<button class="km-cat ' + (category === String(c.id) ? 'on' : '') + '" data-km-cat="' + esc(c.id) + '">' + esc(c.name) + '</button>').join('');
    const unavailable = managedItems().filter((it) => it && it.avail === false).length;
    const summary = document.getElementById('km-summary');
    summary.classList.toggle('has-off', unavailable > 0);
    summary.textContent = unavailable ? unavailable + ' indisponible' + (unavailable > 1 ? 's' : '') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Tout est disponible');
    /* Sold out right now, at the top: one tap brings a dish back. */
    const strip = offList.length && view === 'all' && !query ? '<div class="km-out"><div class="km-out-h"><i data-icon="block"></i><span>Épuisés en ce moment</span></div><div class="km-out-list">' + offList.map((it) => '<button type="button" class="km-out-it" data-km-restore="' + esc(it.id) + '" ' + (busy.has(String(it.id)) ? 'disabled' : '') + '><span>' + esc(it.name) + '</span>' + (it.availUntil > Date.now() ? '<small>' + esc(returnLabel(it.availUntil, Date.now())) + '</small>' : '') + '<span class="km-out-go"><i data-icon="undo"></i></span></button>').join('') + '</div></div>' : '';
    /* Grouped by category while every category shows; one grid once a category is picked. */
    let body = '';
    if (!items.length) body = '<div class="km-empty">Aucun article trouvé.</div>';
    else if (category !== 'all' || query) body = '<div class="km-grid">' + items.map((it) => card(it, catName.get(String(it.catId || '')) || 'Sans catégorie')).join('') + '</div>';
    else {
      const order = cats.map((c) => String(c.id));
      const groups = new Map(order.map((id) => [id, []]));
      items.forEach((it) => { const k = groups.has(String(it.catId || '')) ? String(it.catId) : ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); });
      groups.forEach((list, id) => { if (list.length) body += '<div class="km-group"><h4 class="km-group-h">' + esc(catName.get(id) || 'Sans catégorie') + ' <span>' + list.length + '</span></h4><div class="km-grid">' + list.map((it) => card(it, '')).join('') + '</div></div>'; });
    }
    document.getElementById('km-body').innerHTML = strip + body;
    if (window.lucide) window.lucide.createIcons();
    updateBadge();
  }
  function toggle(id) {
    if (!menu || busy.has(id)) return;
    const item = managedItems().find((x) => String(x.id) === String(id));
    if (!item) return;
    if (item.avail === false) save(id, true, null);
    else openSheet(item);
  }
  async function save(id, available, until) {
    const item = managedItems().find((x) => String(x.id) === String(id));
    if (!menu || !item || busy.has(id)) return;
    busy.add(id); render();
    try {
      const body = { merchant: merchant(), itemId: id, available };
      if (until) body.until = until;
      const response = await fetch('/api/menu/availability', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'save-failed');
      item.avail = available;
      if (until) item.availUntil = until; else delete item.availUntil;
      document.dispatchEvent(new CustomEvent('kiwi-menu-availability', { detail: { itemId: id, available, until: until || null } }));
      if (window.Kiwi?.toast) window.Kiwi.toast(available ? item.name + ' est de nouveau disponible' : item.name + ' masqué sur OrderPro et l’app équipe' + (until ? ' · ' + returnLabel(until, Date.now()).toLowerCase() : ''));
    } catch (_) {
      if (window.Kiwi?.toast) window.Kiwi.toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Modification non enregistrée · vérifiez la connexion'), { type: 'warning' });
      try { await fetchMenu(); } catch (_) {}
    } finally { busy.delete(id); render(); }
  }

  /* Le test lit ces trois calculs sans navigateur. */
  window.KiwiMenuAvailability = { endOfService, nextClock, returnLabel };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
}());
