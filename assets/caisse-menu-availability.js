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
    screen.innerHTML = '<div class="kds-head"><div class="kds-head-l"><h2>Menu</h2><div class="sub">Masquez immédiatement les articles épuisés</div></div><button class="kds-close" id="menu-availability-close"><i data-lucide="x"></i><span>Fermer</span></button></div><div class="km-tools"><label class="km-search"><i data-lucide="search"></i><input id="km-search" type="search" placeholder="Rechercher un article…" autocomplete="off"></label><div class="km-summary" id="km-summary"></div></div><div class="km-cats" id="km-cats"></div><div class="km-body" id="km-body"></div><div class="km-sheet" id="km-sheet" role="dialog" aria-modal="true" aria-labelledby="km-sheet-title" hidden><div class="km-sheet-card"><h3 id="km-sheet-title"></h3><p class="km-sheet-sub">Le plat disparaît d’OrderPro et de l’app équipe. Il revient tout seul à l’heure choisie.</p><div class="km-sheet-opts"><button type="button" data-km-until="none">Jusqu’à nouvel ordre</button><button type="button" data-km-until="hour">Pendant 1 heure</button><button type="button" data-km-until="service">Jusqu’à la fin du service</button></div><form class="km-sheet-time" id="km-sheet-time"><label for="km-until-clock">Jusqu’à</label><input id="km-until-clock" type="time" required><button type="submit">Valider</button></form><button type="button" class="km-sheet-cancel" data-km-until="cancel">Annuler</button></div></div>';
    document.body.appendChild(screen);

    const style = document.createElement('style');
    style.textContent = '.km-screen{background:var(--paper,#f7f6f2)}.km-tools{display:flex;align-items:center;gap:16px;padding:20px 28px 12px}.km-search{height:48px;max-width:520px;flex:1;display:flex;align-items:center;gap:10px;padding:0 16px;border:1px solid var(--line,#ddd);border-radius:14px;background:var(--surface,#fff)}.km-search svg{width:18px}.km-search input{border:0;outline:0;background:transparent;width:100%;font-family:inherit;font-size:15px;font-weight:500;color:inherit}.km-summary{margin-left:auto;color:var(--ink-3,#667);font-size:13px}.km-cats{display:flex;gap:8px;overflow:auto;padding:4px 28px 16px}.km-cat{white-space:nowrap;padding:9px 14px;border:1px solid var(--line,#ddd);border-radius:999px;background:var(--surface,#fff);font-weight:650}.km-cat.on{background:var(--fill-strong,#101a15);color:var(--on-strong,#fff);border-color:transparent}.km-body{padding:0 28px 32px;overflow:auto;height:calc(100% - 174px)}.km-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}.km-card{display:flex;align-items:center;gap:14px;min-height:82px;padding:14px 16px;border:1px solid var(--line,#ddd);border-radius:18px;background:var(--surface,#fff);box-shadow:0 4px 18px rgba(14,35,24,.04)}.km-info{min-width:0;flex:1}.km-name{font-size:16px;font-weight:720;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.km-meta{font-size:12px;color:var(--ink-3,#667);margin-top:5px}.km-switch{width:54px;height:32px;border-radius:999px;background:#d7d9d7;padding:3px;transition:.2s}.km-switch:before{content:"";display:block;width:26px;height:26px;border-radius:50%;background:white;box-shadow:0 1px 4px #0003;transition:.2s}.km-switch.on{background:var(--emerald,#0b7d55)}.km-switch.on:before{transform:translateX(22px)}.km-switch[disabled]{opacity:.55}.km-empty{padding:70px 20px;text-align:center;color:var(--ink-3,#667)}.km-back{color:var(--emerald,#0b7d55);font-weight:650}.km-sheet{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,15,13,.42);z-index:3}.km-sheet[hidden]{display:none}.km-sheet-card{width:min(420px,100%);padding:22px;border-radius:22px;background:var(--surface,#f7f5f0);box-shadow:0 18px 48px rgba(10,15,13,.22)}.km-sheet-card h3{margin:0;font-size:19px;font-weight:700}.km-sheet-sub{margin:6px 0 16px;color:var(--ink-3,#667);font-size:13px;line-height:1.45}.km-sheet-opts{display:grid;gap:8px}.km-sheet-opts button,.km-sheet-time button,.km-sheet-cancel{min-height:48px;border-radius:14px;border:1px solid var(--line,#ddd);background:var(--paper,#f7f5f0);font:inherit;font-size:15px;font-weight:650;color:inherit;text-align:start;padding:0 16px}.km-sheet-time{display:flex;align-items:center;gap:10px;margin-top:8px}.km-sheet-time label{font-weight:650}.km-sheet-time input{flex:1;min-height:48px;border-radius:14px;border:1px solid var(--line,#ddd);background:var(--paper,#f7f5f0);font:inherit;font-size:16px;padding:0 12px;color:inherit}.km-sheet-time button{text-align:center}.km-sheet-cancel{width:100%;margin-top:12px;text-align:center;background:transparent;border-color:transparent;color:var(--ink-3,#667)}';
    document.head.appendChild(style);

    button.addEventListener('click', open);
    screen.querySelector('#menu-availability-close').addEventListener('click', close);
    screen.querySelector('#km-search').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); render(); });
    screen.querySelector('#km-cats').addEventListener('click', (e) => { const b = e.target.closest('[data-km-cat]'); if (!b) return; category = b.dataset.kmCat; render(); });
    screen.querySelector('#km-body').addEventListener('click', (e) => { const b = e.target.closest('[data-km-toggle]'); if (b) toggle(b.dataset.kmToggle); });
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
  function render() {
    if (!menu) return;
    const cats = Array.isArray(menu.cats) ? menu.cats : [];
    const catName = new Map(cats.map((c) => [String(c.id), String(c.name || 'Sans catégorie')]));
    const items = managedItems().filter((it) => it && !it.archived && (!query || String(it.name || '').toLowerCase().includes(query)) && (category === 'all' || String(it.catId || '') === category));
    document.getElementById('km-cats').innerHTML = '<button class="km-cat ' + (category === 'all' ? 'on' : '') + '" data-km-cat="all">Tout</button>' + cats.map((c) => '<button class="km-cat ' + (category === String(c.id) ? 'on' : '') + '" data-km-cat="' + esc(c.id) + '">' + esc(c.name) + '</button>').join('');
    const unavailable = managedItems().filter((it) => it && it.avail === false).length;
    document.getElementById('km-summary').textContent = unavailable ? unavailable + ' indisponible' + (unavailable > 1 ? 's' : '') : 'Tout est disponible';
    document.getElementById('km-body').innerHTML = items.length ? '<div class="km-grid">' + items.map((it) => '<article class="km-card"><div class="km-info"><div class="km-name">' + esc(it.name) + '</div><div class="km-meta">' + esc(catName.get(String(it.catId || '')) || 'Sans catégorie') + ' · ' + Math.round(Number(it.price) || 0) + ' MAD' + (it.avail === false && it.availUntil > Date.now() ? ' · <span class="km-back">' + esc(returnLabel(it.availUntil, Date.now())) + '</span>' : '') + '</div></div><button type="button" class="km-switch ' + (it.avail === false ? '' : 'on') + '" data-km-toggle="' + esc(it.id) + '" aria-label="' + (it.avail === false ? 'Rendre disponible ' : 'Masquer ') + esc(it.name) + '" aria-pressed="' + (it.avail === false ? 'false' : 'true') + '" ' + (busy.has(String(it.id)) ? 'disabled' : '') + '></button></article>').join('') + '</div>' : '<div class="km-empty">Aucun article trouvé.</div>';
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
      if (window.Kiwi?.toast) window.Kiwi.toast('Modification non enregistrée · vérifiez la connexion', { type: 'warning' });
      try { await fetchMenu(); } catch (_) {}
    } finally { busy.delete(id); render(); }
  }

  /* Le test lit ces trois calculs sans navigateur. */
  window.KiwiMenuAvailability = { endOfService, nextClock, returnLabel };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
}());
