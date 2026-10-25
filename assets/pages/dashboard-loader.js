/* Owner: first-use dashboard dependencies. Exposes KiwiDashboardLoader.load;
 * needs Kiwi.handlers and the hotel owner. Registry order is the ownership record:
 * hotel state/model stay in the shell, UI factories wait for a hotel action. */
(() => {
  'use strict';
  const H = window.Kiwi?.handlers;
  if (!H) return;
  const REGISTRY = Object.freeze({
    hotel: { dependencies: [], scripts: [
      'assets/hotel-rates.js?v=1',
      'assets/hotel-folio.js?v=1',
      'assets/hotel-channels.js?v=1',
      'assets/hotel/views.js?v=2',
      'assets/hotel/editors.js?v=2',
    ] },
    groups: { dependencies: ['hotel'], scripts: ['assets/hotel/groups.js?v=1'] },
    economat: { dependencies: ['hotel'], scripts: ['assets/hotel-economat.js?v=11'] },
  });
  const pending = new Map(), scripts = new Map(), ready = new Set();
  function script(url) {
    if (scripts.has(url)) return scripts.get(url);
    const request = new Promise((resolve, reject) => {
      const node = document.createElement('script');
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
      .then(() => { ready.add(name); })
      .catch(error => { pending.delete(name); throw error; });
    pending.set(name, request);
    return request;
  }
  window.KiwiDashboardLoader = Object.freeze({ load });
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
