/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assets/delivery.js · window.KiwiDelivery
 * ---------------------------------------------------------------------------
 * LA LIVRAISON D'UN RESTAURANT : les plateformes (Glovo, Kooul, Yassir, ou une
 * autre) et la livraison maison. Spec : docs/specs/2026-11-24-plateformes-de-livraison.md
 *
 * Une plateforme prend une commission, donc le restaurant y affiche d'autres
 * prix. Le caissier lit la commande sur la tablette de la plateforme et la
 * saisit dans Kiwi au prix de CETTE plateforme ; Kiwi l'envoie en cuisine, la
 * compte comme réglée par la plateforme et la range sous son nom (« Glovo :
 * 4 000 MAD ») dans le rapport Z et au tableau de bord. La livraison maison
 * garde les prix de la salle et ajoute des frais fixes.
 *
 * ── OÙ VIVENT CES PRIX, ET POURQUOI PAS SUR L'ARTICLE ──────────────────────
 * Même raison que le coût de revient (assets/cost.js) : GET /api/menu sans
 * ?mine=1 est PUBLIC, c'est ce que lit Order Pro, et sanitizeMenu est une liste
 * blanche fermée. Les prix des plateformes vivent donc dans leur document,
 * `delivery`, par établissement. Order Pro ne les voit jamais : il lit la carte
 * du restaurant et ses prix de salle, rien d'autre
 * (tools/delivery-platforms-test.mjs le tient).
 *
 * La commission et les frais par commande ne sont PAS ici : ils vont dans le
 * document `charges` (commissions.channels / commissions.fees), que le serveur
 * expurge pour la caisse appairée. Le calcul net (assets/charges-engine.js) les
 * lit vente par vente, par canal.
 *
 * ── LE CANAL ─────────────────────────────────────────────────────────────────
 * L'identifiant d'une option EST le canal de la vente : `glovo`, `kooul`,
 * `yassir`, `livraison` (la maison), ou `pf` + lettres pour une autre
 * plateforme. Lettres seulement : functions/api/sale.js ne garde que [a-z] sur
 * 24 caractères.
 *
 * Rien n'apparaît tant que le patron n'a pas allumé UNE option. Éteindre la
 * dernière fait tout disparaître : caisse, carte, rapport Z, tableau de bord.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  const HOUSE = 'livraison';
  const PRESETS = {
    glovo:  { name: 'Glovo',  color: '#FFC244', logo: 'assets/brands/delivery/glovo.png' },
    kooul:  { name: 'Kooul',  color: '#FC3C53', logo: 'assets/brands/delivery/kooul.png' },
    yassir: { name: 'Yassir', color: '#6316DB', logo: 'assets/brands/delivery/yassir.png' },
  };
  /* Les couleurs qu'une « autre plateforme » peut prendre : franches, lisibles
   * sous une lettre blanche, et aucune n'est le vert de Kiwi. */
  const COLORS = ['#E4572E', '#2B7BD6', '#8E44AD', '#D81B60', '#00897B', '#6D4C41'];
  const ICON_MOTO = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-160q-66 0-113-47T40-320q0-66 47-113t113-47q51 0 92 29t59 77h75l-60-178h-84q-17 0-28.5-11.5T242-592q0-17 11.5-28.5T282-632h84q26 0 46 14t28 38l66 196 132-130-30-80h-50q-17 0-28.5-11.5T518-634q0-17 11.5-28.5T558-674h52q25 0 45.5 14t28.5 38l38 104h38q66 0 113 47t47 113q0 66-47 113t-113 47q-66 0-113-47t-47-113q0-27 8-51.5t24-44.5l-10-25-122 122q-11 11-25.5 17t-30.5 6h-77q-18 48-59 77t-92 29Zm0-80q38 0 63-25.5t25-54.5h-88q-17 0-28.5-11.5T160-360q0-17 11.5-28.5T200-400h88q0-29-25-54.5T200-480q-33 0-56.5 23.5T120-400q0 33 23.5 56.5T200-320Zm560 0q33 0 56.5-23.5T840-400q0-33-23.5-56.5T760-480q-33 0-56.5 23.5T680-400q0 33 23.5 56.5T760-320Z"/></svg>';

  const num = (v) => {
    if (v == null || (typeof v === 'string' && !v.trim())) return null;
    const n = +String(v).replace(',', '.');
    return Number.isFinite(n) && n >= 0 && n <= 1000000 ? Math.round(n * 100) / 100 : null;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lang = () => {
    try { const l = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || localStorage.getItem('kiwiLang') || 'fr'; return /^(en|ar)$/.test(l) ? l : 'fr'; } catch (_) { return 'fr'; }
  };
  const tr = (o) => (o == null ? '' : (o[lang()] != null ? o[lang()] : o.fr));
  const stamp = (x) => (x && Number.isFinite(+x.at) ? +x.at : 0);
  const newer = (a, b) => (!a ? b : !b ? a : (stamp(a) >= stamp(b) ? a : b));
  const isId = (id) => typeof id === 'string' && /^[a-z]{2,24}$/.test(id);

  function blank() { return { v: 1, platforms: {}, house: { on: false, fee: null, at: 0 }, prices: {}, choices: {}, updatedAt: 0 }; }

  /* Deux appareils qui règlent en même temps : chaque plateforme, chaque prix
   * d'article et chaque prix de supplément garde sa saisie la plus récente. */
  function mergeMap(a, b) {
    const out = {};
    new Set(Object.keys(a || {}).concat(Object.keys(b || {}))).forEach((k) => {
      const w = newer((a || {})[k], (b || {})[k]);
      if (w) out[k] = w;
    });
    return out;
  }
  function merge(mine, theirs) {
    const a = mine || blank(), b = theirs || blank();
    return {
      v: 1,
      platforms: mergeMap(a.platforms, b.platforms),
      house: newer(a.house, b.house) || blank().house,
      prices: mergeMap(a.prices, b.prices),
      choices: mergeMap(a.choices, b.choices),
      updatedAt: Math.max(+a.updatedAt || 0, +b.updatedAt || 0),
    };
  }

  const store = window.KiwiStore && window.KiwiStore.define
    ? window.KiwiStore.define('delivery', {
        cloud: 'delivery', blank,
        isEmpty: (d) => !d || (!Object.keys(d.platforms || {}).length && !(d.house && d.house.at) && !Object.keys(d.prices || {}).length),
        merge: (mine, theirs) => merge(mine, theirs),
      })
    : null;
  /* Hors de la caisse et du tableau de bord (un test, une page sans
   * venue-store.js) : un document en mémoire, pour que l'API réponde pareil. */
  let memo = blank();
  const doc = () => {
    const d = store ? store.get() : memo;
    return d && typeof d === 'object' ? Object.assign(blank(), d) : blank();
  };
  const save = (d) => { d.updatedAt = Date.now(); if (store) store.set(d); else memo = d; notify(); return d; };

  const subs = new Set();
  function notify() { subs.forEach((fn) => { try { fn(); } catch (_) {} }); }
  if (store) store.subscribe(() => notify());

  /* ── les options allumées ── */
  function platformOf(id, d) {
    const p = (d || doc()).platforms[id];
    if (!p || p.deleted) return null;
    const pre = PRESETS[id];
    return {
      id, kind: 'platform', on: !!p.on, preset: !!pre,
      name: pre ? pre.name : String(p.name || '').slice(0, 30) || 'Plateforme',
      color: pre ? pre.color : (COLORS.indexOf(p.color) >= 0 ? p.color : COLORS[0]),
      logo: pre ? pre.logo : '',
    };
  }
  function house(d) {
    const h = (d || doc()).house || {};
    return { id: HOUSE, kind: 'house', on: !!h.on, name: tr({ fr: 'Livraison maison', en: 'In-house delivery', ar: 'توصيل المطعم' }), fee: num(h.fee) || 0, color: '', logo: '' };
  }
  /* Ordre stable : les trois de série d'abord, puis les autres par nom. */
  function platforms(d) {
    d = d || doc();
    const ids = Object.keys(d.platforms || {}).filter(isId);
    const pre = Object.keys(PRESETS).filter((k) => ids.indexOf(k) >= 0);
    const rest = ids.filter((k) => !PRESETS[k]).sort((x, y) => String((d.platforms[x] || {}).name).localeCompare(String((d.platforms[y] || {}).name)));
    return pre.concat(rest).map((id) => platformOf(id, d)).filter(Boolean);
  }
  function options() {
    const d = doc();
    const out = platforms(d).filter((p) => p.on);
    const h = house(d);
    if (h.on) out.push(h);
    return out;
  }
  const enabled = () => options().length > 0;
  function option(id) {
    if (id === HOUSE) { const h = house(); return h.on ? h : null; }
    const p = platformOf(id);
    return p && p.on ? p : null;
  }
  /* Le nom d'un canal de vente, même éteint (une vente d'hier reste « Glovo »). */
  function labelOf(ch) {
    const id = String(ch || '').toLowerCase();
    if (id === HOUSE) return house().name;
    if (PRESETS[id]) return PRESETS[id].name;
    const p = platformOf(id);
    return p ? p.name : '';
  }
  /* Un canal de livraison : une des trois de série, la maison, ou une
   * plateforme que ce restaurant a déclarée (même éteinte depuis). */
  const isChannel = (ch) => { const id = String(ch || '').toLowerCase(); return id === HOUSE || !!PRESETS[id] || !!platformOf(id); };

  /* ── les prix ── */
  function priceOf(itemId, pid) {
    const e = doc().prices[String(itemId)];
    return e && e.by ? num(e.by[pid]) : null;
  }
  function choicePriceOf(choiceId, pid) {
    const e = doc().choices[String(choiceId)];
    return e && e.by ? num(e.by[pid]) : null;
  }
  function setItemPrices(itemId, by) {
    if (!itemId) return;
    const d = doc(), clean = {};
    Object.keys(by || {}).forEach((k) => { const n = num(by[k]); if (isId(k) && n != null) clean[k] = n; });
    d.prices = Object.assign({}, d.prices);
    d.prices[String(itemId)] = { by: clean, at: Date.now() };
    save(d);
  }
  function setChoicePrices(map) {
    const d = doc(), now = Date.now();
    d.choices = Object.assign({}, d.choices);
    Object.keys(map || {}).forEach((cid) => {
      const clean = {};
      Object.keys(map[cid] || {}).forEach((k) => { const n = num(map[cid][k]); if (isId(k) && n != null) clean[k] = n; });
      d.choices[String(cid)] = { by: clean, at: now };
    });
    save(d);
  }
  /* « +25 % sur toute la carte, arrondi au dirham » : ne remplit que les cases
   * vides, sauf si `overwrite`. Un prix déjà réglé à la main n'est pas écrasé. */
  function bulkFill(pid, pct, items, overwrite) {
    const p = +pct;
    if (!isId(pid) || !Number.isFinite(p) || p < -90 || p > 300) return 0;
    const d = doc(), now = Date.now();
    d.prices = Object.assign({}, d.prices);
    let n = 0;
    (items || []).forEach((it) => {
      const base = num(it && it.price);
      if (!it || !it.id || base == null || it.archived) return;
      const cur = d.prices[String(it.id)] || { by: {} };
      if (!overwrite && num(cur.by && cur.by[pid]) != null) return;
      const by = Object.assign({}, cur.by);
      by[pid] = Math.round(base * (1 + p / 100));
      d.prices[String(it.id)] = { by, at: now };
      n++;
    });
    if (n) save(d);
    return n;
  }

  /* ── les badges : logo, nom, numéro ── */
  function logoHTML(id, px) {
    const s = Math.max(14, +px || 22), r = Math.round(s * 0.24);
    const o = id === HOUSE ? house() : (platformOf(id) || (PRESETS[id] ? Object.assign({ id }, PRESETS[id]) : null));
    if (id === HOUSE) return `<span class="kdl-tile kdl-house" style="width:${s}px;height:${s}px;border-radius:${r}px">${ICON_MOTO}</span>`;
    if (o && o.logo) return `<img class="kdl-tile" src="${esc(o.logo)}" width="${s}" height="${s}" style="border-radius:${r}px" alt="">`;
    const name = (o && o.name) || '?';
    return `<span class="kdl-tile kdl-letter" style="width:${s}px;height:${s}px;border-radius:${r}px;background:${esc((o && o.color) || COLORS[0])};font-size:${Math.round(s * 0.55)}px">${esc(name.charAt(0).toUpperCase())}</span>`;
  }
  function badgeHTML(id, ref, px) {
    const name = labelOf(id) || id;
    return `<span class="kdl-badge">${logoHTML(id, px || 20)}<b>${esc(name)}</b>${ref ? `<span class="kdl-ref">${esc(ref)}</span>` : ''}</span>`;
  }
  /* Les styles des badges, une fois par page. Ils ne lisent que des jetons
   * partagés (encre, ligne, surface) : le logo porte sa propre couleur, le
   * reste suit le thème, classique ou 2027, clair ou sombre. */
  function ensureCSS() {
    if (document.getElementById('kdl-css')) return;
    const s = document.createElement('style');
    s.id = 'kdl-css';
    s.textContent = '.kdl-tile{display:inline-grid;place-items:center;flex:none;object-fit:cover;vertical-align:middle}'
      + '.kdl-house{background:var(--k-surface-3,var(--line,#E4E0D6));color:var(--k-ink-1,var(--ink,#0A0F0D))}.kdl-house svg{width:70%;height:70%}'
      + '.kdl-letter{color:#fff;font-weight:600;line-height:1}'
      + '.kdl-badge{display:inline-flex;align-items:center;gap:6px;padding:3px 9px 3px 3px;border:1px solid var(--k-line,var(--line,rgba(0,0,0,.12)));border-radius:999px;background:var(--k-surface-1,var(--surface,transparent));color:inherit;font-size:13px;line-height:1.2;white-space:nowrap;vertical-align:middle}'
      + '.kdl-badge b{font-weight:600}.kdl-ref{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:12px;opacity:.75}';
    (document.head || document.documentElement).appendChild(s);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureCSS, { once: true }); else ensureCSS();
  }

  /* ── la commission (document `charges`, tableau de bord seulement) ── */
  function chargesDoc() {
    try { return window.KiwiCharges && window.KiwiCharges.doc ? window.KiwiCharges.doc() : null; } catch (_) { return null; }
  }
  function commissionOf(id) {
    const c = chargesDoc();
    const com = c && c.commissions;
    return { rate: com && com.channels && com.channels[id] != null ? +com.channels[id] : null, fee: com && com.fees && com.fees[id] != null ? +com.fees[id] : null };
  }
  function setCommissions(map) {
    const C = window.KiwiCharges, E = window.KiwiChargesEngine;
    if (!C || !C.store || !E || !E.normalize) return false;
    const cur = E.normalize(C.doc());
    const com = { methods: Object.assign({}, cur.commissions.methods), channels: Object.assign({}, cur.commissions.channels), fees: Object.assign({}, cur.commissions.fees) };
    Object.keys(map || {}).forEach((id) => {
      const r = map[id].rate, f = map[id].fee;
      if (r == null) delete com.channels[id]; else com.channels[id] = r;
      if (f == null) delete com.fees[id]; else com.fees[id] = f;
    });
    C.store.set(E.normalize(Object.assign({}, cur, { commissions: com, updatedAt: Date.now() })));
    return true;
  }

  /* ═════════════════════ LE RÉGLAGE (tableau de bord) ═════════════════════ */
  const S = {
    title: { fr: 'Livraison', en: 'Delivery', ar: 'التوصيل' },
    tab: { fr: 'Livraison', en: 'Delivery', ar: 'التوصيل' },
    dineIn: { fr: 'Salle', en: 'Dine-in', ar: 'القاعة' },
    lede: { fr: 'Allumez les plateformes avec lesquelles vous travaillez. La caisse propose alors «\u00a0Livraison\u00a0», avec les prix de chaque plateforme, et le rapport Z les compte chacune sous son nom.', en: 'Turn on the platforms you work with. The till then offers «\u00a0Delivery\u00a0» with each platform\'s prices, and the Z report counts each one under its own name.', ar: 'فعّل المنصات التي تعمل معها. يعرض الصندوق عندها «\u00a0التوصيل\u00a0» بأسعار كل منصة، ويحسب تقرير Z كل منصة باسمها.' },
    platforms: { fr: 'Plateformes', en: 'Platforms', ar: 'المنصات' },
    rate: { fr: 'Commission %', en: 'Commission %', ar: 'العمولة %' },
    fee: { fr: 'Frais par commande (MAD)', en: 'Fee per order (MAD)', ar: 'رسوم لكل طلب (درهم)' },
    fillLbl: { fr: 'Prix livraison depuis la salle', en: 'Delivery prices from dine-in', ar: 'أسعار التوصيل من أسعار القاعة' },
    otherAdd: { fr: 'Ajouter une autre plateforme', en: 'Add another platform', ar: 'إضافة منصة أخرى' },
    other: { fr: 'Autre plateforme', en: 'Other platform', ar: 'منصة أخرى' },
    otherName: { fr: 'Nom de la plateforme', en: 'Platform name', ar: 'اسم المنصة' },
    add: { fr: 'Ajouter', en: 'Add', ar: 'إضافة' },
    remove: { fr: 'Retirer', en: 'Remove', ar: 'إزالة' },
    house: { fr: 'Livraison maison', en: 'In-house delivery', ar: 'توصيل المطعم' },
    houseP: { fr: 'Votre propre livreur : les prix de la salle, plus des frais de livraison fixes. Le client vous paie directement.', en: 'Your own driver: dine-in prices plus a fixed delivery fee. The customer pays you directly.', ar: 'موصّلك الخاص: أسعار القاعة مع رسوم توصيل ثابتة. يدفع لك الزبون مباشرة.' },
    houseFee: { fr: 'Frais de livraison (MAD)', en: 'Delivery fee (MAD)', ar: 'رسوم التوصيل (درهم)' },
    fill: { fr: 'Remplir les prix', en: 'Fill prices', ar: 'ملء الأسعار' },
    fillP: { fr: 'Calcule le prix de chaque produit depuis son prix en salle, arrondi au dirham. Les prix déjà saisis ne bougent pas.', en: 'Works out each product\'s price from its dine-in price, rounded to the dirham. Prices already set stay as they are.', ar: 'يحسب سعر كل منتج من سعره في القاعة، مقرّبًا إلى الدرهم. الأسعار المحددة تبقى كما هي.' },
    fillGo: { fr: 'Appliquer', en: 'Apply', ar: 'تطبيق' },
    filled: { fr: '{n} prix remplis', en: '{n} prices filled', ar: 'تم ملء {n} سعر' },
    products: { fr: 'Prix des produits', en: 'Product prices', ar: 'أسعار المنتجات' },
    productsP: { fr: 'Une case vide : ce produit n\'est pas proposé sur cette plateforme. « Remplir les prix » remplit les cases vides depuis la salle.', en: 'An empty box: this product is not offered on that platform. « Fill prices » fills empty boxes from the dine-in price.', ar: 'خانة فارغة: هذا المنتج غير معروض على هذه المنصة. «ملء الأسعار» يملأ الخانات الفارغة من سعر القاعة.' },
    choices: { fr: 'Prix des suppléments', en: 'Extra prices', ar: 'أسعار الإضافات' },
    choicesP: { fr: 'Une case vide garde le prix de la salle.', en: 'An empty box keeps the dine-in price.', ar: 'الخانة الفارغة تحتفظ بسعر القاعة.' },
    save: { fr: 'Enregistrer', en: 'Save', ar: 'حفظ' },
    cancel: { fr: 'Annuler', en: 'Cancel', ar: 'إلغاء' },
    saved: { fr: 'Livraison enregistrée', en: 'Delivery saved', ar: 'تم حفظ التوصيل' },
    errRate: { fr: 'Une commission va de 0 à 60 %.', en: 'A commission is between 0 and 60 %.', ar: 'العمولة بين 0 و60 %.' },
    priceRow: { fr: 'Prix par plateforme', en: 'Price per platform', ar: 'السعر حسب المنصة' },
    notSold: { fr: 'pas vendu', en: 'not sold', ar: 'غير معروض' },
    findPh: { fr: 'Rechercher parmi {n} produits', en: 'Search {n} products', ar: 'ابحث في {n} منتج' },
    priceHint: { fr: 'Case vide : ce produit n\'est pas proposé sur cette plateforme.', en: 'Empty box: this product is not offered on that platform.', ar: 'خانة فارغة: هذا المنتج غير معروض على هذه المنصة.' },
  };

  function menuItems() {
    try { return (window.KiwiMenuStore && window.KiwiMenuStore.items && window.KiwiMenuStore.items()) || []; } catch (_) { return []; }
  }
  function menuCats() {
    try { return (window.KiwiMenuStore && window.KiwiMenuStore.categories && window.KiwiMenuStore.categories()) || []; } catch (_) { return []; }
  }
  function optGroups() {
    try { const d = window.KiwiMenuStore && window.KiwiMenuStore.data && window.KiwiMenuStore.data(); return (d && Array.isArray(d.opts)) ? d.opts : []; } catch (_) { return []; }
  }

  /* `host` : l'onglet « Livraison » de Menu & modificateurs pose les mêmes
   * cartes dans la page ; sans hôte, la fenêtre (accueil, ancienne carte). */
  function openSettings(host) {
    const K = window.Kiwi;
    if (!K || (!host && !K.modal)) return;
    const d = doc();
    const plats = platforms(d);
    const rowFor = (p) => {
      const c = commissionOf(p.id);
      return `<div class="kdl-card${p.on ? ' is-on' : ''}" data-pid="${p.id}">
        <div class="kdl-head">${logoHTML(p.id, 36)}<b>${esc(p.name)}</b>
          ${p.preset ? '' : `<button type="button" class="kdl-link" data-kdl-del>${esc(tr(S.remove))}</button>`}
          <button type="button" class="kdl-sw${p.on ? ' on' : ''}" role="switch" aria-checked="${p.on}" aria-label="${esc(p.name)}" data-kdl-on></button></div>
        <div class="kdl-body">
          <div class="kdl-grid">
            <div><label class="kf-label">${esc(tr(S.rate))}</label><input class="kf-input" type="number" inputmode="decimal" min="0" max="60" step="0.1" data-kdl-rate value="${c.rate == null ? '' : c.rate}" placeholder="0"></div>
            <div><label class="kf-label">${esc(tr(S.fee))}</label><input class="kf-input" type="number" inputmode="decimal" min="0" step="0.5" data-kdl-fee value="${c.fee == null ? '' : c.fee}" placeholder="0"></div>
          </div>
          <label class="kf-label">${esc(tr(S.fillLbl))}</label>
          <div class="kdl-fill"><span class="kdl-pct"><input class="kf-input" type="number" inputmode="decimal" step="1" data-kdl-pct placeholder="25" aria-label="${esc(tr(S.fillLbl))}"><span class="kdl-pct-u">%</span></span><button type="button" class="kb ghost" data-kdl-fill>${esc(tr(S.fill))}</button></div>
          <div class="kf-help">${esc(tr(S.fillP))}</div>
        </div>
      </div>`;
    };
    // Les trois de série apparaissent toujours, allumées ou non.
    const shown = Object.keys(PRESETS).map((id) => plats.find((p) => p.id === id) || { id, kind: 'platform', on: false, preset: true, name: PRESETS[id].name, color: PRESETS[id].color, logo: PRESETS[id].logo })
      .concat(plats.filter((p) => !p.preset));
    const h = house(d);
    const groups = optGroups().filter((g) => g && Array.isArray(g.choices) && g.choices.some((ch) => num(ch.price)));
    /* Les produits aussi, pas seulement les suppléments (Jon's Burgers, 26 nov.
       2026) : le même prix que la fiche produit (« Prix par plateforme »). */
    /* Tous les plats actifs, rangés par section de la carte, même ceux sans
       prix en salle (« pas tous », Jon's Burgers, 27 nov. 2026). */
    const cats = menuCats();
    const catRank = new Map(cats.map((c, i) => [String(c.id), i]));
    const catName = (id) => { const c = cats.find((x) => String(x.id) === String(id)); return c ? String(c.name || '') : ''; };
    const products = menuItems().filter((it) => it && it.id && !it.archived)
      .map((it, i) => ({ it, i, r: catRank.has(String(it.catId)) ? catRank.get(String(it.catId)) : 1e6 }))
      .sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.it);
    const body = `<div class="kdl-set">
        <div class="kdl-h">${esc(tr(S.platforms))}</div>
        <div class="kdl-list" data-kdl-list>${shown.map(rowFor).join('')}</div>
        <div class="kdl-add"><input class="kf-input" type="text" maxlength="30" data-kdl-newname placeholder="${esc(tr(S.otherName))}" aria-label="${esc(tr(S.otherAdd))}"><button type="button" class="kb ghost" data-kdl-add>${esc(tr(S.add))}</button></div>
        <div class="kdl-err" data-kdl-err hidden></div>
        <div class="kdl-h">${esc(tr(S.house))}</div>
        <div class="kdl-card${h.on ? ' is-on' : ''}" data-house>
          <div class="kdl-head">${logoHTML(HOUSE, 36)}<b>${esc(tr(S.house))}</b>
            <button type="button" class="kdl-sw${h.on ? ' on' : ''}" role="switch" aria-checked="${h.on}" aria-label="${esc(tr(S.house))}" data-kdl-house></button></div>
          <div class="kdl-body">
            <div class="kdl-grid"><div><label class="kf-label">${esc(tr(S.houseFee))}</label><input class="kf-input" type="number" inputmode="decimal" min="0" step="1" data-kdl-housefee value="${h.fee || ''}" placeholder="20"></div></div>
            <div class="kf-help">${esc(tr(S.houseP))}</div>
          </div>
        </div>
        ${products.length ? `<div class="kdl-h">${esc(tr(S.products))}</div><div class="kf-help">${esc(tr(S.productsP))}</div><div class="kdl-find" data-find-scope><div class="kdl-find-bar" data-find="delivery-prices" data-find-ph="${esc(tr(S.findPh).replace('{n}', products.length))}"></div><div class="kdl-choices" data-kdl-products></div></div>` : ''}
        ${groups.length ? `<div class="kdl-h">${esc(tr(S.choices))}</div><div class="kf-help">${esc(tr(S.choicesP))}</div><div class="kdl-choices" data-kdl-choices></div>` : ''}
      </div>`;
    const saveBtn = `<button class="kb atlas" type="button" data-kdl-save>${esc(tr(S.save))}</button>`;
    let m;
    if (host) {
      host.innerHTML = `<div class="kdl-inline" data-kdl-inline><div class="kdl-intro"><div class="kdl-title">${esc(tr(S.title))}</div><p class="kdl-lede">${esc(tr(S.lede))}</p></div>${body}<div class="kdl-foot">${saveBtn}</div></div>`;
      m = { el: host.firstElementChild, close() {} };
    } else {
      m = K.modal({
        tag: tr(S.title), title: tr(S.title), width: 640,
        desc: esc(tr(S.lede)),
        body,
        foot: `<button class="kb ghost" type="button" data-dismiss>${esc(tr(S.cancel))}</button>${saveBtn}`,
      });
    }
    const root = m.el || document.querySelector('.kiwi-backdrop:last-of-type');
    if (!root) return;
    styleSettings();
    const q = (s) => root.querySelector(s);
    const isOn = (el) => !!el && el.getAttribute('aria-checked') === 'true';
    const pending = {};   // nouvelles plateformes, ajoutées avant d'enregistrer
    const removed = new Set();

    function paintChoices() {
      const box = q('[data-kdl-choices]');
      if (!box) return;
      const on = [].slice.call(root.querySelectorAll('[data-pid]')).filter((r) => isOn(r.querySelector('[data-kdl-on]'))).map((r) => r.getAttribute('data-pid'));
      const cur = doc().choices;
      box.innerHTML = on.length ? `<table class="kdl-tbl"><thead><tr><th></th><th>${esc(tr(S.dineIn))}</th>${on.map((pid) => `<th>${logoHTML(pid, 18)}</th>`).join('')}</tr></thead><tbody>`
        + groups.map((g) => g.choices.filter((ch) => num(ch.price)).map((ch) => `<tr><td>${esc(g.name)} · ${esc(ch.name)}</td><td class="kdl-base">${num(ch.price)}</td>${on.map((pid) => {
          const v = cur[ch.id] && cur[ch.id].by ? num(cur[ch.id].by[pid]) : null;
          return `<td><input type="number" inputmode="decimal" min="0" step="0.5" class="kf-input" data-kdl-choice="${esc(ch.id)}" data-p="${pid}" value="${v == null ? '' : v}" placeholder="${num(ch.price)}"></td>`;
        }).join('')}</tr>`).join('')).join('') + '</tbody></table>' : '';
    }
    paintChoices();
    const typed = {};
    function paintProducts() {
      const box = q('[data-kdl-products]');
      if (!box) return;
      const on = [].slice.call(root.querySelectorAll('[data-pid]')).filter((r) => isOn(r.querySelector('[data-kdl-on]'))).map((r) => r.getAttribute('data-pid'));
      let lastCat = null;
      const groupRow = (it) => {
        const c = String(it.catId == null ? '' : it.catId);
        if (c === lastCat) return '';
        lastCat = c;
        const name = catName(c);
        return name ? `<tr class="kdl-grp" data-find-group><th colspan="${on.length + 2}">${esc(name)}</th></tr>` : '';
      };
      box.innerHTML = on.length ? `<table class="kdl-tbl"><thead><tr><th></th><th>${esc(tr(S.dineIn))}</th>${on.map((pid) => `<th>${logoHTML(pid, 18)}</th>`).join('')}</tr></thead><tbody>`
        + products.map((it) => `${groupRow(it)}<tr data-find-row data-find-text="${esc((it.name || '') + ' ' + catName(it.catId))}"><td>${esc(it.name || '')}</td><td class="kdl-base">${num(it.price) == null ? '·' : num(it.price)}</td>${on.map((pid) => {
          const k = it.id + '|' + pid, v = k in typed ? num(typed[k]) : priceOf(it.id, pid);
          return `<td><input type="number" inputmode="decimal" min="0" step="0.5" class="kf-input" data-kdl-item="${esc(it.id)}" data-p="${pid}" value="${v == null ? '' : v}" placeholder="${esc(tr(S.notSold))}" aria-label="${esc((it.name || '') + ' · ' + pid)}"></td>`;
        }).join('')}</tr>`).join('') + '</tbody></table>' : '';
    }
    paintProducts();
    /* La barre de recherche (assets/find-bar.mjs) se pose d'elle-même. */
    if (q('[data-find]')) import('/assets/find-bar.mjs?v=1').catch(() => {});

    root.addEventListener('click', (e) => {
      const sw = e.target.closest('[data-kdl-on],[data-kdl-house]');
      if (sw) {
        const on = !isOn(sw);
        sw.classList.toggle('on', on);
        sw.setAttribute('aria-checked', String(on));
        const card = sw.closest('.kdl-card');
        if (card) card.classList.toggle('is-on', on);
        if (sw.hasAttribute('data-kdl-on')) { keepTyped(); paintProducts(); paintChoices(); }
        return;
      }
      const add = e.target.closest('[data-kdl-add]');
      if (add) {
        const inp = q('[data-kdl-newname]');
        const name = String(inp.value || '').trim().slice(0, 30);
        if (!name) { inp.focus(); return; }
        let id = 'pf' + name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '').slice(0, 16);
        if (id.length < 4) id = 'pf' + Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6);
        while (doc().platforms[id] || pending[id] || PRESETS[id]) id = id.slice(0, 20) + String.fromCharCode(97 + Math.floor(Math.random() * 26));
        const color = COLORS[(Object.keys(d.platforms).length + Object.keys(pending).length) % COLORS.length];
        pending[id] = { name, color };
        const tmp = { id, kind: 'platform', on: true, preset: false, name, color, logo: '' };
        // logoHTML lit le document : la nouvelle plateforme n'y est pas encore.
        const html = rowFor(tmp).replace(/<span class="kdl-tile kdl-letter"[^>]*>[^<]*<\/span>/, `<span class="kdl-tile kdl-letter" style="width:36px;height:36px;border-radius:9px;background:${color};font-size:20px">${esc(name.charAt(0).toUpperCase())}</span>`);
        q('[data-kdl-list]').insertAdjacentHTML('beforeend', html);
        inp.value = '';
        paintChoices();
        return;
      }
      const del = e.target.closest('[data-kdl-del]');
      if (del) { const row = del.closest('[data-pid]'); removed.add(row.getAttribute('data-pid')); row.remove(); paintChoices(); return; }
      const fill = e.target.closest('[data-kdl-fill]');
      if (fill) {
        const row = fill.closest('[data-pid]');
        const pid = row.getAttribute('data-pid');
        const pct = num(String(row.querySelector('[data-kdl-pct]').value).replace(/[+%\s]/g, ''));
        if (pct == null) { row.querySelector('[data-kdl-pct]').focus(); return; }
        commit(false);
        const n = bulkFill(pid, pct, menuItems(), false);
        Object.keys(typed).forEach((k) => delete typed[k]);
        paintProducts();
        try { K.toast(tr(S.filled).replace('{n}', n), { type: 'success' }); } catch (_) {}
        return;
      }
      if (e.target.closest('[data-kdl-save]')) { if (commit(true)) m.close(); }
    });

    /* Les prix produits que la grille montre, posés sur le document : une case
       vide retire le produit de cette plateforme, une case non affichée ne
       change rien. */
    function productPrices(next, now) {
      const by = {};
      root.querySelectorAll('[data-kdl-item]').forEach((inp) => {
        const id = inp.getAttribute('data-kdl-item');
        by[id] = by[id] || Object.assign({}, (next.prices[id] && next.prices[id].by) || {});
        const v = num(inp.value);
        if (v == null) delete by[id][inp.getAttribute('data-p')]; else by[id][inp.getAttribute('data-p')] = v;
      });
      next.prices = Object.assign({}, next.prices);
      Object.keys(by).forEach((id) => {
        const before = JSON.stringify((next.prices[id] && next.prices[id].by) || {});
        if (before !== JSON.stringify(by[id])) next.prices[id] = { by: by[id], at: now };
      });
    }
    /* Un interrupteur repeint la grille : ce qui était tapé reste à l'écran,
       rien n'est enregistré avant « Enregistrer ». */
    function keepTyped() {
      root.querySelectorAll('[data-kdl-item]').forEach((inp) => { typed[inp.getAttribute('data-kdl-item') + '|' + inp.getAttribute('data-p')] = inp.value; });
    }
    /* Enregistre ce que la fenêtre montre. `final` : ferme aussi le volet. */
    function commit(final) {
      const err = q('[data-kdl-err]');
      err.hidden = true;
      const next = doc(), now = Date.now();
      next.platforms = Object.assign({}, next.platforms);
      const com = {};
      let bad = false;
      root.querySelectorAll('[data-pid]').forEach((row) => {
        const pid = row.getAttribute('data-pid');
        const on = isOn(row.querySelector('[data-kdl-on]'));
        const prev = next.platforms[pid] || {};
        const entry = PRESETS[pid] ? { on } : { on, name: (pending[pid] || prev).name, color: (pending[pid] || prev).color };
        if (prev.on !== entry.on || !next.platforms[pid] || pending[pid]) next.platforms[pid] = Object.assign({}, entry, { at: now });
        const rate = num(row.querySelector('[data-kdl-rate]').value);
        const fee = num(row.querySelector('[data-kdl-fee]').value);
        if (rate != null && rate > 60) { bad = true; row.querySelector('[data-kdl-rate]').setAttribute('aria-invalid', 'true'); }
        com[pid] = { rate, fee };
      });
      removed.forEach((pid) => { if (next.platforms[pid]) next.platforms[pid] = { deleted: true, on: false, at: now }; com[pid] = { rate: null, fee: null }; });
      if (bad) { err.textContent = tr(S.errRate); err.hidden = false; return false; }
      const hOn = isOn(q('[data-kdl-house]')), hFee = num(q('[data-kdl-housefee]').value);
      if (!!next.house.on !== hOn || num(next.house.fee) !== hFee) next.house = { on: hOn, fee: hFee, at: now };
      const ch = {};
      root.querySelectorAll('[data-kdl-choice]').forEach((inp) => {
        const cid = inp.getAttribute('data-kdl-choice');
        ch[cid] = ch[cid] || Object.assign({}, (next.choices[cid] && next.choices[cid].by) || {});
        const v = num(inp.value);
        if (v == null) delete ch[cid][inp.getAttribute('data-p')]; else ch[cid][inp.getAttribute('data-p')] = v;
      });
      next.choices = Object.assign({}, next.choices);
      Object.keys(ch).forEach((cid) => { next.choices[cid] = { by: ch[cid], at: now }; });
      productPrices(next, now);
      Object.keys(pending).forEach((k) => delete pending[k]);
      save(next);
      setCommissions(com);
      if (final) { try { K.toast(tr(S.saved), { type: 'success' }); } catch (_) {} }
      return true;
    }
  }
  function styleSettings() {
    if (document.getElementById('kdl-set-css')) return;
    const s = document.createElement('style');
    s.id = 'kdl-set-css';
    s.textContent = '.kdl-inline{display:grid;gap:16px;max-width:720px}.kdl-title{font-size:17px;font-weight:600;color:var(--ink)}.kdl-lede{margin:4px 0 0;font-size:14px;line-height:1.5;color:var(--n-600)}'
      + '.kdl-foot{position:sticky;bottom:0;display:flex;justify-content:flex-end;padding:12px 0;background:var(--paper);border-top:1px solid var(--n-200)}'
      + '.kdl-set{display:grid;gap:12px}.kdl-h{font-size:13px;font-weight:600;color:var(--ink);margin-top:10px}'
      + '.kdl-list{display:grid;gap:10px}'
      + '.kdl-card{border:1px solid var(--n-200);border-radius:14px;background:var(--surface);transition:border-color 160ms}'
      + '.kdl-card.is-on{border-color:color-mix(in srgb,var(--atlas) 40%,var(--n-200))}'
      + '.kdl-head{display:flex;align-items:center;gap:12px;padding:12px 14px}.kdl-head>b{flex:1;min-width:0;font-size:15px;font-weight:600;color:var(--ink)}'
      + '.kdl-body{display:none;gap:4px;padding:14px;border-top:1px solid var(--n-200)}.kdl-card.is-on .kdl-body{display:grid}'
      + '.kdl-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px}'
      + '.kdl-fill{display:flex;gap:8px;align-items:center}.kdl-pct{position:relative;flex:0 0 120px}.kdl-pct .kf-input{padding-inline-end:32px}'
      + '.kdl-pct-u{position:absolute;inset-inline-end:13px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--n-500);pointer-events:none}'
      /* 44 px de cible (la carte l'impose à tout bouton), 34 × 20 de piste dessinée. */
      + '.kdl-sw{width:44px;height:44px;min-width:44px;min-height:44px;margin:-8px -5px;border:0;padding:0;background:none;position:relative;cursor:pointer;flex:0 0 auto}'
      + '.kdl-sw::before{content:"";position:absolute;top:12px;inset-inline-start:5px;width:34px;height:20px;border-radius:999px;background:var(--n-300);transition:background 160ms}'
      + '.kdl-sw.on::before{background:var(--atlas)}.kdl-sw::after{content:"";position:absolute;top:14px;inset-inline-start:7px;width:16px;height:16px;border-radius:50%;background:var(--surface);transition:transform 160ms}'
      + '.kdl-sw.on::after{transform:translateX(14px)}[dir="rtl"] .kdl-sw.on::after{transform:translateX(-14px)}.kdl-sw:focus-visible{outline:2px solid var(--atlas);outline-offset:2px}'
      + '.kdl-link{background:none;border:0;padding:4px 6px;font:inherit;font-size:13px;color:var(--n-500);cursor:pointer}.kdl-link:hover{color:var(--ink)}'
      + '.kdl-add{display:flex;gap:8px;align-items:center}.kdl-add .kf-input{flex:1}.kdl-err{color:var(--danger,#B42318);font-size:13px}'
      + '.kdl-find{display:grid;gap:12px}.kdl-find-bar:empty{height:48px}'
      + '.kdl-tbl .kdl-grp th{padding:16px 6px 6px;font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--n-500)}.kdl-tbl tbody>.kdl-grp:first-child th{padding-top:4px}'
      + '.kdl-tbl{width:100%;border-collapse:collapse;font-size:13px}.kdl-tbl td,.kdl-tbl th{padding:5px 6px;text-align:start;font-weight:500}.kdl-tbl .kf-input{padding:7px 10px;max-width:96px}.kdl-base{color:var(--n-500)}'
      + '.kdl-prices{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}.kdl-hint{font-size:11.5px;font-weight:400;color:var(--n-500)}.kdl-prices label{display:grid;gap:4px;font-size:12px}.kdl-prices .kdl-lbl{display:flex;align-items:center;gap:6px}'
      + '.kdl-split{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:12px;font-size:13px}.kdl-split-i{display:inline-flex;align-items:center;gap:6px}.kdl-split-i b{font-weight:600}.kdl-split-i span{font-variant-numeric:tabular-nums;opacity:.8}'
      + '@media (max-width:640px){.kdl-grid{grid-template-columns:1fr}.kdl-pct{flex:1}}';
    document.head.appendChild(s);
  }

  /* ── La carte : l'onglet « Livraison » et la ligne de prix du produit ──────
   * Ni assets/menu-catalog.js ni ses parties ne lisent ce module : le réglage
   * se pose sur leur écran sans qu'ils aient à le connaître. L'onglet suit les
   * onglets de la carte ; la ligne de prix se pose sous le prix du produit, et
   * s'enregistre quand le patron enregistre le produit. */
  let editingId = null;
  function wireMenuPage() {
    if (wireMenuPage.done || typeof MutationObserver === 'undefined' || !document.body) return;
    wireMenuPage.done = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest) return;
      /* Quel produit s'ouvre : le dernier clic sur une fiche qui porte son
       * identifiant (carte, menu « … », bouton Modifier). « Nouvel article »
       * repart de zéro. L'éditeur vérifie ensuite le nom avant d'y croire. */
      const arg = e.target.closest('[data-arg]');
      if (arg && menuItems().some((it) => String(it.id) === arg.getAttribute('data-arg'))) editingId = arg.getAttribute('data-arg');
      if (e.target.closest('[data-action="mx-item-add"],[data-action="rmw-item-add"]')) editingId = null;
      const sv = e.target.closest('[data-f-save]');
      if (sv) savePriceRow(sv.closest('.kiwi-modal'));
      const rs = e.target.closest('.rmw-item-workspace [data-save]');
      if (rs) savePriceRow(rs.closest('.rmw-item-workspace'));
      if (e.target.closest && e.target.closest('[data-kdl-open]')) openSettings();
      // L'onglet « Livraison » s'ouvre ; tout autre onglet de la carte le referme.
      if (e.target.closest('[data-kdl-tab]')) { tabOn = true; tabNode = null; tick(); }
      else leaveTab(e);
    }, true);
    /* La carte change d'onglet au relâcher (interactive.js), avant le clic :
     * la sortie de « Livraison » écoute les deux. */
    document.addEventListener('pointerup', (e) => { if (e.button === 0 && e.target.closest) leaveTab(e); }, true);
    function leaveTab(e) {
      if (!tabOn || !e.target.closest('[data-action="rmw-tab"],[data-pick]')) return;
      tabOn = false; tabNode = null;
      /* La carte ne repeint pas un HTML identique (KiwiCatalogUI.replace) et
       * son geste passe avant celui-ci : si le panneau Livraison est encore
       * là après son tour, on efface la mémoire et on relance l'onglet. */
      const pick = e.target.closest('[data-tab],[data-pick]');
      const key = pick && (pick.getAttribute('data-tab') || pick.getAttribute('data-pick'));
      setTimeout(() => {
        const r = document.querySelector('[data-menu-root]');
        const H = window.Kiwi && window.Kiwi.handlers;
        if (!r || !key || /^(performance|hours)$/.test(key) || !r.querySelector('[data-kdl-inline]') || !H || !H['rmw-tab']) return;
        r.__catalogHTML = null;
        H['rmw-tab']({ dataset: { tab: key } });
      }, 0);
    }
    let tabOn = false, tabNode = null;
    /* Une mutation de page en appelle cent : un passage par image suffit. */
    let queued = false;
    const obs = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; tick(); });
    });
    const tick = () => {
      homeSplit();
      /* « Livraison » est un onglet de Menu & modificateurs, à côté de Tags NFC,
       * pour chaque restaurant : un vrai role=tab (le rail est un tablist) dont
       * le panneau porte les cartes des plateformes. Le rendu de la carte
       * reconstruit la page à chaque vente : le panneau garde son nœud, donc ce
       * qui est en cours de saisie. Sur téléphone le rail cède la place au
       * sélecteur : le bouton d'en-tête prend le relais. */
      const rail = document.querySelector('[data-menu-root] .mi-filters > .mi-pill-row');
      if (rail && !rail.querySelector('[data-kdl-tab]')) {
        const at = rail.querySelector('[data-tab="nfc"]');
        const b = `<button class="mi-pill" type="button" role="tab" aria-selected="false" tabindex="-1" data-lens-item data-kdl-tab><img class="catalog-icon" draggable="false" src="assets/icons/material/local_shipping.svg" alt="" aria-hidden="true"><span>${esc(tr(S.tab))}</span></button>`;
        if (at) at.insertAdjacentHTML('afterend', b); else rail.insertAdjacentHTML('beforeend', b);
      }
      const panel = rail && document.querySelector('[data-menu-root] [data-rmw-panel]');
      if (rail && panel && tabOn) {
        const mine = rail.querySelector('[data-kdl-tab]');
        rail.querySelectorAll('[role="tab"]').forEach((b) => {
          const on = b === mine;
          if (b.classList.contains('on') !== on) b.classList.toggle('on', on);
          if (b.getAttribute('aria-selected') !== String(on)) b.setAttribute('aria-selected', String(on));
          if (b.getAttribute('tabindex') !== (on ? '0' : '-1')) b.setAttribute('tabindex', on ? '0' : '-1');
        });
        if (!mine.id) mine.id = 'kdl-tab';
        if (panel.getAttribute('aria-labelledby') !== mine.id) panel.setAttribute('aria-labelledby', mine.id);
        if (!panel.querySelector('[data-kdl-inline]')) {
          styleSettings();
          if (tabNode) { panel.textContent = ''; panel.appendChild(tabNode); } else { openSettings(panel); tabNode = panel.firstElementChild; }
        }
      } else if (rail && !tabOn) {
        const mine = rail.querySelector('[data-kdl-tab].on');
        if (mine) { mine.classList.remove('on'); mine.setAttribute('aria-selected', 'false'); }
      }
      const scan = document.querySelector('.mi-head-acts [data-action="rmw-menu-scan"]');
      const acts = scan && scan.parentElement;
      const head = acts && acts.querySelector('[data-kdl-open]');
      const railShown = !!(rail && rail.offsetParent);
      if (acts && !head && !railShown) {
        acts.insertAdjacentHTML('afterbegin', `<button class="btn-slim" type="button" aria-haspopup="dialog" data-kdl-open data-activation=write>${esc(tr(S.tab))}</button>`);
      } else if (head && railShown) head.remove();
      const old = !acts && document.querySelector('.mx-menu-tabs');
      if (old && !old.querySelector('[data-kdl-open]')) {
        old.insertAdjacentHTML('beforeend', `<button class="mx-menu-tab" type="button" aria-haspopup="dialog" data-kdl-open data-activation=write>${logoHTML(HOUSE, 18)}<span>${esc(tr(S.tab))}</span></button>`);
      }
      const plats = platforms().filter((p) => p.on);
      rmwPriceRow(plats);
      const price = document.querySelector('.kiwi-modal [data-f-price]');
      if (price && plats.length && !document.querySelector('.kiwi-modal [data-kdl-prices]')) {
        const field = price.closest('.mx-field');
        if (!field) return;
        styleSettings();
        const id = editingId;
        field.insertAdjacentHTML('afterend', `<div class="mx-field" data-kdl-prices data-item="${esc(id || '')}"><label>${esc(tr(S.priceRow))}</label><div class="kdl-prices">${plats.map((p) => {
          const v = id ? priceOf(id, p.id) : null;
          return `<label><span class="kdl-lbl">${logoHTML(p.id, 18)}${esc(p.name)}</span><input type="number" inputmode="decimal" min="0" step="1" data-kdl-p="${p.id}" value="${v == null ? '' : v}" placeholder="${esc(tr(S.notSold))}"></label>`;
        }).join('')}</div><span class="mx-opt-note">${esc(tr(S.priceHint))}</span></div>`);
      }
    };
    obs.observe(document.body, { childList: true, subtree: true });
  }
  /* L'éditeur d'article de « Menu & modificateurs » (restaurant-menu-workspace) :
   * la ligne se pose sous Nom et Prix, avec les mêmes champs que le prix. */
  function rmwPriceRow(plats) {
    const root = document.querySelector('.rmw-item-workspace');
    const price = root && root.querySelector('[data-price]');
    if (!price || !plats.length || root.querySelector('[data-kdl-prices]')) return;
    const field = price.closest('.rmw-it-f');
    if (!field) return;
    styleSettings();
    const name = String((root.querySelector('[data-name]') || {}).value || '').trim();
    const hit = editingId != null && menuItems().find((it) => String(it.id) === String(editingId));
    // Une copie d'article porte un autre nom : ses prix ne sont pas ceux de l'original.
    const id = hit && String(hit.name || '').trim() === name ? String(hit.id) : '';
    field.insertAdjacentHTML('afterend', `<div class="rmw-it-f rmw-it-full" data-kdl-prices data-item="${esc(id)}"><span>${esc(tr(S.priceRow))}</span><div class="kdl-prices">${plats.map((p) => {
      const v = id ? priceOf(id, p.id) : null;
      return `<label class="rmw-it-f"><span class="kdl-lbl">${logoHTML(p.id, 18)}${esc(p.name)}</span><span class="rmw-rx-suffix"><input class="rmw-rx-in" type="number" min="0" step="0.5" inputmode="decimal" data-kdl-p="${p.id}" value="${v == null ? '' : v}" placeholder="${esc(tr(S.notSold))}"><i>MAD</i></span></label>`;
    }).join('')}</div><small class="kdl-hint">${esc(tr(S.priceHint))}</small></div>`);
  }
  /* L'accueil du tableau de bord : l'anneau « Livraison » additionne toutes les
   * livraisons ; dessous, chaque option à son nom (« Glovo 4 000 MAD »), au
   * chiffre brut de la période. Le net, après commission et frais, est sur la
   * page Marges. Rien tant qu'aucune option n'est allumée et qu'aucune vente de
   * livraison n'existe. */
  function homeSplit() {
    const host = document.querySelector('.vexel-goals-card .vexel-rings');
    const old = document.querySelector('.vexel-goals-card .kdl-split');
    if (!host) return;
    let rows = [];
    try {
      const V = window.KiwiVenue, S = window.KiwiSales, R = window.KiwiDateRange;
      const b = R && R.bounds ? R.bounds() : null;
      const from = b ? b[0] : -Infinity, to = b && b[1] !== Infinity ? b[1] : Date.now() + 1;
      rows = (S && S.list ? S.list(V && V.getVenue ? V.getVenue() : undefined) || [] : [])
        .filter((x) => x && !x.voided && +x.amount > 0 && +x.ts >= from && +x.ts < to && isChannel(x.channel));
    } catch (_) { rows = []; }
    const by = {};
    rows.forEach((x) => { const k = String(x.channel).toLowerCase(); by[k] = (by[k] || 0) + Math.round(+x.amount * 100); });
    const ids = Object.keys(by).sort((a, b) => by[b] - by[a]);
    const html = (!ids.length && !enabled()) ? '' : ids.map((k) => `<span class="kdl-split-i">${logoHTML(k, 18)}<b>${esc(labelOf(k) || k)}</b><span>${esc(Math.round(by[k] / 100).toLocaleString('fr-FR'))}\u00a0MAD</span></span>`).join('');
    if (!html) { if (old) old.remove(); return; }
    if (old && old.getAttribute('data-sig') === html) return;
    styleSettings();
    const el = old || document.createElement('div');
    el.className = 'kdl-split';
    el.setAttribute('data-sig', html);
    el.innerHTML = html;
    if (!old) host.insertAdjacentElement('afterend', el);
  }
  function savePriceRow(modal) {
    const row = modal && modal.querySelector('[data-kdl-prices]');
    if (!row) return;
    const by = {};
    row.querySelectorAll('[data-kdl-p]').forEach((inp) => { const v = num(inp.value); if (v != null) by[inp.getAttribute('data-kdl-p')] = v; });
    const known = row.getAttribute('data-item');
    if (known) { keepOff(known, by); return; }
    /* Un produit neuf : son identifiant n'existe qu'APRÈS l'enregistrement de
     * la carte. On le cherche au tour suivant, le seul qui n'était pas là. */
    const before = new Set(menuItems().map((it) => String(it.id)));
    const name = String((modal.querySelector('[data-f-name],[data-name]') || {}).value || '').trim();
    setTimeout(() => {
      const fresh = menuItems().filter((it) => !before.has(String(it.id)));
      const it = fresh.find((x) => String(x.name || '').trim() === name) || fresh[fresh.length - 1];
      if (it) keepOff(it.id, by);
    }, 0);
  }
  /* Les plateformes éteintes gardent leur prix : les rallumer ne doit pas
   * obliger à tout ressaisir. */
  function keepOff(itemId, by) {
    const cur = doc().prices[String(itemId)];
    const keep = {};
    if (cur && cur.by) Object.keys(cur.by).forEach((k) => { const p = platformOf(k); if (p && !p.on) keep[k] = cur.by[k]; });
    setItemPrices(itemId, Object.assign(keep, by));
  }
  if (typeof document !== 'undefined' && document.querySelector) {
    const go = () => { if (window.Kiwi && window.Kiwi.modal) wireMenuPage(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
  }

  /* Les filtres « Ventes & activité » (pages-pro-spa-starter.js) demandent les
     canaux de livraison par un événement : chaque option allumée devient un
     filtre, et une vente d'un canal éteint depuis garde son nom. */
  if (typeof document !== 'undefined') document.addEventListener('kiwi-sales-channels', (e) => {
    const d = e && e.detail;
    if (!d || !Array.isArray(d.channels)) return;
    options().forEach((o) => d.channels.push({ id: o.id, name: o.name }));
    d.isChannel = isChannel;
    d.labelOf = labelOf;
  });
  const announce = () => { try { if (typeof document !== 'undefined') document.dispatchEvent(new Event('kiwi-delivery-change')); } catch (_) {} };
  subs.add(announce);
  if (typeof setTimeout === 'function') setTimeout(announce, 0);

  window.KiwiDelivery = {
    HOUSE, PRESETS, COLORS,
    doc, store, merge, blank,
    options, option, enabled, platforms, house, labelOf, isChannel,
    priceOf, choicePriceOf, setItemPrices, setChoicePrices, bulkFill,
    logoHTML, badgeHTML, ensureCSS,
    commissionOf, setCommissions, openSettings,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
})();
