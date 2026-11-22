/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/channel-glovo.js · Glovo, côté patron (tableau de bord ›
 * Intégrations › Glovo). 22 nov. 2026.
 *
 * Avant : la carte Glovo ouvrait une clé de relais qui ne sert pas à Glovo.
 * Kiwi est intégrateur de l'API Partners (un jeton pour toute l'intégration,
 * functions/api/channel/glovo/) ; ce panneau montre, pour chaque adresse Glovo
 * reliée au magasin :
 *   · ouverte ou fermée, et la fermer 30 min / 1 h / 3 h ou la rouvrir
 *     (POST /api/channel/glovo/till, le patron n'a pas besoin de code) ;
 *   · la carte chez Glovo : dernier envoi, ce que Glovo en a dit, envois du
 *     jour (5 au plus), ce qui partirait et ce qui reste écarté (prix à 0,
 *     formule seulement), et le bouton qui l'envoie (validée d'abord, un menu
 *     refusé ne coûte pas un envoi) ;
 *   · dispo et prix : le dernier lot, et l'envoi immédiat de ce qui a changé.
 * Sans adresse reliée, il dit comment faire relier le magasin.
 *
 * Il prend la main sur la seule action
 * [data-action="integration-connect"][data-channel="glovo"], en capture, comme
 * channel-link.js le fait pour Shopify. Il ne lit aucun module du tableau de
 * bord : Kiwi.modal pour la fenêtre, /api/me pour les magasins, ?op=1&merchant=
 * pour la vue opérateur (le serveur vérifie que l'opérateur y est nommé).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var LANG = function () { try { var l = localStorage.getItem('kiwiLang') || 'fr'; return T[l] ? l : 'fr'; } catch (_) { return 'fr'; } };
  var T = {
    fr: {
      title: 'Glovo', intro: 'Les commandes Glovo arrivent à la caisse comme un ticket en attente ; Kiwi dit à Glovo quand elles sont acceptées puis prêtes.',
      none: 'Ce magasin n’est pas encore relié à Glovo.',
      how: ['Écrivez au support Kiwi avec le nom de votre magasin sur Glovo.', 'Nous relions votre adresse Glovo à Kiwi avec l’équipe Glovo.', 'Revenez ici pour envoyer votre carte à Glovo.'],
      off: 'Glovo n’est pas encore activé pour Kiwi. Le support s’en charge, rien à faire de votre côté.',
      later: 'Ces réglages arrivent avec la prochaine mise à jour de Kiwi. Les commandes Glovo, elles, arrivent déjà.',
      load: 'Impossible de lire l’état de Glovo. Vérifiez la connexion et rouvrez.',
      address: 'Adresse Glovo', courier: 'Coursiers Glovo', market: 'Vos livreurs (Marketplace)',
      open: 'Ouvert', closedUntil: 'Fermé jusqu’à {t}', closeFor: 'Fermer pendant', reopen: 'Rouvrir', h3: '3 h', h1: '1 h', m30: '30 min',
      glovoSaid: 'Dernière réponse de Glovo · {m}',
      menu: 'Carte chez Glovo', never: 'Jamais envoyée.', sentAt: 'Envoyée le {d}', triedAt: 'Essai du {d}', uploads: '{n} envoi(s) sur {max} aujourd’hui',
      preview: '{p} article(s) partiront, dont {u} en rupture.', skipped: 'Écartés', push: 'Envoyer la carte à Glovo',
      pushAsk: 'Envoyer la carte maintenant ? Glovo accepte {max} envois par jour, il en reste {left}.',
      pushed: 'Carte envoyée. Glovo la vérifie, en général en quelques minutes.', limit: 'Les {max} envois du jour sont faits. Réessayez demain ; les ruptures et les prix, eux, partent toujours.',
      invalid: 'Glovo refuse la carte. Corrigez puis renvoyez (cet essai ne compte pas) :', empty: 'La carte publiée est vide ou n’a aucun article vendable.',
      unpublished: 'Publiez d’abord la carte dans Menu.', noHttps: 'Glovo ne lit la carte qu’en https.',
      sync: 'Dispo et prix', syncNow: 'Envoyer les changements maintenant', synced: '{n} changement(s) envoyé(s) à Glovo.', nothing: 'Rien n’a changé depuis le dernier envoi.',
      needMenu: 'Envoyez d’abord la carte : les changements partent ensuite seuls.', auto: 'Une rupture marquée à la caisse part seule vers Glovo.',
      lastBatch: 'Dernier lot · {s}', done: 'C’est fait.', failed: 'Glovo n’a pas confirmé. Réessayez dans un instant.', slow: 'Trop d’appels à Glovo cette minute. Réessayez dans un instant.',
      st: { SUCCESS: 'acceptée par Glovo', PROCESSING: 'en cours chez Glovo', PARTIALLY_PROCESSED: 'en partie : le reste repart au prochain lot',
        NOT_PROCESSED: 'non traitée par Glovo', GLOVO_ERROR: 'erreur chez Glovo', LIMIT_EXCEEDED: 'limite d’envois atteinte chez Glovo',
        FETCH_MENU_INVALID_PAYLOAD: 'refusée : format non conforme', FETCH_MENU_SERVER_ERROR: 'Glovo n’a pas pu lire la carte',
        FETCH_MENU_UNAUTHORIZED: 'Glovo n’a pas pu lire la carte (accès)', SCHEDULE_CATALOG_DISABLED: 'catalogue planifié désactivé chez Glovo',
        INVALID: 'refusée par le validateur de Glovo', refused: 'pas arrivée chez Glovo' },
      why: { 'prix à 0': 'prix à 0', 'formule seulement': 'vendu seulement en formule' },
    },
    en: {
      title: 'Glovo', intro: 'Glovo orders reach the till as a pending ticket; Kiwi tells Glovo when they are accepted, then ready.',
      none: 'This store is not linked to Glovo yet.',
      how: ['Write to Kiwi support with your store name on Glovo.', 'We link your Glovo address to Kiwi with the Glovo team.', 'Come back here to send your menu to Glovo.'],
      off: 'Glovo is not switched on for Kiwi yet. Support handles it, nothing to do on your side.',
      later: 'These settings arrive with the next Kiwi update. Glovo orders already come in.',
      load: 'Could not read Glovo’s status. Check the connection and open again.',
      address: 'Glovo address', courier: 'Glovo couriers', market: 'Your riders (Marketplace)',
      open: 'Open', closedUntil: 'Closed until {t}', closeFor: 'Close for', reopen: 'Reopen', h3: '3 h', h1: '1 h', m30: '30 min',
      glovoSaid: 'Glovo’s last answer · {m}',
      menu: 'Menu on Glovo', never: 'Never sent.', sentAt: 'Sent {d}', triedAt: 'Tried {d}', uploads: '{n} of {max} uploads today',
      preview: '{p} item(s) would go, {u} of them sold out.', skipped: 'Left out', push: 'Send the menu to Glovo',
      pushAsk: 'Send the menu now? Glovo accepts {max} uploads a day, {left} left.',
      pushed: 'Menu sent. Glovo checks it, usually within minutes.', limit: 'Today’s {max} uploads are used. Try again tomorrow; sold-outs and prices still go through.',
      invalid: 'Glovo rejects the menu. Fix it and send again (this try does not count):', empty: 'The published menu is empty or has nothing to sell.',
      unpublished: 'Publish the menu in Menu first.', noHttps: 'Glovo only reads the menu over https.',
      sync: 'Availability and prices', syncNow: 'Send the changes now', synced: '{n} change(s) sent to Glovo.', nothing: 'Nothing changed since the last batch.',
      needMenu: 'Send the menu first: changes then go out on their own.', auto: 'A sold-out marked at the till goes to Glovo on its own.',
      lastBatch: 'Last batch · {s}', done: 'Done.', failed: 'Glovo did not confirm. Try again in a moment.', slow: 'Too many calls to Glovo this minute. Try again in a moment.',
      st: { SUCCESS: 'accepted by Glovo', PROCESSING: 'processing at Glovo', PARTIALLY_PROCESSED: 'partly: the rest goes in the next batch',
        NOT_PROCESSED: 'not processed by Glovo', GLOVO_ERROR: 'error at Glovo', LIMIT_EXCEEDED: 'upload limit reached at Glovo',
        FETCH_MENU_INVALID_PAYLOAD: 'rejected: format not valid', FETCH_MENU_SERVER_ERROR: 'Glovo could not read the menu',
        FETCH_MENU_UNAUTHORIZED: 'Glovo could not read the menu (access)', SCHEDULE_CATALOG_DISABLED: 'scheduled catalogue off at Glovo',
        INVALID: 'rejected by Glovo’s validator', refused: 'did not reach Glovo' },
      why: { 'prix à 0': 'price is 0', 'formule seulement': 'sold only in a set menu' },
    },
    ar: {
      title: 'Glovo', intro: 'تصل طلبات Glovo إلى الصندوق كتذكرة في الانتظار، وتُخبر Kiwi شركة Glovo حين يُقبل الطلب ثم حين يجهز.',
      none: 'هذا المتجر غير مربوط بـ Glovo بعد.',
      how: ['راسل دعم Kiwi باسم متجرك كما يظهر على Glovo.', 'نربط عنوانك في Glovo بـ Kiwi مع فريق Glovo.', 'ارجع إلى هنا لترسل قائمتك إلى Glovo.'],
      off: 'Glovo غير مفعّل بعد مع Kiwi. الدعم يتكفّل بذلك، لا شيء عليك.',
      later: 'هذه الإعدادات تصل مع تحديث Kiwi القادم. أما طلبات Glovo فتصل من الآن.',
      load: 'تعذّرت قراءة حالة Glovo. تحقّق من الاتصال وافتح من جديد.',
      address: 'عنوان Glovo', courier: 'موصّلو Glovo', market: 'موصّلوك أنت (Marketplace)',
      open: 'مفتوح', closedUntil: 'مغلق إلى {t}', closeFor: 'أغلق لمدة', reopen: 'افتح من جديد', h3: '3 ساعات', h1: 'ساعة', m30: '30 دقيقة',
      glovoSaid: 'آخر ردّ من Glovo · {m}',
      menu: 'القائمة على Glovo', never: 'لم تُرسل بعد.', sentAt: 'أُرسلت {d}', triedAt: 'محاولة {d}', uploads: '{n} من {max} إرسالات اليوم',
      preview: 'سيُرسل {p} صنفًا، منها {u} نافدة.', skipped: 'مستبعدة', push: 'أرسل القائمة إلى Glovo',
      pushAsk: 'ترسل القائمة الآن؟ تقبل Glovo {max} إرسالات في اليوم، بقي منها {left}.',
      pushed: 'أُرسلت القائمة. تراجعها Glovo، غالبًا في دقائق.', limit: 'استُنفدت إرسالات اليوم ({max}). أعد غدًا؛ أما النفاد والأسعار فتُرسل دائمًا.',
      invalid: 'رفضت Glovo القائمة. صحّحها وأرسلها من جديد (هذه المحاولة لا تُحتسب):', empty: 'القائمة المنشورة فارغة أو بلا أصناف للبيع.',
      unpublished: 'انشر القائمة أولًا من صفحة القائمة.', noHttps: 'لا تقرأ Glovo القائمة إلا عبر https.',
      sync: 'التوفّر والأسعار', syncNow: 'أرسل التغييرات الآن', synced: 'أُرسل {n} تغيير إلى Glovo.', nothing: 'لا جديد منذ آخر إرسال.',
      needMenu: 'أرسل القائمة أولًا، وبعدها تذهب التغييرات وحدها.', auto: 'الصنف الذي تعلّمه نافدًا في الصندوق يصل إلى Glovo وحده.',
      lastBatch: 'آخر دفعة · {s}', done: 'تمّ.', failed: 'لم تؤكد Glovo. حاول بعد لحظة.', slow: 'اتصالات كثيرة بـ Glovo هذه الدقيقة. حاول بعد لحظة.',
      st: { SUCCESS: 'قبلتها Glovo', PROCESSING: 'قيد المعالجة لدى Glovo', PARTIALLY_PROCESSED: 'جزئيًا، والباقي يُرسل في الدفعة القادمة',
        NOT_PROCESSED: 'لم تعالجها Glovo', GLOVO_ERROR: 'خطأ لدى Glovo', LIMIT_EXCEEDED: 'بلغت حدّ الإرسالات لدى Glovo',
        FETCH_MENU_INVALID_PAYLOAD: 'مرفوضة: الصيغة غير مطابقة', FETCH_MENU_SERVER_ERROR: 'تعذّر على Glovo قراءة القائمة',
        FETCH_MENU_UNAUTHORIZED: 'تعذّر على Glovo قراءة القائمة (صلاحية)', SCHEDULE_CATALOG_DISABLED: 'الكتالوج المجدول معطّل لدى Glovo',
        INVALID: 'رفضها مدقّق Glovo', refused: 'لم تصل إلى Glovo' },
      why: { 'prix à 0': 'السعر 0', 'formule seulement': 'يُباع ضمن وجبة فقط' },
    },
  };
  var s = function () { return T[LANG()]; };
  var fill = function (str, o) { return String(str).replace(/\{(\w+)\}/g, function (_, k) { return o && o[k] != null ? o[k] : ''; }); };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  var fmtCache = {};
  function when(ts, timeOnly) {
    var l = LANG(), key = l + (timeOnly ? 't' : 'd');
    try {
      fmtCache[key] = fmtCache[key] || new Intl.DateTimeFormat(l === 'ar' ? 'ar-MA' : l === 'en' ? 'en-GB' : 'fr-FR',
        timeOnly ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return fmtCache[key].format(new Date(ts));
    } catch (_) { return new Date(ts).toISOString().slice(0, 16).replace('T', ' '); }
  }
  function api(url, body) {
    return fetch(url, body ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j = j || {}; j.httpStatus = r.status; return j; }); });
  }
  function button(label, cls, fn) {
    var b = el('button', 'glv-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button';
    b.addEventListener('click', function () {
      if (b.disabled) return;
      b.disabled = true; b.setAttribute('aria-busy', 'true');
      Promise.resolve(fn()).catch(function () {}).then(function () { b.disabled = false; b.removeAttribute('aria-busy'); });
    });
    return b;
  }
  function say(box, text, bad) { box.textContent = text || ''; box.className = 'glv-say' + (bad ? ' is-bad' : ''); }
  function errText(j) {
    var e = String((j && j.error) || '');
    if (e === 'daily-limit') return fill(s().limit, { max: 5 });
    if (e === 'menu-empty') return s().empty;
    if (e === 'menu-not-published') return s().unpublished;
    if (e === 'https-origin-required') return s().noHttps;
    if (e === 'not-configured') return s().off;
    if (e === 'migration-needed') return s().later;
    if (e === 'rate-local' || (j && j.httpStatus === 429)) return s().slow;
    return s().failed;
  }
  function statusText(st) { return (s().st[st] || st || '').toString(); }

  /* flash : le message d'une action survit au rechargement de la carte qu'elle a déclenché. */
  function storeCard(merchant, store, menuInfo, data, reload, flash) {
    var S = s(), card = el('section', 'glv-store');
    var said = function (slot, box) { var f = flash[store.storeId + ':' + slot]; if (f) { say(box, f.text, f.bad); delete flash[store.storeId + ':' + slot]; } return box; };
    var keep = function (slot, text, bad) { flash[store.storeId + ':' + slot] = { text: text, bad: !!bad }; };
    var head = el('div', 'glv-head');
    var title = el('div', 'glv-title');
    title.appendChild(el('b', null, S.address));
    title.appendChild(el('code', null, store.storeId));
    head.appendChild(title);
    var chips = el('div', 'glv-chips');
    chips.appendChild(el('span', 'glv-chip', store.marketplace ? S.market : S.courier));
    chips.appendChild(el('span', 'glv-chip ' + (store.closingUntil ? 'is-closed' : 'is-open'),
      store.closingUntil ? fill(S.closedUntil, { t: when(Date.parse(store.closingUntil), true) }) : S.open));
    head.appendChild(chips);
    card.appendChild(head);
    if (store.apiError && store.apiError.message) card.appendChild(el('p', 'glv-warn', fill(S.glovoSaid, { m: store.apiError.message })));

    /* Ouvert / fermé. */
    var openRow = el('div', 'glv-row'), openSay = said('open', el('p', 'glv-say'));
    var post = function (body) {
      return api('/api/channel/glovo/till', Object.assign({ merchant: merchant, storeId: store.storeId }, body)).then(function (j) {
        if (j.ok) { keep('open', S.done); return reload(); }
        say(openSay, errText(j), true);
      });
    };
    if (store.closingUntil) openRow.appendChild(button(S.reopen, 'is-go', function () { return post({ action: 'reopen' }); }));
    else {
      openRow.appendChild(el('span', 'glv-lbl', S.closeFor));
      [[30, S.m30], [60, S.h1], [180, S.h3]].forEach(function (d) {
        openRow.appendChild(button(d[1], '', function () { return post({ action: 'close', minutes: d[0] }); }));
      });
    }
    card.appendChild(openRow); card.appendChild(openSay);

    /* La carte. */
    card.appendChild(el('h4', 'glv-h', S.menu));
    var m = menuInfo && menuInfo.menu;
    var tried = m && (m.status === 'INVALID' || m.status === 'refused');
    card.appendChild(el('p', 'glv-line', m ? fill(tried ? S.triedAt : S.sentAt, { d: m.ts ? when(m.ts) : '' }) + ' · ' + statusText(m.status) : S.never));
    var errs = m && m.detail && Array.isArray(m.detail.errors) ? m.detail.errors : (m && Array.isArray(m.detail) ? m.detail : []);
    if (errs.length && m.status !== 'SUCCESS') {
      var ul = el('ul', 'glv-list'); errs.slice(0, 8).forEach(function (e) { ul.appendChild(el('li', null, String(e))); }); card.appendChild(ul);
    }
    var used = menuInfo ? Number(menuInfo.uploadsToday) || 0 : 0, max = Number(data.limitPerDay) || 5;
    card.appendChild(el('p', 'glv-line glv-dim', fill(S.uploads, { n: used, max: max })));
    if (data.preview) {
      card.appendChild(el('p', 'glv-line', fill(S.preview, { p: data.preview.products, u: data.preview.unavailable })));
      if (data.preview.skipped && data.preview.skipped.length) {
        card.appendChild(el('p', 'glv-line glv-dim', S.skipped + ' · ' + data.preview.skipped.slice(0, 8).map(function (x) {
          return x.name + ' (' + (S.why[x.why] || x.why) + ')';
        }).join(', ') + (data.preview.skipped.length > 8 ? '…' : '')));
      }
    }
    var menuSay = said('menu', el('div', 'glv-say'));
    var pushRow = el('div', 'glv-row');
    var pushBtn = button(S.push, 'is-go', function () {
      if (!window.confirm(fill(S.pushAsk, { max: max, left: Math.max(0, max - used) }))) return null;
      return api('/api/channel/glovo/menu', { merchant: merchant, action: 'push', storeId: store.storeId }).then(function (j) {
        if (j.ok) { keep('menu', S.pushed); return reload(); }
        if (j.error === 'menu-invalid') {
          say(menuSay, S.invalid, true);
          var list = el('ul', 'glv-list'); (j.errors || []).slice(0, 8).forEach(function (e) { list.appendChild(el('li', null, String(e))); });
          menuSay.appendChild(list);
          return null;
        }
        say(menuSay, errText(j), true);
      });
    });
    if (used >= max || !data.preview) pushBtn.disabled = true;
    pushRow.appendChild(pushBtn);
    card.appendChild(pushRow); card.appendChild(menuSay);

    /* Dispo et prix. */
    card.appendChild(el('h4', 'glv-h', S.sync));
    var b = menuInfo && menuInfo.bulk;
    if (b) card.appendChild(el('p', 'glv-line', fill(S.lastBatch, { s: (b.ts ? when(b.ts) + ' · ' : '') + statusText(b.status) })));
    var hasMenu = !!(m && m.status === 'SUCCESS');
    card.appendChild(el('p', 'glv-line glv-dim', hasMenu ? S.auto : S.needMenu));
    var syncSay = said('sync', el('p', 'glv-say'));
    var syncRow = el('div', 'glv-row');
    var syncBtn = button(S.syncNow, '', function () {
      return api('/api/channel/glovo/menu', { merchant: merchant, action: 'sync' }).then(function (j) {
        if (!j.ok) { say(syncSay, errText(j), true); return null; }
        var mine = (j.stores || []).filter(function (x) { return x.storeId === store.storeId; })[0];
        if (mine && mine.error) { say(syncSay, errText({ error: mine.error }), true); return null; }
        keep('sync', mine && mine.sent ? fill(S.synced, { n: mine.sent }) : S.nothing);
        return reload();
      });
    });
    if (!hasMenu) syncBtn.disabled = true;
    syncRow.appendChild(syncBtn);
    card.appendChild(syncRow); card.appendChild(syncSay);
    return card;
  }

  function merchantBlock(m, many) {
    var S = s(), wrap = el('div', 'glv-merchant');
    if (many) wrap.appendChild(el('h3', 'glv-mname', m.name || m.merchant));
    var body = el('div', 'glv-body'), flash = {}; wrap.appendChild(body);
    function paint(menu, till) {
      body.textContent = '';
      if (!till.configured) { body.appendChild(el('p', 'glv-note', S.off)); return; }
      if (!till.stores || !till.stores.length) {
        body.appendChild(el('p', 'glv-note', S.none));
        var ol = el('ol', 'glv-how'); S.how.forEach(function (x) { ol.appendChild(el('li', null, x)); }); body.appendChild(ol);
        return;
      }
      if (!till.migrated) { body.appendChild(el('p', 'glv-note', S.later)); return; }
      var byId = {}; ((menu && menu.stores) || []).forEach(function (x) { byId[x.storeId] = x; });
      till.stores.forEach(function (st) { body.appendChild(storeCard(m.merchant, st, byId[st.storeId], menu || {}, load, flash)); });
    }
    function load() {
      body.classList.add('is-loading');
      var q = '?merchant=' + encodeURIComponent(m.merchant);
      return Promise.all([api('/api/channel/glovo/menu' + q), api('/api/channel/glovo/till' + q)]).then(function (r) {
        if (!r[1].ok) { body.textContent = ''; body.appendChild(el('p', 'glv-warn', S.load)); return; }
        paint(r[0].ok ? r[0] : null, r[1]);
      }).catch(function () { body.textContent = ''; body.appendChild(el('p', 'glv-warn', S.load)); })
        .then(function () { body.classList.remove('is-loading'); });
    }
    body.appendChild(el('p', 'glv-dim', '…'));
    load();
    return wrap;
  }

  function openGlovo() {
    var S = s();
    if (!window.Kiwi || !window.Kiwi.modal) return Promise.resolve(false);
    var m = window.Kiwi.modal({ title: S.title, width: 620, body: '' });
    var slot = m && m.el && m.el.querySelector('.kiwi-modal-body');
    if (!slot) { if (m && m.close) m.close(); return Promise.resolve(false); }
    var root = el('div', 'glv'); slot.appendChild(root);
    root.appendChild(el('p', 'glv-intro', S.intro));
    var list = el('div', 'glv-merchants'); root.appendChild(list);
    var opSlug = '';
    try { var q = new URLSearchParams(location.search); if (q.get('op') === '1') opSlug = String(q.get('merchant') || '').slice(0, 64); } catch (_) {}
    if (opSlug) { list.appendChild(merchantBlock({ merchant: opSlug, name: opSlug }, false)); return Promise.resolve(true); }
    return api('/api/me').then(function (me) {
      var stores = (me && Array.isArray(me.stores) ? me.stores : []).filter(function (x) { return x && x.merchant; });
      if (!stores.length) { list.appendChild(el('p', 'glv-warn', S.load)); return false; }
      stores.forEach(function (x) { list.appendChild(merchantBlock(x, stores.length > 1)); });
      return true;
    }).catch(function () { list.appendChild(el('p', 'glv-warn', S.load)); return false; });
  }

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('[data-action="integration-connect"][data-channel="glovo"]') : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openGlovo();
  }, true);

  try {
    var st = document.createElement('style');
    st.textContent = [
      '.glv{display:flex;flex-direction:column;gap:14px;font-size:13.5px;line-height:1.45;color:var(--ink);}',
      '.glv-intro,.glv-note{margin:0;color:var(--ink-2,var(--n-600));}',
      '.glv-merchants{display:flex;flex-direction:column;gap:14px;}',
      '.glv-mname{margin:0;font-size:14px;font-weight:600;}',
      '.glv-body{display:flex;flex-direction:column;gap:12px;}',
      '.glv-body.is-loading{opacity:.6;}',
      '.glv-store{display:flex;flex-direction:column;gap:8px;padding:16px;border-radius:14px;border:1px solid color-mix(in srgb,var(--ink) 10%,transparent);background:var(--paper);}',
      'html[data-theme="dark"] .glv-store{background:color-mix(in srgb,var(--paper) 6%,transparent);}',
      '.glv-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;}',
      '.glv-title{display:flex;align-items:baseline;gap:8px;min-width:0;}',
      '.glv-title b{font-size:15px;font-weight:600;}',
      '.glv-title code{font:500 12px "JetBrains Mono",ui-monospace,monospace;color:var(--n-600);overflow-wrap:anywhere;}',
      '.glv-chips{display:flex;gap:6px;flex-wrap:wrap;}',
      '.glv-chip{font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;background:color-mix(in srgb,var(--ink) 6%,transparent);color:var(--ink-2,var(--n-600));white-space:nowrap;}',
      '.glv-chip.is-open{background:color-mix(in srgb,var(--atlas) 12%,transparent);color:var(--atlas);}',
      '.glv-chip.is-closed{background:color-mix(in srgb,var(--danger,#C94A3A) 12%,transparent);color:var(--danger,#C94A3A);}',
      'html[data-theme="dark"] .glv-chip.is-open{color:var(--mint);}',
      '.glv-h{margin:6px 0 0;font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--ink-3,var(--n-500));}',
      '.glv-line{margin:0;}',
      '.glv-dim{margin:0;color:var(--ink-3,var(--n-500));font-size:12.5px;}',
      '.glv-warn{margin:0;font-size:12.5px;font-weight:600;color:var(--danger,#C94A3A);}',
      '.glv-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}',
      '.glv-lbl{font-size:12.5px;font-weight:600;color:var(--n-600);}',
      '.glv-btn{min-height:40px;padding:0 14px;border-radius:10px;border:1px solid color-mix(in srgb,var(--ink) 14%,transparent);background:transparent;color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;}',
      '.glv-btn:hover{background:color-mix(in srgb,var(--ink) 5%,transparent);}',
      '.glv-btn.is-go{background:var(--atlas);border-color:transparent;color:var(--paper);}',
      '.glv-btn.is-go:hover{background:var(--riad);}',
      '.glv-btn[disabled]{opacity:.55;cursor:default;}',
      '.glv-btn:focus-visible{outline:2px solid color-mix(in srgb,var(--atlas) 45%,transparent);outline-offset:2px;}',
      '.glv-say{margin:0;font-size:12.5px;font-weight:600;color:var(--atlas);}',
      '.glv-say:empty{display:none;}',
      '.glv-say.is-bad{color:var(--danger,#C94A3A);}',
      'html[data-theme="dark"] .glv-say{color:var(--mint);}',
      '.glv-list{margin:4px 0 0;padding-inline-start:18px;font-size:12.5px;font-weight:500;color:var(--ink-2,var(--n-600));}',
      '.glv-how{margin:0;padding-inline-start:20px;display:flex;flex-direction:column;gap:4px;}',
    ].join('');
    document.head.appendChild(st);
  } catch (_) {}
})();
