/* Owner: first-use dashboard dependencies. Exposes KiwiDashboardLoader.load;
 * needs Kiwi.handlers and the hotel owner. Registry order is the ownership record:
 * hotel state/model stay in the shell, UI factories wait for a hotel action. */
(() => {
  'use strict';
  const H = window.Kiwi?.handlers;
  if (!H) return;
  const REGISTRY = Object.freeze({
    workspace: { dependencies: [], scripts: [
      'assets/order-qr.js?v=6',
      'assets/growth-crm.js?v=7',
      'assets/ramadan.js?v=3',
      'assets/catalog-import.js?v=16',
      'assets/ai-image-import.js?v=1',
      'assets/menu-scan-reader.js?v=1',
      'assets/menu-scan.js?v=8',
      'assets/salle-scan.js?v=7',
    ] },
    hotel: { dependencies: [], scripts: [
      'assets/hotel/arrivals.js?v=4',
      'assets/hotel/room-board.js?v=6',
      'assets/hotel/folio-actions.js?v=4',
      'assets/hotel/rate-actions.js?v=6',
      'assets/hotel-rates.js?v=1',
      'assets/hotel-folio.js?v=1',
      'assets/hotel-channels.js?v=1',
      'assets/hotel/views.js?v=3',
      'assets/hotel/editors.js?v=2',
    ] },
    groups: { dependencies: ['hotel'], scripts: ['assets/hotel/groups.js?v=1'] },
    economat: { dependencies: ['hotel'], scripts: ['assets/hotel-economat.js?v=22'] },
    /* « Ouvrir la caisse » on the PIN lock: the store picker and the opening ticket. */
    lock: { dependencies: [], scripts: ['assets/lock-till.js?v=3'] },
  });
  const pending = new Map(), scripts = new Map(), ready = new Set();
  function script(url) {
    if (scripts.has(url)) return scripts.get(url);
    const request = new Promise((resolve, reject) => {
      const node = document.createElement('script');
      node.async = false;
      node.src = url;
      node.onload = resolve;
      node.onerror = () => { node.remove(); scripts.delete(url); reject(new Error('Module indisponible')); };
      document.head.appendChild(node);
    });
    scripts.set(url, request);
    return request;
  }
  function load(name) {
    if (pending.has(name)) return pending.get(name);
    const entry = REGISTRY[name];
    if (!entry) return Promise.reject(new Error('Unknown dashboard owner: ' + name));
    const request = entry.dependencies.reduce((p, dep) => p.then(() => load(dep)), Promise.resolve())
      .then(() => entry.scripts.reduce((p, url) => p.then(() => script(url)), Promise.resolve()))
      .then(() => {
        document.dispatchEvent(new Event('kiwi:dashboard-owners-ready'));
        ready.add(name);
      })
      .catch(error => { pending.delete(name); throw error; });
    pending.set(name, request);
    return request;
  }
  window.KiwiDashboardLoader = Object.freeze({ load });
  /* The lock is on screen at boot: fetch its picker now. A click that lands
     first waits for it, then plays again (lock-till.js takes it from there,
     or leaves the plain link on the demo). */
  if (document.querySelector?.('.kiwi-lock-caisse')) load('lock').catch(() => {});
  window.addEventListener('click', event => {
    if (ready.has('lock')) return;
    const a = event.target.closest?.('.kiwi-lock-caisse');
    if (!a?.classList?.contains('kiwi-lock-caisse')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    load('lock').then(() => { if (a.isConnected) a.click(); }, () => { location.href = a.href; });
  }, true);
  let replaying = false;
  function firstUse(event, target, activate) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return load('workspace').then(() => {
      if (!target.isConnected) return;
      replaying = true;
      try { activate(); } finally { replaying = false; }
    }).catch(() => {
      const lang = window.KiwiI18n?.getLang?.() || 'fr';
      const message = {fr:'Chargement impossible. Réessayez.',en:'Unable to load. Please retry.',ar:'تعذر التحميل. حاول مجددا.'};
      window.Kiwi?.toast?.(message[lang] || message.fr, {type:'error'});
    });
  }
  window.addEventListener('click', event => {
    if (replaying || ready.has('workspace')) return;
    const target = event.target.closest?.('[data-nav], [data-action], [data-fa-open], [data-kv-action], [data-pds-action="scan-salle"], #cd-campaign');
    if (!target) return;
    const nav = target.getAttribute('data-nav');
    const action = target.getAttribute('data-action') || '';
    const optional = target.matches?.('[data-pds-action="scan-salle"], #cd-campaign');
    // Eager pages and the date picker keep their synchronous click contract.
    // Only intents owned by the optional workspace graph may be replayed.
    if (!optional && !target.hasAttribute('data-fa-open') && !target.hasAttribute('data-kv-action') && !/^(?:clients-directory|growth-crm|order-qr|mx-import|bqx-import|rmw-menu-scan|scan-salle)$/.test(action)) return;
    if (['home', 'accueil'].includes(nav) || ['nav-home', 'nav-accueil'].includes(action)) return;
    firstUse(event, target, () => target.click());
  }, true);
  window.addEventListener('submit', event => {
    if (replaying || ready.has('workspace')) return;
    const form = event.target.closest?.('form.hai-input');
    if (form) firstUse(event, form, () => form.requestSubmit());
  }, true);
  const navigation = ['nav-reception', 'nav-chambres', 'nav-sejours', 'nav-menage', 'nav-tarifs', 'nav-hotes', 'nav-folios', 'nav-canaux', 'nav-hotelintel', 'nav-points-vente'];
  for (const name of Object.keys(H).filter(name => name.startsWith('hx-') || navigation.includes(name))) {
    const real = H[name];
    H[name] = function () {
      const self = this, args = arguments;
      const owner = name === 'hx-group-new' || name === 'hx-group-resume' ? 'groups' : 'hotel';
      return ready.has(owner) ? real.apply(self, args) : load(owner).then(() => real.apply(self, args));
    };
  }
  // Late module registration must retain guards that captured the first-use stub.
  for (const name of ['nav-economat', 'eco-sync', 'eco-receive', 'eco-receive-save']) {
    let live, real, forwarding = false;
    function stub() {
      const self = this, args = arguments;
      function forward() {
        if (forwarding) return real?.apply(self, args);
        forwarding = true;
        try { return H[name].apply(self, args); }
        finally { forwarding = false; }
      }
      return load('economat').then(forward);
    }
    live = stub;
    Object.defineProperty(H, name, {
      configurable: true, enumerable: true, get: () => live,
      set(fn) {
        if (document.currentScript?.src === new URL(REGISTRY.economat.scripts[0], document.baseURI).href) {
          real = fn;
          if (live === stub) live = fn;
        } else live = fn;
      },
    });
  }
})();
