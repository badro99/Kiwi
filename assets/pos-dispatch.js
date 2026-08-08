/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · POS DISPATCH — one terminal, every métier.
 * ---------------------------------------------------------------------------
 * The kiwi-caisse PIN screen routes one 4-digit code per vertical:
 *
 *   0000  pressing            Pressing Marshan
 *   0001  écran cuisine (KDS) (built into kiwi-caisse.html)
 *   0002  boutique            Maison Mansour
 *   0003  spa / bien-être     Spa Bahia
 *   0004  hôtel / riad        Riad Yasmina
 *   0005  fast-food / snack   Snack Chamal
 *   0006  boulangerie         Boulangerie Bab Kasbah
 *   0007  pizzeria            Pizzeria La Marsa
 *   0008  traiteur            Traiteur Dar Zellij
 *   0009  food truck          Karavan
 *   0010  épicerie            Épicerie Si Brahim
 *   0011  pharmacie           Pharmacie Ibn Batouta
 *   0012  librairie           Librairie Al Boughaz
 *   0013  fleuriste           Fleurs du Détroit
 *   0014  coiffure            Salon Yasmine
 *   0015  salle de sport      Atlas Fitness
 *   autre → caisse restaurant (Café Atlas) — the main demo, untouched.
 *
 * Each vertical lives in its own pair assets/pos-<id>.{js,css}, lazy-loaded
 * on first unlock (nothing weighs on the restaurant caisse). A vertical
 * module self-registers:
 *
 *   window.KiwiPosDispatch.register({
 *     id: 'boutique',                       // EXACTLY the registry id
 *     greet: { line1: 'Sba7 lkhir Salma,', em: 'marhba.',
 *              sub: 'Maison Mansour · ouverture boutique' },
 *     mount(rootEl) { ... },                // called ONCE, build the app here
 *     onShow() { ... },                     // optional — every re-unlock
 *   });
 *
 * The dispatcher owns the PIN-screen choreography (dot success animation,
 * fade, greeting flash, body classes `is-pos is-pos-<id> is-unlocked`) and
 * the way back: verticals call KiwiPosDispatch.lock() from their own
 * « Verrouiller » button — it clears classes and resets the PIN screen via
 * window.__kiwiPinReset() (exposed by kiwi-caisse.html).
 *
 * Roots are created per vertical as  <div class="vx-screen" id="pos-<id>">
 * (fixed, inset 0, z-index 90 — same layer recipe as the pressing). The
 * vertical styles its own interior with its OWN class prefix and reuses the
 * caisse modal kit (.modal-veil, .modal, .ma-btn, .cash-*, .reader-*) and
 * the shared #toast-stack.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const REGISTRY = {
    /* '0000' n'est PAS un index de tableau canonique — la clé reste une chaîne
     * et Object.entries() garde l'ordre d'insertion. Le pressing est donc un
     * vertical ordinaire, en tête de liste, et non plus une branche codée en
     * dur dans kiwi-caisse.html. */
    '0000': { id: 'pressing',    file: 'pressing-caisse', label: 'Pressing · Pressing Marshan' },
    '0002': { id: 'boutique',    file: 'pos-boutique',    label: 'Boutique · Maison Mansour' },
    '0003': { id: 'spa',         file: 'pos-spa',         label: 'Spa · Spa Bahia' },
    '0004': { id: 'hotel',       file: 'pos-hotel',       label: 'Hôtel / Riad · Riad Yasmina' },
    '0005': { id: 'fastfood',    file: 'pos-fastfood',    label: 'Fast-food · Snack Chamal' },
    '0006': { id: 'boulangerie', file: 'pos-boulangerie', label: 'Boulangerie · Bab Kasbah' },
    '0007': { id: 'pizzeria',    file: 'pos-pizzeria',    label: 'Pizzeria · La Marsa' },
    '0008': { id: 'traiteur',    file: 'pos-traiteur',    label: 'Traiteur · Dar Zellij' },
    '0009': { id: 'foodtruck',   file: 'pos-foodtruck',   label: 'Food truck · Karavan' },
    '0010': { id: 'epicerie',    file: 'pos-epicerie',    label: 'Épicerie · Si Brahim' },
    '0011': { id: 'pharmacie',   file: 'pos-pharmacie',   label: 'Pharmacie · Ibn Batouta' },
    '0012': { id: 'librairie',   file: 'pos-librairie',   label: 'Librairie · Al Boughaz' },
    '0013': { id: 'fleuriste',   file: 'pos-fleuriste',   label: 'Fleuriste · Fleurs du Détroit' },
    '0014': { id: 'coiffure',    file: 'pos-coiffure',    label: 'Coiffure · Salon Yasmine' },
    '0015': { id: 'gym',         file: 'pos-gym',         label: 'Salle de sport · Atlas Fitness' },
  };

  const apps = {};       /* id → registered spec */
  const mounted = {};    /* id → true once mount() ran */
  const loading = {};    /* file → Promise */
  let current = null;    /* id of the open vertical */

  /* ---------- base CSS (the shared screen shell only) ---------- */
  function injectBaseCss() {
    if (document.getElementById('vx-base-css')) return;
    const st = document.createElement('style');
    st.id = 'vx-base-css';
    st.textContent = `
      body.is-pos .shell, body.is-pos .topbar,
      body.is-pos .clockin-screen, body.is-pos .welcome-banner { display: none !important; }
      /* Action confirmations stay above every métier modal and camera overlay. */
      body.is-pos #toast-stack { z-index: 10050; }
      .vx-screen {
        --atlas: #0B6E4F; --riad: #053B2C;
        position: fixed; inset: 0; z-index: 90; display: none;
        background: var(--paper); color: var(--ink); font-family: var(--sans);
      }
      .vx-screen.is-on { display: flex; }
      .vx-screen.is-entering { animation: vx-dive 640ms cubic-bezier(0.32, 0.72, 0, 1) both; }
      @keyframes vx-dive { from { opacity: 0; transform: scale(1.04); } to { opacity: 1; transform: scale(1); } }
      @media (prefers-reduced-motion: reduce) { .vx-screen.is-entering { animation: none !important; } }
      /* PIN-screen code legend (tap the foot note) */
      .vx-codes {
        position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%);
        width: min(340px, calc(100vw - 32px));
        background: rgba(10, 15, 13, 0.92);
        -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 16px;
        padding: 14px 16px;
        z-index: 5;
        max-height: min(430px, 62vh); overflow-y: auto;
        display: none;
      }
      .vx-codes.is-open { display: block; animation: vx-codes-in 200ms ease-out; }
      @keyframes vx-codes-in { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
      .vx-codes-title {
        font-family: var(--mono); font-size: 10px; font-weight: 600;
        letter-spacing: 0.1em; text-transform: uppercase;
        color: rgba(255,255,255,0.55); margin-bottom: 9px;
      }
      .vx-code-row { display: flex; align-items: baseline; gap: 12px; padding: 4.5px 0; }
      .vx-code-row b { font-family: var(--mono); font-size: 12.5px; font-weight: 600; color: #7DF2B0; flex: 0 0 40px; }
      .vx-code-row span { font-size: 12px; color: rgba(255,255,255,0.85); }
      .vx-code-row.mut span, .vx-code-row.mut b { color: rgba(255,255,255,0.5); }
      .pin-foot { cursor: pointer; }
    `;
    document.head.appendChild(st);
  }

  /* ---------- lazy loading ---------- */
  function ensureLoaded(entry) {
    if (apps[entry.id]) return Promise.resolve();
    if (loading[entry.file]) return loading[entry.file];
    loading[entry.file] = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `assets/${entry.file}.css`;
      /* On attend aussi la feuille du vertical avant de résoudre — sans ça,
         le premier montage sur réseau lent flashe un chrome sans style.
         Fail-soft : onerror ou 2,5 s débloquent quand même le montage. */
      const cssReady = new Promise((done) => {
        link.onload = link.onerror = () => done();
        setTimeout(done, 2500);
      });
      document.head.appendChild(link);
      /* L'ADN partagé (caisse-dna.css) doit rester après la feuille du
         vertical dans la cascade — on repousse son <link> en fin de <head>. */
      const dna = document.getElementById('caisse-dna-css');
      if (dna) document.head.appendChild(dna);
      const sc = document.createElement('script');
      sc.src = `assets/${entry.file}.js`;
      sc.onload = () => cssReady.then(() => (apps[entry.id] ? resolve() : reject(new Error(`${entry.file}.js loaded but never registered "${entry.id}"`))));
      sc.onerror = () => reject(new Error(`assets/${entry.file}.js introuvable`));
      document.head.appendChild(sc);
    });
    return loading[entry.file];
  }

  function rootFor(id) {
    let el = document.getElementById(`pos-${id}`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'vx-screen';
      el.id = `pos-${id}`;
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    return el;
  }

  function toast(msg) {
    if (typeof window.KiwiCaisseToast === 'function') { window.KiwiCaisseToast(msg); return; }
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const lower = String(msg || '').toLowerCase();
    const kind = /refus|erreur|illisible|impossible|requis/.test(lower) ? 'danger' : /d'abord|attention|déjà|scannez/.test(lower) ? 'warn' : 'success';
    const el = document.createElement('div');
    el.className = `toast is-${kind}`;
    el.setAttribute('role', kind === 'danger' ? 'alert' : 'status');
    const copy = document.createElement('span'); copy.className = 'toast-copy';
    const title = document.createElement('span'); title.className = 'toast-title'; title.textContent = msg;
    copy.appendChild(title); el.appendChild(copy);
    stack.appendChild(el);
    setTimeout(() => el.classList.add('fade'), 2200);
    setTimeout(() => el.remove(), 2480);
  }

  /* ---------- unlock / lock choreography (mirrors the pressing) ---------- */
  function unlock(pin) {
    const entry = REGISTRY[pin];
    if (!entry) return;
    const pinScreen = document.getElementById('pin-screen');
    document.querySelectorAll('#pin-dots .pin-dot').forEach((d, i) =>
      setTimeout(() => d.classList.add('is-success'), i * 70));

    const ready = ensureLoaded(entry).catch((err) => {
      /* module missing (not built yet / bad path): be honest, reset the PIN */
      setTimeout(() => {
        toast(`${entry.label}, module indisponible (${err.message})`);
        if (typeof window.__kiwiPinReset === 'function') window.__kiwiPinReset();
        document.querySelectorAll('#pin-dots .pin-dot').forEach((d) => d.classList.remove('is-success'));
      }, 500);
      return Promise.reject(err);
    });

    setTimeout(() => {
      ready.then(() => {
        if (pinScreen) pinScreen.classList.add('is-leaving');
        document.body.classList.add('is-pos', `is-pos-${entry.id}`, 'is-unlocked');
      }).catch(() => {});
    }, 460);

    setTimeout(() => {
      ready.then(() => {
        if (pinScreen) pinScreen.style.display = 'none';
        entryFlash(apps[entry.id], () => show(entry.id));
      }).catch(() => {});
    }, 940);
  }

  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function escGreet(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function entryFlash(spec, done) {
    const g = document.createElement('div');
    g.className = 'kiwi-greet';
    g.setAttribute('aria-hidden', 'true');
    const greet = spec.greet || {};
    /* Real / paired store → the 2s unlock flash must not name a demo employee
       ("Sba7 lkhir Salma / Reda") or a demo venue ("Maison Mansour · …"). Show
       a neutral greeting, subtitled with the real store name when we have it.
       Local demo (unpaired localhost) keeps the full flavoured greeting.

       Unless we know WHO just unlocked: the staff code they entered names them
       (assets/caisse-pairing.js → window.KiwiStaff), and greeting the actual
       person is the whole point of asking for a personal code. That beats both
       the neutral real-store line and the demo's hardcoded cast. */
    const p = pvPaired();
    const real = !!p || (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal());
    const me = window.KiwiStaff || null;
    const who = me && (me.first || me.name);
    const line1 = who ? ('Sba7 lkhir ' + escGreet(who) + ',')
      : (real ? 'Sba7 lkhir,' : (greet.line1 || 'Sba7 lkhir,'));
    const sub   = real ? (p && p.name ? escGreet(p.name) : '') : (greet.sub || '');
    g.innerHTML = `<div class="kiwi-greet-inner">
      <h1>${line1} <em>${greet.em || 'marhba.'}</em></h1>
      <div class="kiwi-greet-sub">${sub}</div>
    </div>`;
    document.body.appendChild(g);
    requestAnimationFrame(() => { g.classList.add('is-visible'); g.setAttribute('aria-hidden', 'false'); });
    setTimeout(() => { g.classList.remove('is-visible'); done(); }, 2150);
    setTimeout(() => g.remove(), 3000);
  }

  function show(id) {
    const spec = apps[id];
    const root = rootFor(id);
    if (!mounted[id]) {
      mounted[id] = true;
      try { spec.mount(root); }
      catch (e) { toast(`${id}: erreur au montage, ${e.message}`); }
    } else if (typeof spec.onShow === 'function') {
      try { spec.onShow(); } catch (e) {}
    }
    /* « Rafraîchir » se pose ici, une fois, pour tous les métiers : chaque
     * module a son pied de rail avec son propre préfixe, mais tous ont un
     * #xx-lock, et c'est tout ce dont le bouton a besoin pour se ranger au bon
     * endroit et au bon format (assets/caisse-refresh.js). */
    try { if (window.KiwiCaisseRefresh) window.KiwiCaisseRefresh.mount(root); } catch (e) {}
    /* « Réimprimer » se pose au même endroit et pour la même raison : le rouleau
     * bourre sur les seize métiers, pas seulement au restaurant. Il connaît le
     * métier ouvert — c'est ce qui lui dit quel journal lire
     * (assets/pos-reprint.js). Absent sur la démo, qui n'encaisse rien. */
    try { if (window.KiwiPosReprint) window.KiwiPosReprint.mount(root, id); } catch (e) {}
    current = id;
    root.classList.add('is-on', 'is-entering');
    root.setAttribute('aria-hidden', 'false');
    setTimeout(() => root.classList.remove('is-entering'), 700);
    if (window.lucide) try { window.lucide.createIcons(); } catch (e) {}
  }

  function lock() {
    if (current) {
      const root = document.getElementById(`pos-${current}`);
      if (root) {
        root.classList.remove('is-on');
        root.setAttribute('aria-hidden', 'true');
        root.querySelectorAll('.modal-veil.is-open').forEach((v) => v.classList.remove('is-open'));
      }
      document.body.classList.remove(`is-pos-${current}`);
      current = null;
    }
    document.body.classList.remove('is-pos', 'is-unlocked');
    if (typeof window.__kiwiPinReset === 'function') window.__kiwiPinReset();
    toast('Terminal verrouillé');
  }

  /* ---------- PIN-screen legend (tap the foot note for all codes) ---------- */
  function initLegend() {
    // On the hosted app (demos off) never advertise the demo code list — a real
    // merchant only ever pairs their own store. Local keeps the full legend.
    if (window.KiwiEnv && window.KiwiEnv.demosAllowed === false) return;
    const pinScreen = document.getElementById('pin-screen');
    const foot = pinScreen && pinScreen.querySelector('.pin-foot');
    if (!foot) return;
    const panel = document.createElement('div');
    panel.className = 'vx-codes';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Codes de la démo');
    panel.innerHTML = `
      <div class="vx-codes-title">Codes de la démo, un métier par code</div>
      ${Object.entries(REGISTRY)
          .concat([['0001', { label: 'Écran cuisine (station KDS)' }]])
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([pin, e]) => `<div class="vx-code-row"><b>${pin}</b><span>${e.label}</span></div>`).join('')}
      <div class="vx-code-row mut"><b>····</b><span>Tout autre code → caisse restaurant (Café Atlas)</span></div>`;
    pinScreen.appendChild(panel);
    foot.addEventListener('click', () => panel.classList.toggle('is-open'));
  }

  function boot() {
    injectBaseCss();
    initLegend();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // Boot a vertical by its id (e.g. 'boutique', 'spa', 'gym') rather than its demo
  // PIN — used by the pairing module to open a paired store's matching register.
  function unlockById(id) {
    for (const pin in REGISTRY) { if (REGISTRY[pin].id === id) return unlock(pin); }
  }

  // Redessiner le métier ouvert avec des données fraîchement arrivées. onShow()
  // est déjà le geste « on revient sur cet écran » ; personne d'autre n'a besoin
  // de savoir quel module est ouvert.
  function repaint() {
    if (!current) return false;
    const spec = apps[current];
    if (!spec || typeof spec.onShow !== 'function') return false;
    try { spec.onShow(); return true; } catch (e) { return false; }
  }

  window.KiwiPosDispatch = {
    has: (pin) => !!REGISTRY[pin],
    unlock,
    unlockById,
    lock,
    repaint,
    current: () => current,
    register(spec) {
      if (!spec || !spec.id || typeof spec.mount !== 'function') {
        throw new Error('KiwiPosDispatch.register: spec {id, mount()} requis');
      }
      apps[spec.id] = spec;
    },
    registry: REGISTRY,
  };
})();
