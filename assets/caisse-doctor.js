/* Kiwi Caisse · « Vérifier la caisse ».
 *
 * Ce qui empêche le plus souvent d'encaisser ou d'imprimer se règle au
 * comptoir, mais se diagnostique au téléphone : « est-ce que le relais est
 * allumé ? », « l'iPad est-il à l'heure ? ». Cet écran pose les questions
 * lui-même, maintenant, et dit pour chacune : bon, à voir, bloquant, ou
 * « je ne peux pas le savoir d'ici ». Jamais un vert par défaut.
 *
 * Tout est local ou déjà payé : la carte publique que la caisse relit de toute
 * façon toutes les six secondes sert de sonde réseau ET d'horloge (en-tête
 * Date), le relais d'impression est sondé sans rien imprimer, la version
 * vient de la vérification de mise à jour du service worker.
 *
 * Idée reprise du `doctor` de gods-eye-view (MIT) ; rien n'est copié. */
(function () {
  'use strict';

  const T = {
    fr: {
      open: 'Vérifier la caisse', title: 'Vérifier la caisse', sub: 'Ce qui peut empêcher d’encaisser ou d’imprimer, testé maintenant.',
      rerun: 'Relancer', close: 'Fermer', running: 'Vérification…',
      lv: { ok: 'Bon', warn: 'À voir', bad: 'Bloquant', unknown: 'Inconnu' },
      net: 'Connexion', netOk: (ms) => `En ligne · le serveur répond en ${ms} ms.`, netSlow: (ms) => `En ligne mais lent · ${ms} ms. Les ventes partent, avec du retard.`,
      netOff: 'Hors ligne. Les ventes restent sur cet appareil et partiront au retour du réseau.', netErr: (c) => `Le serveur a répondu ${c}. Réessayez dans une minute.`,
      pair: 'Appairage', pairOk: (n) => `Caisse appairée à ${n}.`, pairNo: 'Cette caisse n’est appairée à aucun établissement : ses ventes n’arrivent pas au tableau de bord.', pairFix: 'Appairer',
      queue: 'Ventes à envoyer', queueOk: 'Toutes les ventes sont arrivées au serveur.', queuePend: (n, m) => `${n} vente${n > 1 ? 's' : ''} en attente d’envoi${m ? `, la plus ancienne depuis ${m} min` : ''}.`,
      queueBlocked: (n) => `${n} vente${n > 1 ? 's' : ''} refusée${n > 1 ? 's' : ''} par le serveur : à reprendre avant la clôture.`, queueStore: 'Le stockage de la file d’envoi a échoué sur cet appareil.', queueFix: 'Renvoyer maintenant',
      print: 'Imprimante', printNone: 'Aucune imprimante réglée : les tickets ne s’impriment pas.', printFix: 'Régler l’imprimante',
      printBt: 'Imprimante Bluetooth connectée.', printUsb: 'Imprimante USB connectée.',
      printBridge: (v) => `Relais d’impression joignable${v ? ` · version ${v}` : ''}.`, printBridgeOff: 'Le relais d’impression ne répond pas sur ce poste. Vérifiez qu’il est lancé sur l’ordinateur du comptoir.',
      printRelay: (n) => `Relais cloud en ligne · ${n} poste${n > 1 ? 's' : ''} d’impression.`, printRelayOff: 'Aucun poste d’impression en ligne derrière le relais cloud. Allumez l’ordinateur du comptoir.',
      printRelayAuth: 'Le relais cloud refuse cette caisse : appairez-la de nouveau.', printUnknown: 'Imprimante réglée, mais son état ne se lit pas d’ici. Imprimez un ticket test depuis son réglage.',
      clock: 'Horloge', clockOk: 'L’heure de l’appareil est juste.', clockOff: (m) => `L’appareil a ${m} min d’écart avec le serveur. La journée de caisse (qui bascule à 5 h) et l’heure des tickets seront fausses. Réglez l’heure automatique dans les réglages de l’appareil.`,
      clockUnknown: 'Pas d’heure serveur à comparer : le serveur n’a pas répondu.',
      app: 'Version', appOk: (v) => `À jour${v ? ` · ${v}` : ''}.`, appWait: 'Une mise à jour est prête. Rechargez la caisse entre deux clients.', appFix: 'Recharger', appNone: 'Pas de mode hors ligne sur ce navigateur : la caisse a besoin du réseau pour s’ouvrir.',
      store: 'Stockage', storeOk: (p) => `${p} % de l’espace utilisé.`, storeFull: (p) => `${p} % de l’espace utilisé : la file d’envoi pourrait manquer de place.`,
      storeLoose: 'Le navigateur peut effacer les données de la caisse s’il manque de place.', storeFix: 'Protéger les données', storeUnknown: 'Ce navigateur ne dit pas l’espace utilisé.',
      menu: 'Carte', menuOk: (n) => `${n} article${n > 1 ? 's' : ''} chargé${n > 1 ? 's' : ''}.`, menuNone: 'Aucune carte chargée : publiez-la depuis le tableau de bord.',
    },
    en: {
      open: 'Check the till', title: 'Check the till', sub: 'What can stop you from taking payments or printing, tested now.',
      rerun: 'Run again', close: 'Close', running: 'Checking…',
      lv: { ok: 'Good', warn: 'Check', bad: 'Blocking', unknown: 'Unknown' },
      net: 'Connection', netOk: (ms) => `Online · the server answers in ${ms} ms.`, netSlow: (ms) => `Online but slow · ${ms} ms. Sales go out, late.`,
      netOff: 'Offline. Sales stay on this device and go out when the network is back.', netErr: (c) => `The server answered ${c}. Try again in a minute.`,
      pair: 'Pairing', pairOk: (n) => `Till paired to ${n}.`, pairNo: 'This till is not paired to any business: its sales do not reach the dashboard.', pairFix: 'Pair',
      queue: 'Sales to send', queueOk: 'Every sale has reached the server.', queuePend: (n, m) => `${n} sale${n > 1 ? 's' : ''} waiting to be sent${m ? `, the oldest for ${m} min` : ''}.`,
      queueBlocked: (n) => `${n} sale${n > 1 ? 's' : ''} refused by the server: fix before closing.`, queueStore: 'The send queue storage failed on this device.', queueFix: 'Send now',
      print: 'Printer', printNone: 'No printer set up: tickets do not print.', printFix: 'Set up the printer',
      printBt: 'Bluetooth printer connected.', printUsb: 'USB printer connected.',
      printBridge: (v) => `Print bridge reachable${v ? ` · version ${v}` : ''}.`, printBridgeOff: 'The print bridge does not answer on this computer. Check that it is running on the counter computer.',
      printRelay: (n) => `Cloud relay online · ${n} print station${n > 1 ? 's' : ''}.`, printRelayOff: 'No print station online behind the cloud relay. Turn on the counter computer.',
      printRelayAuth: 'The cloud relay refuses this till: pair it again.', printUnknown: 'A printer is set up, but its state cannot be read from here. Print a test ticket from its settings.',
      clock: 'Clock', clockOk: 'The device time is right.', clockOff: (m) => `The device is ${m} min off the server. The till day (which turns over at 5 am) and ticket times will be wrong. Turn on automatic time in the device settings.`,
      clockUnknown: 'No server time to compare: the server did not answer.',
      app: 'Version', appOk: (v) => `Up to date${v ? ` · ${v}` : ''}.`, appWait: 'An update is ready. Reload the till between two customers.', appFix: 'Reload', appNone: 'No offline mode on this browser: the till needs the network to open.',
      store: 'Storage', storeOk: (p) => `${p} % of the space used.`, storeFull: (p) => `${p} % of the space used: the send queue may run out of room.`,
      storeLoose: 'The browser may erase the till’s data if it runs short of space.', storeFix: 'Protect the data', storeUnknown: 'This browser does not report the space used.',
      menu: 'Menu', menuOk: (n) => `${n} item${n > 1 ? 's' : ''} loaded.`, menuNone: 'No menu loaded: publish it from the dashboard.',
    },
    ar: {
      open: 'فحص الصندوق', title: 'فحص الصندوق', sub: 'ما قد يمنع التحصيل أو الطباعة، مفحوص الآن.',
      rerun: 'إعادة الفحص', close: 'إغلاق', running: 'جارٍ الفحص…',
      lv: { ok: 'جيد', warn: 'للمراجعة', bad: 'يمنع العمل', unknown: 'غير معروف' },
      net: 'الاتصال', netOk: (ms) => `متصل · يجيب الخادم في ${ms} ms.`, netSlow: (ms) => `متصل لكن ببطء · ${ms} ms. المبيعات تُرسل متأخرة.`,
      netOff: 'غير متصل. تبقى المبيعات على هذا الجهاز وتُرسل عند عودة الشبكة.', netErr: (c) => `أجاب الخادم بالرمز ${c}. أعد المحاولة بعد دقيقة.`,
      pair: 'الربط', pairOk: (n) => `الصندوق مربوط بـ ${n}.`, pairNo: 'هذا الصندوق غير مربوط بأي مؤسسة: مبيعاته لا تصل إلى لوحة القيادة.', pairFix: 'ربط',
      queue: 'مبيعات للإرسال', queueOk: 'وصلت كل المبيعات إلى الخادم.', queuePend: (n, m) => `${n} عملية بيع في انتظار الإرسال${m ? `، أقدمها منذ ${m} دقيقة` : ''}.`,
      queueBlocked: (n) => `رفض الخادم ${n} عملية بيع: يجب معالجتها قبل الإغلاق.`, queueStore: 'فشل تخزين قائمة الإرسال على هذا الجهاز.', queueFix: 'إرسال الآن',
      print: 'الطابعة', printNone: 'لا توجد طابعة مضبوطة: التذاكر لا تُطبع.', printFix: 'ضبط الطابعة',
      printBt: 'طابعة بلوتوث متصلة.', printUsb: 'طابعة USB متصلة.',
      printBridge: (v) => `جسر الطباعة متاح${v ? ` · الإصدار ${v}` : ''}.`, printBridgeOff: 'جسر الطباعة لا يجيب على هذا الجهاز. تأكد من تشغيله على حاسوب الكونتوار.',
      printRelay: (n) => `المرحل السحابي متصل · ${n} محطة طباعة.`, printRelayOff: 'لا توجد محطة طباعة متصلة خلف المرحل السحابي. شغّل حاسوب الكونتوار.',
      printRelayAuth: 'المرحل السحابي يرفض هذا الصندوق: أعد ربطه.', printUnknown: 'الطابعة مضبوطة لكن حالتها لا تُقرأ من هنا. اطبع تذكرة تجريبية من إعداداتها.',
      clock: 'الساعة', clockOk: 'وقت الجهاز صحيح.', clockOff: (m) => `فارق ${m} دقيقة بين الجهاز والخادم. سيكون يوم الصندوق (الذي يبدأ في الخامسة صباحاً) ووقت التذاكر خاطئين. فعّل الوقت التلقائي في إعدادات الجهاز.`,
      clockUnknown: 'لا يوجد وقت الخادم للمقارنة: لم يجب الخادم.',
      app: 'الإصدار', appOk: (v) => `محدّث${v ? ` · ${v}` : ''}.`, appWait: 'يوجد تحديث جاهز. أعد تحميل الصندوق بين زبونين.', appFix: 'إعادة التحميل', appNone: 'لا يوجد وضع دون اتصال في هذا المتصفح: يحتاج الصندوق إلى الشبكة ليفتح.',
      store: 'التخزين', storeOk: (p) => `${p} % من المساحة مستعملة.`, storeFull: (p) => `${p} % من المساحة مستعملة: قد تنفد مساحة قائمة الإرسال.`,
      storeLoose: 'قد يمحو المتصفح بيانات الصندوق إذا نقصت المساحة.', storeFix: 'حماية البيانات', storeUnknown: 'هذا المتصفح لا يذكر المساحة المستعملة.',
      menu: 'القائمة', menuOk: (n) => `${n} صنف محمّل.`, menuNone: 'لا توجد قائمة محمّلة: انشرها من لوحة القيادة.',
    },
  };
  const lang = () => { const l = (document.documentElement.lang || 'fr').slice(0, 2); return T[l] ? l : 'fr'; };
  const t = () => T[lang()];
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name) => (window.KiwiIcon && window.KiwiIcon.svg ? window.KiwiIcon.svg(name, 20) : '');
  const LV_ICON = { ok: 'check_circle', warn: 'warning', bad: 'error', unknown: 'help' };

  function paired() {
    try {
      const pv = window.KiwiPlatform && window.KiwiPlatform.pairedVenue && window.KiwiPlatform.pairedVenue();
      if (pv) return pv;
      return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    } catch (_) { return null; }
  }
  const slug = () => { const p = paired(); return (p && p.merchant) || (window.KiwiLive && window.KiwiLive.merchant && window.KiwiLive.merchant()) || ''; };
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

  /* Une sonde réseau sert trois vérifications : connexion, horloge, carte. */
  async function probe() {
    const s = slug();
    if (!s) return { skipped: true };
    if (navigator.onLine === false) return { offline: true };
    const t0 = performance.now();
    try {
      const r = await withTimeout(fetch('/api/menu?merchant=' + encodeURIComponent(s), { cache: 'no-store', credentials: 'omit' }), 8000);
      const ms = Math.round(performance.now() - t0);
      const date = Date.parse(r.headers.get('date') || '');
      let items = null;
      try { const j = await r.json(); items = j && j.menu && Array.isArray(j.menu.items) ? j.menu.items.length : 0; } catch (_) {}
      return { status: r.status, ok: r.ok, ms, serverAt: Number.isFinite(date) ? date + ms / 2 : null, localAt: Date.now(), items };
    } catch (e) {
      return { offline: true };
    }
  }

  async function run() {
    const c = t();
    const net = await probe();
    const out = [];

    // Connexion
    if (net.skipped) out.push({ id: 'net', title: c.net, level: 'unknown', text: c.pairNo });
    else if (net.offline) out.push({ id: 'net', title: c.net, level: 'bad', text: c.netOff });
    else if (!net.ok) out.push({ id: 'net', title: c.net, level: 'warn', text: c.netErr(net.status) });
    else out.push({ id: 'net', title: c.net, level: net.ms > 2000 ? 'warn' : 'ok', text: net.ms > 2000 ? c.netSlow(net.ms) : c.netOk(net.ms) });

    // Appairage
    const p = paired();
    out.push(p && p.merchant
      ? { id: 'pair', title: c.pair, level: 'ok', text: c.pairOk(p.name || p.merchant) }
      : { id: 'pair', title: c.pair, level: 'bad', text: c.pairNo, fix: { label: c.pairFix, run: () => { location.assign(location.pathname + '?pair=1'); } } });

    // Ventes à envoyer
    try {
      const q = window.KiwiLive && window.KiwiLive.queueStatus ? window.KiwiLive.queueStatus() : null;
      if (!q) out.push({ id: 'queue', title: c.queue, level: 'unknown', text: c.queueStore });
      else if (q.storageError) out.push({ id: 'queue', title: c.queue, level: 'bad', text: c.queueStore });
      else if (q.blocked > 0) out.push({ id: 'queue', title: c.queue, level: 'bad', text: c.queueBlocked(q.blocked), fix: { label: c.queueFix, run: () => window.KiwiLive.retryBlockedSales && window.KiwiLive.retryBlockedSales() } });
      else if (q.pending > 0) {
        const mins = q.oldestPendingAt && Number.isFinite(q.oldestPendingAt) ? Math.max(1, Math.round((Date.now() - q.oldestPendingAt) / 60000)) : 0;
        out.push({ id: 'queue', title: c.queue, level: mins >= 15 ? 'bad' : 'warn', text: c.queuePend(q.pending, mins), fix: { label: c.queueFix, run: () => window.KiwiLive.flush && window.KiwiLive.flush() } });
      } else out.push({ id: 'queue', title: c.queue, level: 'ok', text: c.queueOk });
    } catch (_) { out.push({ id: 'queue', title: c.queue, level: 'unknown', text: c.queueStore }); }

    // Imprimante — sondée, jamais un ticket imprimé.
    out.push(await printerCheck(c));

    // Horloge
    if (net.serverAt) {
      const skewMin = Math.round(Math.abs(net.localAt - net.serverAt) / 60000);
      out.push(skewMin >= 2 ? { id: 'clock', title: c.clock, level: 'bad', text: c.clockOff(skewMin) } : { id: 'clock', title: c.clock, level: 'ok', text: c.clockOk });
    } else out.push({ id: 'clock', title: c.clock, level: 'unknown', text: c.clockUnknown });

    // Version
    out.push(await versionCheck(c));

    // Stockage
    out.push(await storageCheck(c));

    // Carte (restaurant) : ce que la caisse a chargé, sinon ce que le serveur sert.
    const loaded = window.KiwiCaisseCarte && window.KiwiCaisseCarte.itemCount ? window.KiwiCaisseCarte.itemCount() : null;
    const count = loaded != null && loaded > 0 ? loaded : net.items;
    if (count != null) out.push(count > 0 ? { id: 'menu', title: c.menu, level: 'ok', text: c.menuOk(count) } : { id: 'menu', title: c.menu, level: 'warn', text: c.menuNone });
    return out;
  }

  async function printerCheck(c) {
    const P = window.KiwiPrinter;
    const fix = { label: c.printFix, run: () => { if (P && P.openSetup) P.openSetup(); } };
    if (!P) return { id: 'print', title: c.print, level: 'unknown', text: c.printUnknown };
    try {
      if (P.btConnected && P.btConnected()) return { id: 'print', title: c.print, level: 'ok', text: c.printBt };
      if (P.usbConnected && P.usbConnected()) return { id: 'print', title: c.print, level: 'ok', text: c.printUsb };
      if (!(P.isConfigured && P.isConfigured())) return { id: 'print', title: c.print, level: 'bad', text: c.printNone, fix };
      const local = P.ping ? await withTimeout(Promise.resolve(P.ping()), 6000).catch(() => null) : null;
      if (local) return { id: 'print', title: c.print, level: 'ok', text: c.printBridge(local.version || '') };
      if (P.relayProbe) {
        const r = await withTimeout(Promise.resolve(P.relayProbe(true)), 8000).catch(() => null);
        if (r && r.authed === false) return { id: 'print', title: c.print, level: 'bad', text: c.printRelayAuth, fix };
        if (r && r.provisioned && r.online) return { id: 'print', title: c.print, level: 'ok', text: c.printRelay(Math.max(1, (r.bridges || []).length)) };
        if (r && r.provisioned) return { id: 'print', title: c.print, level: 'bad', text: c.printRelayOff, fix };
      }
      return { id: 'print', title: c.print, level: 'bad', text: c.printBridgeOff, fix };
    } catch (_) { return { id: 'print', title: c.print, level: 'unknown', text: c.printUnknown, fix }; }
  }

  async function versionCheck(c) {
    let name = '';
    try { name = ((await caches.keys()).find((k) => /^kiwi-app-v\d+$/.test(k)) || '').replace('kiwi-app-', ''); } catch (_) {}
    if (!('serviceWorker' in navigator)) return { id: 'app', title: c.app, level: 'warn', text: c.appNone };
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return { id: 'app', title: c.app, level: 'warn', text: c.appNone };
      try { await withTimeout(reg.update(), 6000); } catch (_) {}
      if (reg.waiting || reg.installing) return { id: 'app', title: c.app, level: 'warn', text: c.appWait, fix: { label: c.appFix, run: () => location.reload() } };
      return { id: 'app', title: c.app, level: 'ok', text: c.appOk(name) };
    } catch (_) { return { id: 'app', title: c.app, level: 'unknown', text: c.appOk(name) }; }
  }

  async function storageCheck(c) {
    const S = navigator.storage;
    if (!S || !S.estimate) return { id: 'store', title: c.store, level: 'unknown', text: c.storeUnknown };
    try {
      const e = await S.estimate();
      const pct = e.quota ? Math.round((e.usage / e.quota) * 100) : null;
      if (pct != null && pct >= 80) return { id: 'store', title: c.store, level: 'bad', text: c.storeFull(pct) };
      const kept = S.persisted ? await S.persisted() : true;
      if (!kept && S.persist) return { id: 'store', title: c.store, level: 'warn', text: c.storeLoose, fix: { label: c.storeFix, run: async () => { try { await S.persist(); } catch (_) {} } } };
      return pct == null ? { id: 'store', title: c.store, level: 'unknown', text: c.storeUnknown } : { id: 'store', title: c.store, level: 'ok', text: c.storeOk(Math.max(pct, 1)) };
    } catch (_) { return { id: 'store', title: c.store, level: 'unknown', text: c.storeUnknown }; }
  }

  let screen = null;
  let results = [];
  function render(busy) {
    const c = t();
    screen.querySelector('#kd-title').textContent = c.title;
    screen.querySelector('#kd-sub').textContent = c.sub;
    screen.querySelector('#kd-rerun').textContent = busy ? c.running : c.rerun;
    screen.querySelector('#kd-rerun').disabled = !!busy;
    screen.querySelector('#kd-close').setAttribute('aria-label', c.close);
    screen.querySelector('#kd-close span').textContent = c.close;
    const list = screen.querySelector('#kd-list');
    list.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (busy && !results.length) { list.innerHTML = '<p class="kd-empty">' + esc(c.running) + '</p>'; return; }
    list.innerHTML = results.map((r, i) => '<article class="kd-row kd-' + r.level + '" data-check="' + esc(r.id) + '" data-level="' + r.level + '">'
      + '<span class="kd-ic" aria-hidden="true">' + icon(LV_ICON[r.level]) + '</span>'
      + '<div class="kd-txt"><h3>' + esc(r.title) + ' <span class="kd-lv">' + esc(c.lv[r.level]) + '</span></h3><p>' + esc(r.text) + '</p></div>'
      + (r.fix ? '<button type="button" class="kd-fix" data-kd-fix="' + i + '">' + esc(r.fix.label) + '</button>' : '')
      + '</article>').join('');
  }
  async function check() {
    render(true);
    try { results = await run(); } catch (_) { results = []; }
    render(false);
  }
  function open() {
    if (!screen) build();
    screen.classList.add('is-open');
    screen.querySelector('#kd-rerun').focus();
    check();
  }
  function close() { if (screen) screen.classList.remove('is-open'); }
  function build() {
    screen = document.createElement('div');
    screen.className = 'kds-screen kd-screen';
    screen.id = 'caisse-doctor';
    screen.setAttribute('role', 'dialog');
    screen.setAttribute('aria-modal', 'true');
    screen.setAttribute('aria-labelledby', 'kd-title');
    screen.innerHTML = '<div class="kds-head"><div class="kds-head-l"><h2 id="kd-title"></h2><div class="sub" id="kd-sub"></div></div><div class="kd-actions"><button type="button" class="kds-close kd-rerun" id="kd-rerun"></button><button class="kds-close" id="kd-close" type="button"><span></span></button></div></div><div class="kd-list" id="kd-list" aria-live="polite"></div>';
    document.body.appendChild(screen);
    const st = document.createElement('style');
    st.textContent = '.kd-screen{background:var(--paper,#F7F5F0)}.kd-actions{display:flex;gap:10px;align-items:center}.kd-rerun[disabled]{opacity:.6}.kd-list{padding:8px 28px 32px;overflow:auto;height:calc(100% - 110px);display:grid;gap:10px;align-content:start;max-width:860px}.kd-row{display:flex;align-items:flex-start;gap:14px;padding:16px 18px;border:1px solid var(--line,#ddd);border-radius:18px;background:var(--surface,#F7F5F0)}.kd-ic{flex:0 0 auto;width:24px;height:24px;margin-top:1px}.kd-ic svg{width:24px;height:24px;fill:currentColor}.kd-ok .kd-ic{color:var(--atlas,#0B6E4F)}.kd-warn .kd-ic{color:#B7791F}.kd-bad .kd-ic{color:var(--danger,#C94A3A)}.kd-unknown .kd-ic{color:var(--ink-3,#667)}.kd-bad{border-color:rgba(201,74,58,.45)}.kd-txt{flex:1;min-width:0}.kd-txt h3{margin:0;font-size:16px;font-weight:700}.kd-lv{font-size:12px;font-weight:600;color:var(--ink-3,#667);margin-inline-start:6px}.kd-txt p{margin:4px 0 0;font-size:14px;line-height:1.45;color:var(--ink-2,#3a4440)}.kd-fix{flex:0 0 auto;min-height:44px;padding:0 16px;border-radius:12px;border:0;background:var(--atlas,#0B6E4F);color:#F7F5F0;font:inherit;font-weight:650;align-self:center}.kd-empty{color:var(--ink-3,#667);padding:40px 0}@media (max-width:640px){.kd-row{flex-wrap:wrap}.kd-fix{width:100%}.kd-list{padding:8px 16px 24px}}';
    document.head.appendChild(st);
    screen.querySelector('#kd-close').addEventListener('click', close);
    screen.querySelector('#kd-rerun').addEventListener('click', check);
    screen.querySelector('#kd-list').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-kd-fix]');
      if (!b) return;
      const r = results[Number(b.dataset.kdFix)];
      if (!r || !r.fix) return;
      try { await r.fix.run(); } catch (_) {}
      if (r.id !== 'print' && r.id !== 'pair' && r.id !== 'app') setTimeout(check, 600);
      else close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && screen.classList.contains('is-open')) close(); });
  }

  function install() {
    if (document.getElementById('open-caisse-doctor')) return;
    const host = document.querySelector('.quick-actions');
    if (!host) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qa-btn ghost';
    b.id = 'open-caisse-doctor';
    b.innerHTML = '<i data-icon="stethoscope"></i><span></span>';
    const label = () => { const c = t(); b.querySelector('span').textContent = c.open; b.setAttribute('aria-label', c.open); b.title = c.open; };
    label();
    host.insertBefore(b, host.querySelector('[data-action="fin-service"]'));
    b.addEventListener('click', open);
    new MutationObserver(() => { label(); if (screen && screen.classList.contains('is-open')) render(false); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    if (window.KiwiIcon && window.KiwiIcon.render) { try { window.KiwiIcon.render(b); } catch (_) {} }
  }

  window.KiwiCaisseDoctor = { open, run };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
