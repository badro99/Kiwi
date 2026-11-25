/* Accords du patron, côté tableau de bord (Browse, 25 nov. 2026).
 *
 * La caisse demande (assets/owner-approval.js), le patron décide ici ou sur
 * son téléphone (functions/api/approvals.js). Ce fichier fait trois choses :
 *  · le panneau Réglages › Accords du patron : ce qui demande son accord
 *    (sorties d'espèces, annulations), le code d'un responsable en secours,
 *    un seuil, et « recevoir les demandes sur ce téléphone » dans l'app Kiwi Pro ;
 *  · une carte Accepter / Refuser pour chaque demande en attente, tant que le
 *    tableau de bord est ouvert (le téléphone sonne aussi, s'il est inscrit) ;
 *  · KiwiOwnerApprovals.focus(id), que l'app appelle quand on touche la
 *    notification.
 * Le serveur seul dit qui est le patron : un 403 arrête tout, sans bruit.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined' || window.KiwiOwnerApprovals) return;

  var POLL_MS = 15000, IDLE_POLL_MS = 60000, PUSH_KEY = 'kiwiOwnerApprovalPush';
  var COPY = {
    fr: {
      title: 'Accords du patron', subtitle: 'Ce que la caisse vous demande avant d’agir',
      what: 'Ce qui demande votre accord',
      cashOut: 'Sorties d’espèces', cashOutHint: 'Rien ne sort du tiroir avant votre accord. La caisse continue de vendre.',
      cancel: 'Annulations', cancelHint: 'Ventes encaissées et plats déjà envoyés en cuisine. La caisse attend une minute.',
      fallback: 'Sans réponse, le code d’un responsable', fallbackHint: 'Après une minute, le code d’un responsable reprend la main.',
      min: 'À partir de', minHint: 'MAD. 0 : toujours demander.',
      phone: 'Ce téléphone', phoneRow: 'Recevoir les demandes ici', phoneHint: 'Une notification avec Accepter et Refuser.',
      phoneApp: 'Dans l’app Kiwi Pro sur votre téléphone, activez « Recevoir les demandes ici ».',
      devices: '{n} téléphone(s) reçoivent les demandes.', noDevice: 'Aucun téléphone ne reçoit les demandes : elles s’affichent seulement ici, tableau de bord ouvert.',
      pending: 'En attente', recent: 'Dernières 24 h', none: 'Aucune demande.',
      accept: 'Accepter', refuse: 'Refuser', later: 'Plus tard',
      asks: '{who} demande votre accord', till: 'La caisse',
      'cash-out': 'Sortie de caisse', 'void-sent': 'Annulation en cuisine', 'cancel-sale': 'Annulation de vente', 'cancel-table': 'Annulation de table', 'cancel-order': 'Annulation de bon',
      st_pending: 'En attente', st_approved: 'Acceptée', st_granted: 'Acceptée', st_used: 'Faite', st_refused: 'Refusée', st_expired: 'Expirée', st_withdrawn: 'Retirée',
      accepted: 'Accepté. La caisse continue.', refused: 'Refusé. Rien n’a bougé.', already: 'Cette demande a déjà une réponse.',
      ownerOnly: 'Seul le propriétaire du compte décide des accords.', onTill: 'Cet appareil est une caisse : décidez depuis votre téléphone ou un autre appareil.', noShop: 'Reliez d’abord une caisse à ce compte.',
      failed: 'Impossible pour le moment. Réessayez.', saved: 'Enregistré.',
      phoneOn: 'Ce téléphone reçoit les demandes.', phoneOff: 'Ce téléphone ne reçoit plus les demandes.',
      denied: 'Autorisez les notifications pour Kiwi Pro dans les Réglages de l’iPhone.',
    },
    en: {
      title: 'Owner approvals', subtitle: 'What the till asks you before acting',
      what: 'What needs your approval',
      cashOut: 'Cash outs', cashOutHint: 'Nothing leaves the drawer until you approve. The till keeps selling.',
      cancel: 'Cancellations', cancelHint: 'Paid sales and dishes already sent to the kitchen. The till waits one minute.',
      fallback: 'No answer: a manager code', fallbackHint: 'After one minute, a manager code can take over.',
      min: 'From', minHint: 'MAD. 0: always ask.',
      phone: 'This phone', phoneRow: 'Receive requests here', phoneHint: 'A notification with Approve and Refuse.',
      phoneApp: 'In the Kiwi Pro app on your phone, turn on “Receive requests here”.',
      devices: '{n} phone(s) receive requests.', noDevice: 'No phone receives requests: they only show here while the dashboard is open.',
      pending: 'Waiting', recent: 'Last 24 h', none: 'No requests.',
      accept: 'Approve', refuse: 'Refuse', later: 'Later',
      asks: '{who} asks for your approval', till: 'The till',
      'cash-out': 'Cash out', 'void-sent': 'Kitchen cancellation', 'cancel-sale': 'Sale cancellation', 'cancel-table': 'Table cancellation', 'cancel-order': 'Ticket cancellation',
      st_pending: 'Waiting', st_approved: 'Approved', st_granted: 'Approved', st_used: 'Done', st_refused: 'Refused', st_expired: 'Expired', st_withdrawn: 'Withdrawn',
      accepted: 'Approved. The till carries on.', refused: 'Refused. Nothing changed.', already: 'This request already has an answer.',
      ownerOnly: 'Only the account owner decides approvals.', onTill: 'This device is a till: decide from your phone or another device.', noShop: 'Link a till to this account first.',
      failed: 'Not possible right now. Try again.', saved: 'Saved.',
      phoneOn: 'This phone receives requests.', phoneOff: 'This phone no longer receives requests.',
      denied: 'Allow notifications for Kiwi Pro in iPhone Settings.',
    },
    ar: {
      title: 'موافقات المالك', subtitle: 'ما يطلبه الصندوق منك قبل التنفيذ',
      what: 'ما يحتاج إلى موافقتك',
      cashOut: 'السحوبات النقدية', cashOutHint: 'لا يخرج شيء من الدرج قبل موافقتك. ويواصل الصندوق البيع.',
      cancel: 'الإلغاءات', cancelHint: 'المبيعات المحصّلة والأطباق المرسلة إلى المطبخ. ينتظر الصندوق دقيقة واحدة.',
      fallback: 'عند عدم الرد، رمز المسؤول', fallbackHint: 'بعد دقيقة، يمكن لرمز المسؤول أن يتولى الأمر.',
      min: 'ابتداءً من', minHint: 'درهم. 0: الطلب دائماً.',
      phone: 'هذا الهاتف', phoneRow: 'استقبال الطلبات هنا', phoneHint: 'إشعار مع زرّي القبول والرفض.',
      phoneApp: 'في تطبيق Kiwi Pro على هاتفك، فعّل «استقبال الطلبات هنا».',
      devices: '{n} هاتف يستقبل الطلبات.', noDevice: 'لا يستقبل أي هاتف الطلبات: تظهر هنا فقط ولوحة التحكم مفتوحة.',
      pending: 'قيد الانتظار', recent: 'آخر 24 ساعة', none: 'لا توجد طلبات.',
      accept: 'قبول', refuse: 'رفض', later: 'لاحقاً',
      asks: '{who} يطلب موافقتك', till: 'الصندوق',
      'cash-out': 'سحب نقدي', 'void-sent': 'إلغاء في المطبخ', 'cancel-sale': 'إلغاء بيع', 'cancel-table': 'إلغاء طاولة', 'cancel-order': 'إلغاء طلب',
      st_pending: 'قيد الانتظار', st_approved: 'مقبول', st_granted: 'مقبول', st_used: 'تم', st_refused: 'مرفوض', st_expired: 'منتهي', st_withdrawn: 'مسحوب',
      accepted: 'تم القبول. يواصل الصندوق.', refused: 'تم الرفض. لم يتغير شيء.', already: 'هذا الطلب لديه رد مسبقاً.',
      ownerOnly: 'مالك الحساب وحده يقرر الموافقات.', onTill: 'هذا الجهاز صندوق: قرّر من هاتفك أو من جهاز آخر.', noShop: 'اربط صندوقاً بهذا الحساب أولاً.',
      failed: 'غير ممكن حالياً. أعد المحاولة.', saved: 'تم الحفظ.',
      phoneOn: 'هذا الهاتف يستقبل الطلبات.', phoneOff: 'هذا الهاتف لم يعد يستقبل الطلبات.',
      denied: 'اسمح بالإشعارات لتطبيق Kiwi Pro من إعدادات الهاتف.',
    },
  };

  var state = { settings: null, items: [], devices: 0, forbidden: false, timer: null, busy: false, dismissed: {}, drawer: null };

  function lang() {
    var v = '';
    try { v = String(document.documentElement.lang || localStorage.getItem('kiwiLang') || 'fr').slice(0, 2); } catch (_) { v = 'fr'; }
    return COPY[v] ? v : 'fr';
  }
  function t(key, vars) {
    var s = (COPY[lang()] || COPY.fr)[key] || COPY.fr[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }
  function merchant() { try { return String((window.KiwiLive && window.KiwiLive.merchant && window.KiwiLive.merchant()) || '').trim().toLowerCase(); } catch (_) { return ''; } }
  function ownerRole() { try { var F = window.KiwiFeatureTruth; return !F || !F.role || F.role() === 'owner'; } catch (_) { return false; } }
  function toast(msg, type) { try { if (window.Kiwi && window.Kiwi.toast) window.Kiwi.toast(msg, { type: type || 'info' }); } catch (_) {} }
  function mad(cents) {
    var v = (Number(cents) || 0) / 100;
    var s = v % 1 === 0 ? String(v) : v.toFixed(2).replace('.', ',');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' MAD';
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function headline(item) { return t(item.kind) + (item.amountCents > 0 ? ' · ' + mad(item.amountCents) : ''); }
  function detail(item) { return t('asks', { who: item.requestedBy || t('till') }) + (item.label ? ' · ' + item.label : ''); }

  function api(method, query, body) {
    var m = merchant();
    if (!m || typeof fetch !== 'function') return Promise.reject({ code: 'no-shop' });
    var url = '/api/approvals?merchant=' + encodeURIComponent(m) + (query ? '&' + query : '');
    var init = { method: method, credentials: 'same-origin', cache: 'no-store' };
    if (body) { init.headers = { 'Content-Type': 'application/json' }; init.body = JSON.stringify(Object.assign({ merchant: m }, body)); url = '/api/approvals'; }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { if (r.status === 403) state.forbidden = true; throw { code: (j && j.error) || 'http-' + r.status, status: r.status, body: j }; }
        state.forbidden = false;
        return j;
      });
    });
  }

  /* ── Les demandes en attente, tableau de bord ouvert ── */
  function load() {
    return api('GET', 'list=1').then(function (j) {
      state.settings = j.settings || state.settings;
      state.items = Array.isArray(j.items) ? j.items : [];
      state.devices = Number(j.devices) || 0;
      paintCards();
      paintDrawer();
      return j;
    });
  }
  function active() { var s = state.settings; return !!(s && (s.cashOut || s.cancel)); }
  function schedule(ms) {
    clearTimeout(state.timer);
    if (state.forbidden) return;
    state.timer = setTimeout(tick, ms);
  }
  function tick() {
    if (document.visibilityState === 'hidden' || !merchant() || !ownerRole()) { schedule(IDLE_POLL_MS); return; }
    load().then(function () { schedule(active() || pendingItems().length ? POLL_MS : IDLE_POLL_MS); },
      function (err) { if (err && err.status === 403) return; schedule(IDLE_POLL_MS); });
  }
  function pendingItems() { return state.items.filter(function (i) { return i.status === 'pending'; }); }

  function css() {
    if (document.getElementById('koa-css')) return;
    var s = el('style');
    s.id = 'koa-css';
    s.textContent =
      '#koa-cards{position:fixed;inset-inline-end:16px;bottom:16px;z-index:1300;display:flex;flex-direction:column;gap:10px;width:min(360px,calc(100vw - 32px))}' +
      '.koa-card{background:var(--surface,var(--paper));color:var(--ink);border:1px solid var(--n-200);border-radius:16px;padding:14px 16px;box-shadow:0 12px 32px rgba(10,15,13,.16)}' +
      '.koa-card h4{margin:0 0 4px;font-size:15px;font-weight:600;letter-spacing:-.01em}' +
      '.koa-card p{margin:0 0 12px;font-size:13px;color:var(--n-600);line-height:1.4}' +
      '.koa-acts{display:flex;gap:8px}' +
      '.koa-btn{flex:1;min-height:40px;border-radius:10px;border:1px solid var(--n-200);background:transparent;color:var(--ink);font:600 13.5px/1 var(--sans);cursor:pointer}' +
      '.koa-btn.is-go{background:var(--atlas);border-color:var(--atlas);color:var(--paper)}' +
      '.koa-btn.is-quiet{flex:0 0 auto;padding:0 12px;border-color:transparent;color:var(--n-600)}' +
      '.koa-btn[disabled]{opacity:.5;cursor:default}' +
      '.koa-sec{margin:0 0 20px}' +
      '.koa-sec h5{margin:0 0 8px;font-size:12px;font-weight:600;color:var(--n-600);letter-spacing:.02em;text-transform:uppercase}' +
      '.koa-min{display:flex;align-items:center;gap:10px;padding:12px 4px}' +
      '.koa-min input{width:110px;padding:9px 11px;border:1px solid var(--n-200);border-radius:10px;background:var(--surface,var(--paper));color:var(--ink);font:500 14px var(--sans)}' +
      '.koa-note{font-size:12.5px;color:var(--n-600);line-height:1.45;margin:6px 4px 0}' +
      '.koa-item{padding:12px 4px;border-top:1px solid var(--n-200)}' +
      '.koa-item:first-child{border-top:0}' +
      '.koa-item h6{margin:0 0 2px;font-size:14px;font-weight:600}' +
      '.koa-item p{margin:0 0 8px;font-size:12.5px;color:var(--n-600)}' +
      '.koa-chip{display:inline-block;font-size:11.5px;font-weight:600;color:var(--n-600);border:1px solid var(--n-200);border-radius:999px;padding:2px 8px}';
    document.head.appendChild(s);
  }

  function errKey(err) {
    var c = err && err.code;
    return c === 'owner-on-till' ? 'onTill' : c === 'owner-only' ? 'ownerOnly' : c === 'denied' ? 'denied' : c === 'already-decided' ? 'already' : 'failed';
  }
  function decide(item, verdict, buttons) {
    buttons.forEach(function (b) { b.disabled = true; });
    return api('POST', '', { action: 'decide', id: item.id, verdict: verdict }).then(function () {
      toast(t(verdict === 'approve' ? 'accepted' : 'refused'), 'success');
      return load();
    }, function (err) {
      buttons.forEach(function (b) { b.disabled = false; });
      toast(t(errKey(err)), 'danger');
      if (err && err.code === 'already-decided') load().catch(function () {});
    });
  }
  function actions(item, withLater) {
    var row = el('div', 'koa-acts');
    var no = el('button', 'koa-btn', t('refuse'));
    var yes = el('button', 'koa-btn is-go', t('accept'));
    no.type = yes.type = 'button';
    var all = [no, yes];
    no.addEventListener('click', function () { decide(item, 'refuse', all); });
    yes.addEventListener('click', function () { decide(item, 'approve', all); });
    if (withLater) {
      var later = el('button', 'koa-btn is-quiet', t('later'));
      later.type = 'button';
      later.addEventListener('click', function () { state.dismissed[item.id] = true; paintCards(); });
      row.appendChild(later);
    }
    row.appendChild(no); row.appendChild(yes);
    return row;
  }
  function paintCards() {
    var host = document.getElementById('koa-cards');
    var list = state.drawer ? [] : pendingItems().filter(function (i) { return !state.dismissed[i.id]; }).slice(0, 3);
    if (!list.length) { if (host) host.remove(); return; }
    css();
    if (!host) {
      host = el('div');
      host.id = 'koa-cards';
      host.setAttribute('role', 'region');
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-label', t('title'));
      document.body.appendChild(host);
    }
    host.textContent = '';
    list.forEach(function (item) {
      var card = el('div', 'koa-card');
      card.appendChild(el('h4', '', headline(item)));
      card.appendChild(el('p', '', detail(item)));
      card.appendChild(actions(item, true));
      host.appendChild(card);
    });
  }

  /* ── Le panneau ── */
  function toggleRow(key, label, hint, on) {
    var row = el('div', 'kset-row');
    row.setAttribute('role', 'switch');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-checked', on ? 'true' : 'false');
    row.setAttribute('data-koa-toggle', key);
    var text = el('div');
    text.style.cssText = 'flex:1;min-width:0';
    var l = el('div', '', label);
    l.style.cssText = 'font-size:13.5px;font-weight:600;letter-spacing:-0.01em';
    var h = el('div', '', hint);
    h.style.cssText = 'font-size:12px;color:var(--n-500);margin-top:2px;line-height:1.4';
    text.appendChild(l); text.appendChild(h);
    var sw = el('div', 'kset-toggle' + (on ? ' on' : ''));
    sw.appendChild(el('div', 'kset-knob'));
    row.appendChild(text); row.appendChild(sw);
    return row;
  }
  function section(title) {
    var s = el('div', 'koa-sec');
    s.appendChild(el('h5', '', title));
    return s;
  }
  function paintDrawer() {
    var d = state.drawer;
    if (!d) return;
    var body = d.el.querySelector('.kiwi-drawer-body');
    if (!body) return;
    var s = state.settings || { cashOut: false, cancel: false, managerFallback: true, minCents: 0 };
    var keepFocus = document.activeElement && body.contains(document.activeElement) ? document.activeElement.getAttribute('data-koa-toggle') || (document.activeElement.id === 'koa-min' ? 'min' : '') : '';
    body.textContent = '';

    var what = section(t('what'));
    what.appendChild(toggleRow('cashOut', t('cashOut'), t('cashOutHint'), s.cashOut));
    what.appendChild(toggleRow('cancel', t('cancel'), t('cancelHint'), s.cancel));
    what.appendChild(toggleRow('managerFallback', t('fallback'), t('fallbackHint'), s.managerFallback));
    var min = el('label', 'koa-min');
    min.appendChild(el('span', '', t('min')));
    var input = el('input');
    input.id = 'koa-min';
    input.type = 'number'; input.min = '0'; input.step = '1'; input.inputMode = 'numeric';
    input.value = String(Math.round((Number(s.minCents) || 0) / 100));
    min.appendChild(input);
    min.appendChild(el('span', 'koa-note', t('minHint')));
    what.appendChild(min);
    body.appendChild(what);

    var phone = section(t('phone'));
    if (nativePush()) phone.appendChild(toggleRow('phone', t('phoneRow'), t('phoneHint'), phoneOn()));
    else phone.appendChild(el('p', 'koa-note', t('phoneApp')));
    phone.appendChild(el('p', 'koa-note', state.devices ? t('devices', { n: String(state.devices) }) : t('noDevice')));
    body.appendChild(phone);

    var waiting = pendingItems();
    var wait = section(t('pending'));
    if (!waiting.length) wait.appendChild(el('p', 'koa-note', t('none')));
    waiting.forEach(function (item) {
      var row = el('div', 'koa-item');
      row.appendChild(el('h6', '', headline(item)));
      row.appendChild(el('p', '', detail(item)));
      row.appendChild(actions(item, false));
      wait.appendChild(row);
    });
    body.appendChild(wait);

    var done = state.items.filter(function (i) { return i.status !== 'pending'; }).slice(0, 20);
    if (done.length) {
      var recent = section(t('recent'));
      done.forEach(function (item) {
        var row = el('div', 'koa-item');
        row.appendChild(el('h6', '', headline(item)));
        var when = new Date(item.decidedTs || item.createdTs);
        var hm = isNaN(when) ? '' : ' · ' + when.toLocaleTimeString(lang() === 'ar' ? 'ar-MA' : lang(), { hour: '2-digit', minute: '2-digit' });
        row.appendChild(el('p', '', detail(item) + hm));
        row.appendChild(el('span', 'koa-chip', t('st_' + item.status)));
        recent.appendChild(row);
      });
      body.appendChild(recent);
    }

    if (keepFocus === 'min') { var again = body.querySelector('#koa-min'); if (again) again.focus(); }
    else if (keepFocus) { var tg = body.querySelector('[data-koa-toggle="' + keepFocus + '"]'); if (tg) tg.focus(); }
  }
  function saveSettings(next) {
    var before = state.settings;
    state.settings = next;
    paintDrawer();
    return api('POST', '', { action: 'settings', settings: next }).then(function (j) {
      state.settings = j.settings || next;
      paintDrawer();
      schedule(1000);
    }, function (err) {
      state.settings = before;
      paintDrawer();
      toast(t(errKey(err)), 'danger');
    });
  }
  function onDrawerClick(ev) {
    var row = ev.target.closest && ev.target.closest('[data-koa-toggle]');
    if (!row || state.busy) return;
    var key = row.getAttribute('data-koa-toggle');
    if (key === 'phone') { setPhone(!phoneOn()); return; }
    var s = Object.assign({ cashOut: false, cancel: false, managerFallback: true, minCents: 0 }, state.settings || {});
    s[key] = !s[key];
    saveSettings(s);
  }
  function onDrawerKey(ev) {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.getAttribute && ev.target.getAttribute('data-koa-toggle')) { ev.preventDefault(); onDrawerClick(ev); }
    if (ev.key === 'Enter' && ev.target.id === 'koa-min') ev.target.blur();
  }
  function onDrawerChange(ev) {
    if (ev.target.id !== 'koa-min') return;
    var mad0 = Math.max(0, Math.min(1e7, Math.round(Number(ev.target.value) || 0)));
    var s = Object.assign({ cashOut: false, cancel: false, managerFallback: true, minCents: 0 }, state.settings || {});
    if (s.minCents === mad0 * 100) return;
    s.minCents = mad0 * 100;
    saveSettings(s).then(function () { toast(t('saved'), 'success'); });
  }

  function open() {
    if (!window.Kiwi || !window.Kiwi.drawer) return;
    if (!merchant()) { toast(t('noShop')); return; }
    css();
    var d = window.Kiwi.drawer({ title: t('title'), subtitle: t('subtitle'), body: '', width: 460 });
    state.drawer = d;
    paintCards();
    d.el.addEventListener('click', onDrawerClick);
    d.el.addEventListener('keydown', onDrawerKey);
    d.el.addEventListener('change', onDrawerChange);
    var gone = new MutationObserver(function () {
      if (d.el.isConnected) return;
      gone.disconnect();
      if (state.drawer === d) state.drawer = null;
      paintCards();
    });
    gone.observe(document.body, { childList: true });
    paintDrawer();
    load().catch(function (err) {
      if (err && err.status === 403) {
        var body = d.el.querySelector('.kiwi-drawer-body');
        if (body) { body.textContent = ''; body.appendChild(el('p', 'koa-note', t('ownerOnly'))); }
      }
    });
  }

  /* ── Ce téléphone (app Kiwi Pro) ── */
  function nativePush() { return !!(window.__kiwiHostCaps && window.__kiwiHostCaps.push && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kiwiShell); }
  function readPhone() { try { return JSON.parse(localStorage.getItem(PUSH_KEY) || 'null'); } catch (_) { return null; } }
  function writePhone(v) { try { if (v) localStorage.setItem(PUSH_KEY, JSON.stringify(v)); else localStorage.removeItem(PUSH_KEY); } catch (_) {} }
  function phoneOn() { var v = readPhone(); return !!(v && v.token && v.merchant === merchant()); }
  function askToken() {
    return new Promise(function (resolve) {
      var done = false;
      function finish(r) { if (done) return; done = true; window.removeEventListener('kiwi-native-push-result', onResult); resolve(r || { ok: false }); }
      function onResult(ev) { var r = ev && ev.detail; if (r && r.kind === 'enable') finish(r); }
      window.addEventListener('kiwi-native-push-result', onResult);
      setTimeout(function () { finish({ ok: false, reason: 'timeout' }); }, 120000);
      try { window.webkit.messageHandlers.kiwiShell.postMessage({ push: 'enable' }); } catch (_) { finish({ ok: false, reason: 'unavailable' }); }
    });
  }
  function setPhone(want) {
    var m = merchant();
    if (!m || !nativePush()) return;
    state.busy = true;
    var job = want
      ? askToken().then(function (res) {
          if (!res.ok || !res.token) throw { code: res.reason === 'denied' ? 'denied' : 'failed' };
          return api('POST', '', { action: 'device', token: res.token, lang: lang() }).then(function () { writePhone({ merchant: m, token: res.token }); toast(t('phoneOn'), 'success'); });
        })
      : api('POST', '', { action: 'device-remove', token: (readPhone() || {}).token || '' }).then(function () { writePhone(null); toast(t('phoneOff'), 'success'); });
    job.catch(function (err) { toast(t(errKey(err)), 'danger'); })
      .then(function () { state.busy = false; return load(); })
      .catch(function () {});
  }

  window.KiwiOwnerApprovals = {
    open: open,
    refresh: function () { return load(); },
    /* L'app appelle ceci quand on touche la notification d'une demande. */
    focus: function (id) {
      if (id) delete state.dismissed[String(id)];
      load().then(function () { if (!state.drawer && pendingItems().length > 3) open(); }, function () {});
    },
  };

  /* Réglages › Accords du patron (assets/interactive/handlers.js). */
  document.addEventListener('kiwi-owner-approvals-open', open);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !state.forbidden) schedule(500); });
  schedule(5000);
})();
