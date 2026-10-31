    /* =========================================================
       Kiwi Serveur — demo logic
       Single-file. No build, no framework.
       ========================================================= */

    /* Shared identity boundary, loaded synchronously by the serveur shell. */
    function svPaired() {
      return window.KiwiPlatform.pairedVenue();
    }
    function svMerchant() {
      try {
        var q = new URLSearchParams(location.search).get('merchant');
        if (q && /^[a-z0-9][a-z0-9-]{0,63}$/i.test(q)) return q.toLowerCase();
      } catch (_) {}
      var p = svPaired();
      if (p && p.merchant) return String(p.merchant).toLowerCase();
      try { return String(localStorage.getItem('kiwiEmployeeMerchant') || localStorage.getItem('kiwiLiveMerchant') || '').toLowerCase(); } catch (_) { return ''; }
    }
    function svHosted() { return window.KiwiEnv.hosted; }
    function svReal() { return window.KiwiEnv.isReal(); }
    /* « Souvent avec… » (assets/caisse-pairs.js) lit les paires de CE
       commerce ; l'app de démo n'en a pas. */
    window.KiwiPairsMerchant = function () { return svReal() ? svMerchant() : ''; };
    /* Le nom que le serveur donne au commerce (merchant_config.name) l'emporte sur
       tout ce qu'on peut déduire du slug : « Cafe Local Test » est un identifiant
       mis en majuscules, pas l'enseigne du commerçant (« Café Amira »). Il est
       posé par applyEmployeeLive dès que /api/employee a répondu. */
    var svStoreName = '';
    function svName(demo) {
      if (svStoreName) return svStoreName;
      var p = svPaired(); if (p && p.name) return p.name;
      if (svReal()) { try { var m = svMerchant(); if (m) return m.split('-').filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); } catch (_) {} return ''; }
      return demo;
    }
    function svCity(demo) { var p = svPaired(); if (p && p.location) return p.location; return svReal() ? '' : demo; }
    function svApplyIdentity() {
      if (!svReal()) return;
      var nm = svName('Café Atlas'), city = svCity('Maarif · Casablanca');
      document.querySelectorAll('.ci-role, .profil-role').forEach(function (el) { var t = el.textContent.split('·')[0].trim(); el.textContent = nm ? (t + ' · ' + nm) : t; });
      // Blank the demo city / store name even when we have no replacement — a real
      // store with no paired location must NOT keep "Maarif · Casablanca" / "Café Atlas".
      var rest = document.querySelector('.ci-restaurant'); if (rest) rest.textContent = city || '';
      var sc = document.getElementById('kg-sc-meta'); if (sc) sc.textContent = nm || '';
      // Static demo staff-name nodes rendered before the role/clock-in JS runs.
      var g1 = document.getElementById('greet-line1'); if (g1) g1.textContent = 'Bonjour,';
      var who = document.querySelector('[data-pin-who]'); if (who && !who.dataset.employee) who.textContent = nm || 'Kiwi';
      var cg = document.querySelector('.ci-greeting'); if (cg) cg.innerHTML = 'Bonjour <em>bon service</em>';
      var tb = document.querySelector('.tb-name'); if (tb) tb.textContent = 'Serveur';
      var pn = document.querySelector('.profil-name'); if (pn) pn.textContent = 'Serveur';
      var tbAv = document.querySelector('.tb-avatar'); if (tbAv) tbAv.textContent = 'S';
      var pAv = document.querySelector('.profil-avatar'); if (pAv) pAv.textContent = 'S';
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', svApplyIdentity); else svApplyIdentity();

    /* ---------- Helpers ---------- */
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const fmtMAD = n => new Intl.NumberFormat('fr-FR', { useGrouping: true }).format(Math.round(n)) + ' MAD';
    const fmtMADcents = n => n.toFixed(2).replace('.', ',') + ' MAD';

    /* ---------- Employee language ----------
       The preference lives on the device, scoped to the current venue. It is
       deliberately independent from clock-in state so a reload, logout or a
       new shift never sends the employee back to French. */
    const EMPLOYEE_LANGUAGE_KEY = 'kiwi-employee-language:' + (svMerchant() || 'demo');
    /* Le dictionnaire et les motifs vivent dans assets/serveur-lang.js. */
    const EMPLOYEE_TRANSLATIONS = (window.KiwiServeurLang && window.KiwiServeurLang.translations) || { en: {}, ar: {} };
    let employeeLanguage = (() => {
      try {
        // On iOS the app locale wins over old venue defaults. Web remains venue-scoped.
        if (window.Capacitor?.isNativePlatform?.()) {
          const locale = String(localStorage.getItem('kiwiNativeLocale') || navigator.language || 'fr').toLowerCase().split('-')[0];
          return locale === 'en' || locale === 'ar' ? locale : 'fr';
        }
        const saved = localStorage.getItem(EMPLOYEE_LANGUAGE_KEY);
        if (saved === 'ary') return 'ar';
        return ['fr','en','ar'].includes(saved) ? saved : 'fr';
      } catch (_) { return 'fr'; }
    })();
    /* Une ligne de commande garde le libellé du patron (c'est ce que la cuisine
       lit) ; à l'écran du serveur on montre sa traduction. */
    const svLineName = (l) => (window.KiwiMenuI18n && l) ? window.KiwiMenuI18n.t(String(l.name || ''), employeeLanguage) : ((l && l.name) || '');
    const employeeI18nOriginal = new WeakMap();
    const employeeI18nLast = new WeakMap();
    const employeeI18nAttrs = new WeakMap();
    const EMPLOYEE_PATTERNS = (window.KiwiServeurLang && window.KiwiServeurLang.patterns) || [];
    function employeeTranslation(value) {
      if (employeeLanguage === 'fr') return value;
      const direct = (EMPLOYEE_TRANSLATIONS[employeeLanguage] || {})[value];
      if (direct) return direct;
      for (const [pattern, en, ar] of EMPLOYEE_PATTERNS) {
        if (pattern.test(value)) return value.replace(pattern, employeeLanguage === 'ar' ? ar : en);
      }
      if (/^Bonjour(?=[\s,!]|$)/.test(value)) return value.replace(/^Bonjour/, employeeLanguage === 'en' ? 'Hello' : 'مرحباً');
      return (EMPLOYEE_TRANSLATIONS[employeeLanguage] || {})[value] || value;
    }
    function employeeLocale() {
      return employeeLanguage === 'en' ? 'en-GB' : employeeLanguage === 'ar' ? 'ar-MA' : 'fr-FR';
    }
    function employeeHello(name) {
      const greeting = employeeLanguage === 'en' ? 'Hello' : employeeLanguage === 'ar' ? 'مرحباً' : 'Bonjour';
      return name ? `${greeting} ${name}` : greeting;
    }
    /* Ce que le navigateur affiche lui-même (confirm, partage) ne passe pas par
       le traducteur du DOM : la phrase se choisit à la source. */
    function employeePick(fr, en, ar) {
      return employeeLanguage === 'en' ? en : employeeLanguage === 'ar' ? ar : fr;
    }
    function employeeShiftWish() {
      return employeeLanguage === 'en' ? 'have a good shift' : employeeLanguage === 'ar' ? 'نتمنى لك وردية موفقة' : 'bon service';
    }
    function translateEmployeeTextNode(node) {
      if (!node || !node.parentElement || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(node.parentElement.tagName)) return;
      const current = node.nodeValue || '';
      const last = employeeI18nLast.get(node);
      if (!employeeI18nOriginal.has(node) || (last !== undefined && current !== last)) employeeI18nOriginal.set(node, current);
      const original = employeeI18nOriginal.get(node) || '';
      const trimmed = original.trim();
      const translated = trimmed ? employeeTranslation(trimmed) : trimmed;
      const next = trimmed ? original.replace(trimmed, translated) : original;
      employeeI18nLast.set(node, next);
      if (current !== next) node.nodeValue = next;
    }
    function translateEmployeeElement(root) {
      if (!root) return;
      if (root.nodeType === Node.TEXT_NODE) { translateEmployeeTextNode(root); return; }
      if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let textNode;
      while ((textNode = walker.nextNode())) translateEmployeeTextNode(textNode);
      const elements = root.nodeType === Node.ELEMENT_NODE ? [root, ...root.querySelectorAll(EMPLOYEE_I18N_ATTR_SELECTOR)] : [...root.querySelectorAll(EMPLOYEE_I18N_ATTR_SELECTOR)];
      elements.forEach(translateEmployeeAttrs);
    }
    /* Les libellés que lit un lecteur d'écran (aria-label), l'info-bulle (title)
       et l'invite d'un champ (placeholder) se traduisent comme le texte. Un
       rendu qui réécrit l'un d'eux est vu par l'observateur (attributeFilter),
       sinon il restait en français jusqu'au prochain changement de langue. */
    const EMPLOYEE_I18N_ATTRS = ['placeholder', 'aria-label', 'title'];
    const EMPLOYEE_I18N_ATTR_SELECTOR = '[placeholder],[aria-label],[title]';
    function translateEmployeeAttrs(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
        let originals = employeeI18nAttrs.get(el);
        if (!originals) { originals = {}; employeeI18nAttrs.set(el, originals); }
        EMPLOYEE_I18N_ATTRS.forEach((attr) => {
          if (!el.hasAttribute(attr)) return;
          const current = el.getAttribute(attr) || '';
          const marker = attr + ':last';
          if (!(attr in originals) || (originals[marker] !== undefined && current !== originals[marker])) originals[attr] = current;
          const next = employeeTranslation(originals[attr]);
          originals[marker] = next;
          if (current !== next) el.setAttribute(attr, next);
        });
    }
    function renderEmployeeLanguage() {
      document.documentElement.lang = employeeLanguage;
      document.documentElement.dir = employeeLanguage === 'ar' ? 'rtl' : 'ltr';
      $$('.profil-language-option').forEach((button) => {
        const active = button.dataset.employeeLanguage === employeeLanguage;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      translateEmployeeElement(document.body);
      try { if (typeof updateWelcomeCopy === 'function') updateWelcomeCopy(); } catch (_) {}
    }
    function setEmployeeLanguage(language) {
      if (!['fr', 'en', 'ar'].includes(language)) return;
      employeeLanguage = language;
      if (window.Capacitor?.isNativePlatform?.()) { try { localStorage.setItem('kiwiNativeLocale', language); } catch (_) {} }
      try { localStorage.setItem(EMPLOYEE_LANGUAGE_KEY, language); } catch (_) {}
      renderEmployeeLanguage();
      renderSchedule();
      renderHours();
      if (currentTab === 'tables') renderTables();
      if (currentTab === 'notifications') renderNotifications();
      if (currentTab === 'profil') renderProfil();
      try { if (typeof window.kgRenderProfil === 'function') window.kgRenderProfil(); } catch (_) {}
      updateShiftMeta();
      translateEmployeeElement(document.body);
    }
    /* ── Le climat ──────────────────────────────────────────────────────────
     * Trois choix, deux états stockés : 'light' et 'dark' s'écrivent dans
     * `kiwiTheme` (la clé du tableau de bord, préservée par tenant-purge parce
     * qu'une préférence d'affichage appartient à l'APPAREIL, pas au
     * commerçant) ; 'auto' EFFACE la clé et retire l'attribut, ce qui rend la
     * main à prefers-color-scheme. C'est pour cela que « système » ne peut pas
     * être une troisième valeur stockée : l'absence est le signal. */
    function currentThemeChoice() {
      try {
        const t = localStorage.getItem('kiwiTheme');
        return (t === 'dark' || t === 'light') ? t : 'auto';
      } catch (_) { return 'auto'; }
    }
    function renderThemeChoice() {
      const choice = currentThemeChoice();
      $$('.profil-theme-option').forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.themeChoice === choice ? 'true' : 'false');
      });
    }
    function setThemeChoice(choice) {
      try {
        if (choice === 'auto') localStorage.removeItem('kiwiTheme');
        else localStorage.setItem('kiwiTheme', choice);
      } catch (_) {}
      /* On repasse par le même résolveur que le démarrage : « système » doit
         retomber sur le téléphone, pas laisser l'attribut précédent en place. */
      if (window.__kiwiApplyTheme) window.__kiwiApplyTheme();
      renderThemeChoice();
      /* Les icônes Lucide sont des <svg> déjà peints : ils héritent de
         currentColor, donc rien à re-créer ici. */
    }

    
    /* Global modal dismissal on Escape key and backdrop tap */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal-veil.is-open');
        if (openModal) openModal.classList.remove('is-open');
      }
    });
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-veil') && e.target.classList.contains('is-open')) {
        e.target.classList.remove('is-open');
      }
    });

    document.addEventListener('DOMContentLoaded', () => {
      $$('.profil-theme-option').forEach((button) => button.addEventListener('click', () => setThemeChoice(button.dataset.themeChoice)));
      renderThemeChoice();
      $$('.profil-language-option').forEach((button) => button.addEventListener('click', () => setEmployeeLanguage(button.dataset.employeeLanguage)));
      renderEmployeeLanguage();
      if (window.MutationObserver) {
        new MutationObserver((mutations) => mutations.forEach((mutation) => {
          mutation.addedNodes.forEach(translateEmployeeElement);
          if (mutation.type === 'characterData') translateEmployeeTextNode(mutation.target);
          if (mutation.type === 'attributes') translateEmployeeAttrs(mutation.target);
        })).observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: EMPLOYEE_I18N_ATTRS });
      }
    });

    /* ---------- Calendar ---------- */
    const dafrDays = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const monthsEn = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

    /* ---------- Live clock ---------- */
    let employeeStoreZone = '';
    function employeeDayKey() {
      try { return new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: employeeStoreZone || Intl.DateTimeFormat().resolvedOptions().timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
      catch (_) { return new Date().toISOString().slice(0, 10); }
    }
    function employeeCivilDate() { return new Date(employeeDayKey() + 'T12:00:00'); }
    function employeeCivilKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
    function tickClock() {
      const now = new Date();
      const zone = employeeStoreZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const t = now.toLocaleTimeString(employeeLocale(), { timeZone: (globalThis.KiwiZoneLaw?.effectiveZone(zone, now) || zone), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      const ciTime = $('#ci-time'); if (ciTime) ciTime.textContent = t;
      const ciDate = $('#ci-date');
      if (ciDate) ciDate.textContent = now.toLocaleDateString(employeeLocale(), { timeZone: (globalThis.KiwiZoneLaw?.effectiveZone(zone, now) || zone), weekday: 'long', day: 'numeric', month: 'long' });
    }
    tickClock();
    setInterval(tickClock, 1000);

    /* ---------- Servers (Yassir + 3 collègues) ---------- */
    let currentUser = 'yassir';
    const servers = {
      yassir: { name: 'Yassir K.', initials: 'YK', status: 'on-duty'  },
      mehdi:  { name: 'Mehdi A.',  initials: 'MA', status: 'on-pause' },
      karim:  { name: 'Karim B.',  initials: 'KB', status: 'on-duty'  },
      sofia:  { name: 'Sofia L.',  initials: 'SL', status: 'on-duty'  },
    };

    /* ---------- Tables (assigned per server) ---------- */
    /* Yassir : T1, T2, T3, T4, T19 — 5 tables (mix de zones + statuts)  */
    /* Mehdi  : T5-T11 (en pause!)  — 7 tables — Yassir peut couvrir     */
    /* Karim  : T12-T16 (terrasse)  — 5 tables                            */
    /* Sofia  : T17, T18, T20, T21 (étage) — 4 tables                    */
    const tables = {
      T1:  { zone: 'salle',    server: 'yassir', covers: 4, status: 'ka-yaklo',     elapsed: 45 },
      T2:  { zone: 'salle',    server: 'yassir', covers: 2, status: 'bgha-ykhlass', elapsed: 12 },
      T3:  { zone: 'salle',    server: 'yassir', covers: 4, status: 'khawya',       elapsed: 0  },
      T4:  { zone: 'salle',    server: 'yassir', covers: 4, status: 'ka-yaklo',     elapsed: 22 },
      T5:  { zone: 'salle',    server: 'mehdi',  covers: 6, status: 'ka-yaklo',     elapsed: 67 },
      T6:  { zone: 'salle',    server: 'mehdi',  covers: 5, status: 'bgha-ykhlass', elapsed: 8  },
      T7:  { zone: 'salle',    server: 'mehdi',  covers: 2, status: 'khlass',       elapsed: 0  },
      T8:  { zone: 'salle',    server: 'mehdi',  covers: 2, status: 'khawya',       elapsed: 0  },
      T9:  { zone: 'salle',    server: 'mehdi',  covers: 2, status: 'ka-yaklo',     elapsed: 14 },
      T10: { zone: 'salle',    server: 'mehdi',  covers: 2, status: 'khawya',       elapsed: 0  },
      T11: { zone: 'salle',    server: 'mehdi',  covers: 3, status: 'ka-yaklo',     elapsed: 31 },
      T12: { zone: 'terrasse', server: 'karim',  covers: 4, status: 'khawya',       elapsed: 0  },
      T13: { zone: 'terrasse', server: 'karim',  covers: 4, status: 'ka-yaklo',     elapsed: 19 },
      T14: { zone: 'terrasse', server: 'karim',  covers: 4, status: 'khawya',       elapsed: 0  },
      T15: { zone: 'terrasse', server: 'karim',  covers: 4, status: 'ka-yaklo',     elapsed: 55 },
      T16: { zone: 'terrasse', server: 'karim',  covers: 6, status: 'ka-yaklo',     elapsed: 38 },
      T17: { zone: 'etage',    server: 'sofia',  covers: 4, status: 'bgha-ykhlass', elapsed: 5  },
      T18: { zone: 'etage',    server: 'sofia',  covers: 4, status: 'khawya',       elapsed: 0  },
      T19: { zone: 'etage',    server: 'yassir', covers: 2, status: 'ka-yaklo',     elapsed: 28 },
      T20: { zone: 'etage',    server: 'sofia',  covers: 4, status: 'khawya',       elapsed: 0  },
      T21: { zone: 'etage',    server: 'sofia',  covers: 4, status: 'khawya',       elapsed: 0  },
    };

    /* ---------- Time-of-day greeting helper ---------- */
    function timeOfDay() {
      const h = Number(new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-GB', { timeZone: employeeStoreZone || Intl.DateTimeFormat().resolvedOptions().timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
      const period = h >= 5 && h < 11 ? 'morning' : h >= 11 && h < 15 ? 'lunch' : h >= 15 && h < 18 ? 'afternoon' : h >= 18 && h < 23 ? 'evening' : 'night';
      const copy = {
        fr: { morning:'ce matin', lunch:'ce midi', afternoon:'cet après-midi', evening:'ce soir', night:'cette nuit' },
        en: { morning:'this morning', lunch:'at lunch', afternoon:'this afternoon', evening:'tonight', night:'tonight' },
        ar: { morning:'هذا الصباح', lunch:'وقت الظهيرة', afternoon:'بعد الظهر', evening:'هذا المساء', night:'هذه الليلة' }
      };
      return copy[employeeLanguage][period];
    }
    function ownTablesTitle() {
      const tod = timeOfDay();
      return employeeLanguage === 'en' ? `Your tables ${tod}` : employeeLanguage === 'ar' ? `طاولاتك ${tod}` : `Vos tables ${tod}`;
    }
    function employeeTableCount(count) {
      if (employeeLanguage === 'ar') return `${count} ${count === 1 ? 'طاولة' : 'طاولات'}`;
      if (employeeLanguage === 'en') return `${count} ${count === 1 ? 'table' : 'tables'}`;
      return `${count} table${count > 1 ? 's' : ''}`;
    }
    function employeeCoverCount(count) {
      if (employeeLanguage === 'ar') return `${count} ${count === 1 ? 'ضيف' : 'ضيوف'}`;
      if (employeeLanguage === 'en') return `${count} ${count === 1 ? 'guest' : 'guests'}`;
      return `${count} couvert${count > 1 ? 's' : ''}`;
    }
    function employeeMinuteCount(count) {
      return employeeLanguage === 'ar' ? `${count} د` : employeeLanguage === 'en' ? `${count} min` : `${count} mn`;
    }
    function employeeRoleName(role) {
      const roleNames = {
        en: { Serveur:'Server', Manager:'Manager', Caissier:'Cashier', Cuisinier:'Kitchen', Plongeur:'Dishwasher' },
        ar: { Serveur:'مقدّم خدمة', Manager:'مدير', Caissier:'أمين الصندوق', Cuisinier:'طاقم المطبخ', Plongeur:'عامل نظافة الأواني' }
      };
      return ((roleNames[employeeLanguage] || {})[role]) || role;
    }
    const tableServerIds = (t) => t && Array.isArray(t.servers) && t.servers.length ? t.servers : (t && t.server ? [t.server] : []);
    const isMineTable = (t) => !!t && (!tableServerIds(t).length || tableServerIds(t).includes(currentUser));

    /* Pre-seeded orders for already-occupied tables (read-only mock) */
    const seedOrders = {
      T2: [
        { id: 'm-001', name: 'Salade marocaine', qty: 2, price: 45  },
        { id: 'm-007', name: 'Tajine kefta',     qty: 2, price: 180 },
        { id: 'm-023', name: 'Thé à la menthe',  qty: 1, price: 30  },
        { id: 'm-028', name: "Jus d'avocat",     qty: 1, price: 50  },
      ],
    };

    /* ---------- Menu (same 35 items) ----------
       Même frontière que la caisse : la carte de Café Atlas n'appartient qu'à
       Café Atlas. Un serveur d'un vrai restaurant qui prend une commande sur nos
       tajines fait entrer en cuisine un plat qui n'existe pas. Sa carte à lui
       arrive du tableau de bord, par la même route publique que la caisse. */
    const SV_DEMO = !svReal();
    let catLabels = SV_DEMO ? {
      all:        'Tout',
      entrees:    'Entrées',
      tajines:    'Tajines',
      couscous:   'Couscous',
      pastillas:  'Pastillas',
      sandwiches: 'Sandwiches',
      boissons:   'Boissons',
      desserts:   'Desserts',
    } : { all: 'Tout' };
    let catOrder = SV_DEMO
      ? ['all', 'entrees', 'tajines', 'couscous', 'pastillas', 'sandwiches', 'boissons', 'desserts']
      : ['all'];

    /* ---------- Item options (mirrors dashboard Menu → groupes d'options) ----------
       Same model as the caisse: a group is radio (un seul choix, obligatoire),
       multi (plusieurs choix, certains payants) ou toggle (oui / non).
       A dish that carries one or more groups forces the serveur through the
       options sheet before the line can land in the order. */
    let optionGroups = {
      cuisson:        { name: 'Cuisson',             kind: 'radio',  vals: [{ n: 'Bleu' }, { n: 'Saignant' }, { n: 'À point' }, { n: 'Bien cuit' }] },
      fromage:        { name: 'Suppléments fromage', kind: 'multi',  vals: [{ n: 'Cheddar', p: 8 }, { n: 'Comté', p: 12 }, { n: 'Bleu', p: 10 }, { n: 'Mozzarella', p: 8 }] },
      sauces:         { name: 'Sauces',              kind: 'multi',  vals: [{ n: 'BBQ' }, { n: 'Mayo' }, { n: 'Andalouse' }, { n: 'Algérienne' }, { n: 'Samouraï' }, { n: 'Harissa' }] },
      accompagnement: { name: 'Accompagnement',      kind: 'radio',  vals: [{ n: 'Frites maison' }, { n: 'Salade verte' }, { n: 'Riz safrané' }, { n: 'Légumes vapeur' }] },
      pain:           { name: 'Pain à part',         kind: 'toggle', vals: [{ n: 'Oui' }] },
      coriandre:      { name: 'Sans coriandre',      kind: 'toggle', vals: [{ n: 'Oui' }] },
      piment:         { name: 'Sans piment',         kind: 'toggle', vals: [{ n: 'Oui' }] },
    };
    /* which dishes carry which groups (order = display order in the sheet) */
    let itemOptions = {
      'm-007': ['cuisson', 'coriandre', 'piment'],                  // Tajine kefta (viande hachée + œuf)
      'm-009': ['coriandre', 'pain'],                               // Tajine agneau pruneaux
      'm-003': ['coriandre', 'piment'],                             // Harira
      'm-012': ['coriandre', 'pain'],                               // Couscous royal
      'm-018': ['cuisson', 'sauces', 'fromage', 'accompagnement'],  // Sandwich kefta
      'm-019': ['sauces', 'accompagnement'],                        // Sandwich poulet
      'm-020': ['sauces', 'accompagnement'],                        // Sandwich thon
      'm-021': ['cuisson', 'sauces', 'accompagnement'],             // Bocadillo merguez
      'm-022': ['sauces', 'piment'],                                // Wrap végé
    };
    const itemHasOptions = id => Array.isArray(itemOptions[id]) && itemOptions[id].length > 0;
    /* « Obligatoire » est une propriete du GROUPE, pas de sa forme. La demo
       n'ayant pas ce drapeau, elle retombe sur son ancienne regle (radio =
       obligatoire) ; une vraie carte, elle, peut tres bien porter un choix
       unique facultatif — la taille d'un cafe — qui ne doit rien bloquer. */
    const isReq = def => (def && def.required != null) ? !!def.required : (def && def.kind === 'radio');

    /* Build the chosen-options array (and €) from a draft selection. */
    function optsFromSel(itemId, sel) {
      const opts = [];
      const formulaOptionIds = typeof itemOptions !== 'undefined' ? (itemOptions[itemId] || []) : [];
      formulaOptionIds.forEach(g => {
        const def = optionGroups[g], s = sel[g];
        if (def.kind === 'radio' && s) {
          const v = def.vals.find(v => v.n === s);
          opts.push({ group: g, label: s, price: v && v.p ? v.p : 0 });
        } else if (def.kind === 'toggle' && s === true) {
          opts.push({ group: g, label: def.name, price: 0 });
        } else if (def.kind === 'multi' && s && s.size) {
          def.vals.forEach(v => { if (s.has(v.n)) opts.push({ group: g, label: v.n, price: v.p || 0 }); });
        }
      });
      return opts;
    }
    const optsExtra = opts => opts.reduce((s, o) => s + (o.price || 0), 0);
    /* Human summary shown under the order line — multis grouped under their name. */
    function optsSummary(opts) {
      if (!opts || !opts.length) return '';
      const parts = [], multiBy = {};
      opts.forEach(o => {
        const def = optionGroups[o.group];
        if (def && def.kind === 'multi') (multiBy[o.group] = multiBy[o.group] || []).push(o.label);
        else parts.push(o.label);  // radio value or toggle group-name
      });
      Object.keys(multiBy).forEach(g => parts.push(`${optionGroups[g].name}: ${multiBy[g].join(', ')}`));
      return parts.join(' · ');
    }
    const optsSig = opts => opts.map(o => o.group + ':' + o.label).sort().join('|');
    /* small inline sliders glyph (no lucide dep, renders immediately) */
    const SLIDERS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>';

    let menuItems = SV_DEMO ? [
      {
        id: 'm-fml-brunch',
        cat: 'entrees',
        name: 'Formule Brunch',
        price: 89,
        formula: {
          slots: [
            {
              id: 'sl_pain',
              label: 'Le pain',
              min: 1,
              max: 1,
              choices: [
                { itemId: 'm-018', extra: 0 },
                { itemId: 'm-019', extra: 10 },
              ]
            },
            {
              id: 'sl_boisson',
              label: 'La boisson',
              min: 1,
              max: 1,
              choices: [
                { itemId: 'm-023', extra: 0 },
                { itemId: 'm-024', extra: 0 },
                { itemId: 'm-027', extra: 5 },
              ]
            }
          ]
        }
      },
      { id: 'm-001', cat: 'entrees',    name: 'Salade marocaine',     price: 45  },
      { id: 'm-002', cat: 'entrees',    name: 'Briouates au fromage', price: 60  },
      { id: 'm-003', cat: 'entrees',    name: 'Harira',               price: 35  },
      { id: 'm-004', cat: 'entrees',    name: 'Zaalouk',              price: 40  },
      { id: 'm-005', cat: 'entrees',    name: 'Taktouka',             price: 40  },
      { id: 'm-006', cat: 'entrees',    name: 'Soupe du jour',        price: 35  },
      { id: 'm-007', cat: 'tajines',    name: 'Tajine kefta',         price: 180 },
      { id: 'm-008', cat: 'tajines',    name: 'Tajine poulet citron', price: 150 },
      { id: 'm-009', cat: 'tajines',    name: 'Tajine agneau pruneaux', price: 220 },
      { id: 'm-010', cat: 'tajines',    name: 'Tajine 4 légumes',     price: 120 },
      { id: 'm-011', cat: 'tajines',    name: 'Tajine poisson',       price: 200 },
      { id: 'm-012', cat: 'couscous',   name: 'Couscous royal',       price: 220 },
      { id: 'm-013', cat: 'couscous',   name: 'Couscous tfaya',       price: 180 },
      { id: 'm-014', cat: 'couscous',   name: 'Couscous légumes',     price: 140 },
      { id: 'm-015', cat: 'pastillas',  name: 'Pastilla poulet',      price: 140 },
      { id: 'm-016', cat: 'pastillas',  name: 'Pastilla seafood',     price: 180 },
      { id: 'm-017', cat: 'pastillas',  name: 'Pastilla pigeon',      price: 220 },
      { id: 'm-018', cat: 'sandwiches', name: 'Sandwich kefta',       price: 50  },
      { id: 'm-019', cat: 'sandwiches', name: 'Sandwich poulet',      price: 45  },
      { id: 'm-020', cat: 'sandwiches', name: 'Sandwich thon',        price: 40  },
      { id: 'm-021', cat: 'sandwiches', name: 'Bocadillo merguez',    price: 55  },
      { id: 'm-022', cat: 'sandwiches', name: 'Wrap végé',            price: 42  },
      { id: 'm-023', cat: 'boissons',   name: 'Thé à la menthe',      price: 30  },
      { id: 'm-024', cat: 'boissons',   name: 'Café noir',            price: 15  },
      { id: 'm-025', cat: 'boissons',   name: 'Café au lait',         price: 18  },
      { id: 'm-026', cat: 'boissons',   name: 'Cappuccino',           price: 22  },
      { id: 'm-027', cat: 'boissons',   name: "Jus d'orange",         price: 35  },
      { id: 'm-028', cat: 'boissons',   name: "Jus d'avocat",         price: 50  },
      { id: 'm-029', cat: 'boissons',   name: 'Eau Aïn Saïss',        price: 18  },
      { id: 'm-030', cat: 'boissons',   name: 'Coca-Cola',            price: 25  },
      { id: 'm-031', cat: 'desserts',   name: 'Crème brûlée',         price: 50  },
      { id: 'm-032', cat: 'desserts',   name: 'Cornes de gazelle',    price: 35  },
      { id: 'm-033', cat: 'desserts',   name: 'Pâtisserie maison',    price: 45  },
      { id: 'm-034', cat: 'desserts',   name: 'Fruit de saison',      price: 30  },
      { id: 'm-035', cat: 'desserts',   name: 'Glace artisanale',     price: 40  },
    ] : [];

    /* ── La carte du restaurant, lue depuis le tableau de bord ───────────────
       Même route que la caisse (GET /api/menu?merchant=…, publique, sans
       cookie) et même miroir local rangé par slug, pour qu'une tablette de
       salle hors wifi garde la dernière carte connue. Le serveur ne publie
       jamais : il lit. */
    const SV_CARTE_MIRROR = 'kiwi:menuMirror:v1:';
    /* Les postes de préparation du patron, dans SON ordre — le premier est celui
       qui reçoit un plat qu'il n'a affecté à rien. Vide tant que la carte n'est
       pas arrivée, et vide en démo (où le tri se fait par catégorie). */
    let svStations = [], svCats = [], svFormulaItems = [], activeSub = null;
    /* Les promotions de la carte (assets/menu-promos.js). Même démo que la
       caisse : les desserts, que les autres suites ne facturent jamais. */
    let svPromos = SV_DEMO ? [{ id: 'demo-gouter', name: "L'heure du goûter", kind: 'percent', value: 15,
      all: false, cats: ['desserts'], items: [], from: '', to: '', days: [], start: '', end: '', paused: false, createdAt: 1 }] : [];
    /* Le prix est figé quand l'article entre dans la commande ; le serveur
       refait le calcul à l'envoi (priceOrder) et c'est lui qui fait foi. */
    function svPromoPrice(item, unit) {
      const P = window.KiwiMenuPromos;
      const hit = (P && svPromos.length) ? P.resolve(svPromos, { itemId: item.id, catId: item.cat }, unit, Date.now()) : null;
      return hit ? { price: hit.price, promo: hit.promo } : { price: unit, promo: null };
    }
    function svPromoKey(stamp) { return (stamp && window.KiwiMenuPromos) ? window.KiwiMenuPromos.stackKey(stamp) : ''; }
    function svPromoLine(l) {
      const p = l && l.promo;
      if (!p) return '';
      return `<span class="td-item-promoline">${esc(p.badge || '')} · ${esc(p.name || '')}<s>${fmtMAD(p.before * l.qty)}</s></span>`;
    }
    function svSlug() {
      try { const p = svPaired(); if (p && p.merchant) return p.merchant; } catch (_) {}
      /* The employee portal is not paired like a till. Its authenticated
         restaurant is pinned by openEmployeeSession() under
         kiwiEmployeeMerchant. Ignoring that key left a correctly signed-in
         employee with no slug, so /api/menu was never requested at all. */
      try { return localStorage.getItem('kiwiEmployeeMerchant') || localStorage.getItem('kiwiLiveMerchant') || ''; } catch (_) { return ''; }
    }
    /* Apply a menu document directly to the screen. The network response must
       remain the source of truth even when Web Storage is unavailable (private
       browsing, an installed iOS app after eviction, or a restrictive browser
       policy). Previously svFetchCarte() wrote to localStorage and then asked
       svRebuildCarte() to read it back; a failed write silently discarded a
       perfectly valid live menu and left the Menu tab empty. */
    function svApplyCarte(d) {
      if (!d || !Array.isArray(d.items)) return false;
      const cats = Array.isArray(d.cats) ? d.cats.filter(c => c && c.id) : [];
      svCats = cats;
      const labels = { all: 'Tout' };
      const order = ['all'];
      /* Le routage vit sur la categorie (voir assets/menu-catalog.js). Le
         serveur lisait it.station, qui n'existe plus : sans ce report, chaque
         commande annoncait le premier poste de la liste. */
      const catStation = {};
      cats.forEach((c) => { labels[c.id] = c.name || 'Sans nom'; catStation[c.id] = String(c.station || ''); order.push(c.id); });
      let loose = false;
      const allRawItems = (d.items || []).concat(Array.isArray(d.formulaItems) ? d.formulaItems : []);
      const allItems = allRawItems.filter(it => it && it.id && it.name && !it.archived).map((it) => ({
        id: it.id,
        cat: (it.catId && labels[it.catId]) ? it.catId : (loose = true, '_autres'),
        subId: it.subId || null,
        subLabel: (() => { const c=cats.find(c=>c.id===it.catId), s=c&&it.subId?(c.sub||[]).find(s=>s.id===it.subId):null; return s?s.name:''; })(),
        name: it.name,
        // Traductions du patron (assets/menu-i18n.js), lues à l'affichage seulement.
        i18n: it.i18n || null,
        price: +it.price || 0,
        // Le poste de préparation, hérité de sa catégorie, pour annoncer au
        // serveur OÙ part sa commande (voir svStationNames).
        station: catStation[(it.catId && labels[it.catId]) ? it.catId : ''] || '',
        opts: Array.isArray(it.opts) ? it.opts.slice() : [],
        formula: it.formula || null,
        avail: it.avail !== false,
        formulaOnly: it.formulaOnly === true,
        archived: it.archived === true,
      }));
      const items = allItems.filter((it) => it.avail !== false && !it.formulaOnly && !it.archived);
      svFormulaItems = allItems;
      if (loose) { labels._autres = 'Autres'; order.push('_autres'); }
      svStations = (Array.isArray(d.stations) ? d.stations : [])
        .filter(s => s && s.id && s.name)
        .map(s => ({ id: String(s.id), name: String(s.name) }));
      /* Les options du patron remplacent celles de la démo — même forme, donc
         la feuille d'options ci-dessus fonctionne sans changer d'une ligne.
         Un groupe sans choix est écarté : le serveur ouvrirait une feuille où
         il n'y a rien à répondre et rien à valider. */
      const lib = {};
      (Array.isArray(d.opts) ? d.opts : []).forEach((g) => {
        if (!g || !g.id || !g.name || !Array.isArray(g.choices) || !g.choices.length) return;
        lib[String(g.id)] = {
          name: String(g.name),
          kind: g.kind === 'many' ? 'multi' : 'radio',
          required: !!g.required,
          vals: g.choices.filter(c => c && c.name).map(c => ({
            n: String(c.name), p: Math.max(0, +c.price || 0), emoji: String(c.emoji || ''),
          })),
        };
      });
      optionGroups = lib;
      const attach = {};
      items.forEach((m) => {
        const ids = (m.opts || []).filter(id => !!lib[id]);
        if (ids.length) attach[m.id] = ids;
      });
      itemOptions = attach;
      catLabels = labels; catOrder = order; menuItems = items;
      try { svPromos = window.KiwiMenuPromos ? window.KiwiMenuPromos.sanitize(d.promos, d) : []; } catch (_) { svPromos = []; }
      /* L'index libellé → traductions : KiwiMenuI18n.t() retrouve une catégorie,
         une sous-catégorie ou une option par son libellé canonique. */
      try { if (window.KiwiMenuI18n) window.KiwiMenuI18n.index({ cats, items: allItems, opts: Array.isArray(d.opts) ? d.opts : [] }); } catch (_) {}
      if (!catLabels[activeCat]) activeCat = 'all';
      try { renderCatPills(); renderMenu(); } catch (_) {}
      return true;
    }
    function svRebuildCarte() {
      if (SV_DEMO) return false;
      const slug = svSlug();
      if (!slug) return false;
      let d = null;
      try { const raw = localStorage.getItem(SV_CARTE_MIRROR + slug); d = raw ? JSON.parse(raw) : null; } catch (_) {}
      return svApplyCarte(d);
    }
    /* Où part cette commande, dit avec les mots du patron.
     *
     * Avant : « cuisine » / « bar », déduits d'une catégorie nommée `boissons`.
     * C'est une catégorie de la DÉMO. Chez un vrai café, dont les rubriques
     * s'appellent cat_1 et cat_2, le test ne tombait jamais juste et le serveur
     * lisait « · cuisine » pour une tournée de thés. Un message qui se trompe
     * sur la destination vaut moins que pas de message du tout.
     *
     * Maintenant : les postes réellement concernés, dans l'ordre du patron. Sans
     * postes déclarés (ou en démo), on ne nomme rien plutôt que d'inventer. */
    function svStationNames(order) {
      if (SV_DEMO || !svStations.length) return '';
      const seen = [];
      (order || []).forEach((l) => {
        const m = ((typeof svFormulaItems !== 'undefined' && svFormulaItems.length) ? svFormulaItems : menuItems).find(mm => mm.id === l.id) || menuItems.find(mm => mm.id === l.id);
        const want = m && m.station;
        const st = svStations.find(s => s.id === want) || svStations[0];
        if (st && seen.indexOf(st.name) === -1) seen.push(st.name);
      });
      // L'ordre du patron, pas celui de la saisie.
      seen.sort((a, b) => svStations.findIndex(s => s.name === a) - svStations.findIndex(s => s.name === b));
      return seen.join(' + ').toLowerCase();
    }

    /* ── Une seule lecture de la carte à la fois, et pas deux de suite ──────
     * La carte était demandée par le sondage du service (toutes les 6 s) ET
     * par l'intervalle de 15 s ci-dessous, sans qu'aucun ne voie l'autre :
     * deux téléchargements complets qui se chevauchaient. Une lecture en vol
     * est désormais partagée, et une carte lue il y a moins de
     * SV_CARTE_FRESH_MS n'est pas relue, sauf `force` (retour sur l'app,
     * appairage). La lecture a un délai réel, et elle dit ce que la carte EST
     * pour renderMenu : pas encore lue, lue et vide, ou injoignable. */
    function svFetchCarte() {
      if (SV_DEMO) return;
      const slug = svSlug();
      if (!slug) return;
      if (svCarteFlight && svCarteFlight.slug === slug) return svCarteFlight.promise;
      /* Écran éteint : personne ne lit la carte. Le retour à l'écran relit
         tout de suite (svFetchCarteNow), inutile de réveiller la radio avant. */
      if (svCarteAt && typeof document !== 'undefined' && document.hidden) return Promise.resolve(svCarteState === 'ok');
      if (svCarteSlug === slug && Date.now() - svCarteAt < SV_CARTE_FRESH_MS) {
        return Promise.resolve(svCarteState === 'ok');
      }
      if (svCarteSlug !== slug) svCarteState = 'loading';
      const ctl = (typeof AbortController === 'function' && typeof setTimeout === 'function') ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), SV_CARTE_TIMEOUT_MS) : null;
      const promise = fetch('/api/menu?merchant=' + encodeURIComponent(slug), {
        credentials: 'omit', cache: 'no-store', signal: ctl ? ctl.signal : undefined,
      })
        .then(r => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j) { svCarteState = 'error'; return false; }
          const m = j.menu;
          if (!m || !Array.isArray(m.items) || !m.items.length) {
            /* `unreachable` : le serveur répond mais n'a pas pu lire sa base.
               Ce n'est pas une carte vide. */
            svCarteState = j.unreachable ? 'error' : 'empty';
            return false;
          }
          try { localStorage.setItem(SV_CARTE_MIRROR + slug, JSON.stringify(m)); } catch (_) {}
          /* Paint from the response itself. The mirror is a best-effort offline
             copy, never a prerequisite for showing today's catalogue. */
          const shown = svApplyCarte(m);
          svCarteState = shown ? 'ok' : 'empty';
          return shown;
        })
        .catch(() => { svCarteState = 'error'; return false; })
        .then((shown) => {
          if (timer) clearTimeout(timer);
          svCarteAt = Date.now();
          svCarteSlug = slug;
          if (svCarteFlight && svCarteFlight.promise === promise) svCarteFlight = null;
          /* Rien à montrer : l'écran doit passer de « chargement » à l'état
             réel (vide ou injoignable), pas rester sur une promesse. */
          if (!shown && !menuItems.length) { try { renderMenu(); } catch (_) {} }
          return shown;
        });
      svCarteFlight = { slug, promise };
      return promise;
    }
    const SV_CARTE_FRESH_MS = 10000;
    const SV_CARTE_TIMEOUT_MS = 10000;
    let svCarteFlight = null, svCarteAt = 0, svCarteSlug = '';
    let svCarteState = 'idle';      // idle | loading | ok | empty | error
    /* Retour à l'écran, appairage : on veut la carte du moment, pas celle
       d'il y a dix secondes. Une lecture déjà en vol est partagée. */
    function svFetchCarteNow() { svCarteAt = 0; return svFetchCarte(); }

    /* Availability is an operational switch used during service. Keep the
       employee catalogue in step with the cashier without forcing a reload.
       Deduplicated against the service poll above; svFetchCarte itself stays
       silent while the screen is hidden. */
    if (typeof setInterval === 'function') {
      setInterval(() => { if (!SV_DEMO && svSlug()) svFetchCarte(); }, 15000);
    }

    /* ── Envoyer la commande en cuisine — pour de vrai ────────────────────────
     * « Lancer la commande » n'était qu'un toast. Il effaçait le drapeau « non
     * envoyé » de la table et affichait « commande envoyée · cuisine + bar ».
     * Rien ne partait : pas de requête, pas de ticket, pas de trace. La cuisine
     * n'a jamais rien reçu, la caisse non plus, et le serveur avait la
     * confirmation écrite du contraire. Un onglet rechargé perdait la saisie
     * sans que personne ne puisse le savoir.
     *
     * Le ticket part maintenant vers /api/order/queue (create), la même file que
     * lit le comptoir. Trois règles tiennent le tout :
     *
     * • ON N'ENVOIE QUE LE DELTA. Le serveur relance la même table quand les
     *   convives ajoutent un dessert. Renvoyer toute la commande sortirait les
     *   plats déjà servis une deuxième fois en cuisine. Chaque ligne retient ce
     *   qui est DÉJÀ parti (`sentQty`) et seul l'écart voyage.
     * • ÉCHEC ⇒ LA TABLE RESTE « NON ENVOYÉE ». C'est le fond du problème
     *   qu'on corrige : le serveur doit repartir en sachant que la cuisine n'a
     *   rien reçu, pas avec un accusé de réception inventé.
     * • UNE CLÉ PAR ENVOI, gardée jusqu'au succès. Le wifi d'un café porte mal
     *   jusqu'au fond de la terrasse ; un serveur qui ne voit pas sa
     *   confirmation retape sur « Lancer ». La clé fait rejouer LA commande au
     *   lieu d'en fabriquer une seconde.
     *
     * Une baisse de quantité après l'envoi ne repart pas (l'écart est négatif,
     * donc nul) : le plat est déjà en cuisine, l'annuler est un geste de caisse,
     * pas un renvoi. */
    const svPendingRef = new Map();
    const svPendingBatches = new Map();
    const svSendFlights = new Map();
    /* ── Aucun appel du service sans délai ─────────────────────────────────
     * « Lancer », la demande d'addition, l'encaissement et le sondage
     * partaient sans limite de temps : sur un wifi qui avale les paquets, le
     * bouton restait grisé sans un mot, et le plan de salle se figeait en
     * silence. Chaque appel passe maintenant par ici : un délai réel
     * (AbortController), le corps JSON lu DANS ce délai, et une réponse à
     * plat { ok, status, data }. Un délai dépassé rejette avec `timeout:
     * true` ; une coupure réseau rejette telle quelle. Les deux sont des
     * échecs réseau pour l'appelant, jamais une attente sans fin. */
    const SV_NET_TIMEOUT_MS = 12000;
    /* Un encaissement attend un peu plus qu'une lecture : /api/sale écrit le
       registre et la table dans la même transaction. */
    const SV_PAY_TIMEOUT_MS = 15000;
    const SV_PAY_OFFLINE_MSG = "Pas de réseau. Le paiement n'est pas enregistré, réessayez au retour du réseau.";
    function svFetchJson(url, init, ms) {
      const ctl = (typeof AbortController === 'function' && typeof setTimeout === 'function') ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), ms || SV_NET_TIMEOUT_MS) : null;
      const opts = Object.assign({}, init || {});
      if (ctl) opts.signal = ctl.signal;
      return fetch(url, opts)
        .then((r) => r.json().catch(() => null).then((data) => ({ ok: !!r.ok, status: r.status, data })))
        .catch((err) => {
          if (ctl && ctl.signal.aborted) {
            const timeout = new Error('timeout');
            timeout.name = 'AbortError';
            timeout.timeout = true;
            throw timeout;
          }
          throw err;
        })
        .finally(() => { if (timer) clearTimeout(timer); });
    }
    /* Le système sait déjà qu'il n'y a pas de réseau : inutile d'attendre un
       délai pour le dire. (navigator absent hors navigateur : on tente.) */
    function svKnownOffline() {
      return typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
    }
    function svPendingKey(id) {
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug() || 'store';
      const operator = (liveEmployeeState && (liveEmployeeState.staffId || liveEmployeeState.employeeId)) || currentUser || 'employee';
      return 'kiwi:service-pending-v1:' + merchant + ':' + operator + ':' + String(id);
    }
    function svReadPending(id) {
      if (svPendingBatches.has(id)) return svPendingBatches.get(id);
      let pending = null;
      try { pending = JSON.parse(localStorage.getItem(svPendingKey(id)) || 'null'); } catch (_) {}
      if (!pending || !pending.ref || !Array.isArray(pending.lines) || !pending.lines.length) return null;
      svPendingBatches.set(id, pending);
      svPendingRef.set(id, pending.ref);
      return pending;
    }
    function svWritePending(id, pending) {
      svPendingBatches.set(id, pending);
      svPendingRef.set(id, pending.ref);
      try { localStorage.setItem(svPendingKey(id), JSON.stringify(pending)); } catch (_) {}
    }
    /* ── LE PANIER QUI N'EXISTAIT QUE DANS LA MÉMOIRE DU TÉLÉPHONE ────────
     * Les lignes saisies mais pas encore envoyées ne vivaient nulle part
     * ailleurs que dans `tableOrders`. Un rechargement, un onglet que l'iOS
     * recycle pour récupérer de la RAM, une tablette qui s'éteint : toute la
     * commande en cours disparaissait, et le serveur devait la resaisir de
     * mémoire devant le client. On l'écrit donc à chaque modification, sous
     * une clé qui porte le commerce ET l'opérateur — la tablette est partagée,
     * le brouillon de Yasmine n'est pas celui de Karim.
     *
     * Ne sont écrites que les lignes réellement en attente (`sourceLocal` et
     * `sentQty < qty`) : ce qui vient du serveur sera rendu par la synchro, et
     * réécrire un instantané périmé par-dessus, c'est fabriquer une commande
     * fantôme. C'est exactement le filtre que la fusion canonique applique
     * déjà. */
    const SV_DRAFT_TTL = 12 * 60 * 60 * 1000;
    let svDraftTimer = null;
    function svDraftsKey() {
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug() || 'store';
      const operator = (liveEmployeeState && (liveEmployeeState.staffId || liveEmployeeState.employeeId)) || currentUser || 'employee';
      return 'kiwi:service-drafts-v1:' + merchant + ':' + operator;
    }
    function svDraftLines(id) {
      return (tableOrders[id] || []).filter((line) => line
        && line.sourceLocal === true
        && Number(line.sentQty || 0) < Number(line.qty || 0));
    }
    function svSaveDrafts() {
      const tablesOut = {};
      Object.keys(tableOrders).forEach((id) => {
        const lines = svDraftLines(id);
        if (lines.length) tablesOut[id] = lines;
      });
      try {
        if (!Object.keys(tablesOut).length) { localStorage.removeItem(svDraftsKey()); return; }
        localStorage.setItem(svDraftsKey(), JSON.stringify({ at: Date.now(), tables: tablesOut }));
      } catch (_) {
        /* Stockage saturé : le brouillon reste en mémoire et la saisie continue.
           On ne casse pas un service pour un quota. */
      }
    }
    function svTouchDrafts() {
      clearTimeout(svDraftTimer);
      svDraftTimer = setTimeout(svSaveDrafts, 400);
    }
    function svRestoreDrafts() {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(svDraftsKey()) || 'null'); } catch (_) { saved = null; }
      if (!saved || !saved.tables || typeof saved.tables !== 'object') return 0;
      /* Un brouillon d'hier n'est plus une commande, c'est un piège : il
         referait surgir des plats que personne n'attend. */
      if (Date.now() - Number(saved.at || 0) > SV_DRAFT_TTL) {
        try { localStorage.removeItem(svDraftsKey()); } catch (_) {}
        return 0;
      }
      let restored = 0;
      Object.keys(saved.tables).forEach((id) => {
        const lines = Array.isArray(saved.tables[id]) ? saved.tables[id] : [];
        const clean = lines.filter((line) => line && line.name && Number(line.qty) > 0)
          .map((line) => ({ ...line, uid: line.uid || newLineUid(), sourceLocal: true }));
        if (!clean.length) return;
        const existing = tableOrders[id] || [];
        const known = new Set(existing.map((line) => line && line.uid));
        tableOrders[id] = existing.concat(clean.filter((line) => !known.has(line.uid)));
        restored += clean.length;
      });
      return restored;
    }

    function svForgetPending(id) {
      svPendingBatches.delete(id);
      svPendingRef.delete(id);
      try { localStorage.removeItem(svPendingKey(id)); } catch (_) {}
    }
    function svRefFor(id) {
      const pending = svReadPending(id);
      if (pending) return pending.ref;
      let r = svPendingRef.get(id);
      if (!r) {
        r = 'sv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        svPendingRef.set(id, r);
      }
      return r;
    }
    /* Dit au serveur ce qui s'est passé, dans ses mots, sans jamais laisser
       croire que c'est parti. */
    const SV_SEND_MSG = {
      'menu-not-published': 'carte non publiée · à publier depuis le tableau de bord',
      'menu-changed':       'carte modifiée · un plat n\'est plus disponible',
      'forbidden-merchant': 'tablette non appairée à ce commerce',
      'table-required':     'table introuvable',
      'empty-order':        'rien à envoyer',
      'unsendable-lines':   'lignes non identifiées · commande NON envoyée, retirez-les et resaisissez',
      'not-configured':     'service indisponible · commande NON envoyée',
      'no-merchant':        'aucun commerce appairé · commande NON envoyée',
      'offline':            'hors ligne · commande NON envoyée, réessayez',
      'timeout':            'pas de réponse du serveur · commande NON confirmée, réessayez',
    };
    function serviceOrderInitials(name) {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '';
      return ((parts[0][0] || '') + (parts.length > 1 ? (parts[parts.length - 1][0] || '') : '')).toUpperCase();
    }
    function serviceOrderRef(order) {
      if (!order || order.number == null) return '';
      const n = String(order.number);
      if ((order.channel || 'kiwi') === 'kiwi') {
        const employeePrefix = serviceOrderInitials(order.server);
        if (employeePrefix) return employeePrefix + '-' + n;
        return (order.mode === 'takeout' ? 'OPD-' : 'OP-') + n;
      }
      return n;
    }
    function serviceTableOrderRef(tableId) {
      const table = tables[tableId];
      if (table && table.orderNo) return String(table.orderNo);
      const orders = Array.from(serviceCanonicalOrders.values())
        .filter((order) => order && !order.paid && String(order.table) === String(tableId))
        .sort((a, b) => Number(a.created_ts || 0) - Number(b.created_ts || 0));
      const ref = orders.length ? serviceOrderRef(orders[0]) : '';
      if (ref && table) table.orderNo = ref;
      return ref || 'Commande';
    }
    function svSendOrderBatch(tableId) {
      const order = tableOrders[tableId] || [];
      let pending = svReadPending(tableId);
      const delta = [];
      /* Combien de lignes ATTENDENT réellement de partir, avant tout filtrage.
       * C'est la seule mesure qui permet de distinguer « il n'y avait rien à
       * envoyer » de « il y avait quelque chose et on n'a pas su le
       * construire » — deux situations que ce lot confondait, en annonçant la
       * seconde comme un succès. */
      let awaiting = 0;
      let dropped = 0;
      order.forEach((l) => { if (Math.max(0, (+l.qty || 0) - (+l.sentQty || 0)) > 0) awaiting++; });
      order.forEach((l, lineIndex) => {
        const dq = Math.max(0, (+l.qty || 0) - (+l.sentQty || 0));
        if (!dq) return;
        /* Une ligne sans `id` ne peut pas être tarifée par le serveur (le prix
         * vient de la carte publiée, jamais de la tablette) : elle était
         * SILENCIEUSEMENT sautée. Elle ne partait pas en cuisine, et le lot
         * continuait comme si de rien n'était. On la compte pour pouvoir le
         * dire. */
        if (!l.id) { dropped++; return; }
        if (!l.uid) l.uid = 'svl-' + String(l.id) + '-' + lineIndex + '-' + Math.random().toString(36).slice(2, 9);
        const opts = Array.isArray(l.opts)
          ? l.opts.map(o => o && o.label).filter(Boolean).join(', ')
          : '';
        const visuals = Array.isArray(l.opts)
          ? l.opts.filter(o => o && (o.label || o.name || o.cn)).map(o => ({
              emoji: o.emoji || o.e || '',
              name: o.label || o.name || o.cn || '',
            }))
          : [];
        const linePayload = {
          id: l.id,
          uid: l.uid,
          name: l.name || '',
          qty: dq,
          unitPrice: Math.max(0, +l.price || +l.unitPrice || 0),
          options: opts,
          visuals: visuals,
          optionChoices: Array.isArray(l.opts)
            ? l.opts.map(o => ({ group: o.group, label: o.label }))
            : [],
          note: (l.note || '').trim(),
          station: l.station || '',
        };
        if (l.kind) linePayload.kind = l.kind;
        if (l.formulaUid) linePayload.formulaUid = l.formulaUid;
        if (l.formulaName) linePayload.formulaName = l.formulaName;
        if (l.slotLabel) linePayload.slotLabel = l.slotLabel;
        if (l.formulaSlotId) linePayload.formulaSlotId = l.formulaSlotId;
        if (l.lineId) linePayload.lineId = l.lineId;
        delta.push(linePayload);
      });
      if (!pending && delta.length) {
        pending = {
          ref: 'sv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
          lines: delta.map((line) => ({ ...line })),
          baseSentQty: Object.fromEntries(delta.map((line) => [line.uid, Math.max(0, Number(
            (order.find((local) => local && local.uid === line.uid) || {}).sentQty || 0))])),
          createdAt: Date.now(),
        };
        svWritePending(tableId, pending);
      }
      /* ── LE FAUX SUCCÈS ───────────────────────────────────────────────────
       * Ici, ce lot renvoyait `{ ok: true, nothing: true }` — et l'appelant ne
       * regarde que `ok`. Résultat : « Table 4 · commande envoyée · cuisine »,
       * drapeau « non envoyée » effacé, retour au plan de salle… et RIEN n'est
       * parti. La cuisine n'a jamais vu le ticket, le serveur a la confirmation
       * écrite du contraire, et personne ne l'apprend avant que le client
       * réclame. C'est le défaut que le reste de ce fichier combat déjà pour
       * « Lancer la commande » ; il survivait dans sa propre sortie anticipée.
       *
       * Deux cas, et ils n'ont pas la même réponse :
       *  · des lignes attendaient mais aucune n'a pu être construite (pas
       *    d'`id`) ⇒ c'est un ÉCHEC. La table reste marquée non envoyée.
       *  · rien n'attendait ⇒ ce n'est pas un échec, mais ce n'est pas non plus
       *    un envoi : `nothing` remonte, et l'appelant ne doit pas annoncer la
       *    cuisine. */
      if (!pending) {
        if (dropped > 0) return Promise.resolve({ ok: false, error: 'unsendable-lines', dropped });
        return Promise.resolve({ ok: true, nothing: true, awaiting });
      }
      const slug = svSlug();
      if (!slug) return Promise.resolve({ ok: false, error: 'no-merchant' });
      /* Le lot est déjà écrit (svWritePending) : sans réseau, on le dit tout
         de suite au lieu d'attendre un délai ; il repartira au retour du
         réseau avec la même référence (svDrainPendingBatches). */
      if (svKnownOffline()) return Promise.resolve({ ok: false, error: 'offline' });
      return svFetchJson('/api/order/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          merchant: slug, create: true, mode: 'table', table: tableId,
          lines: pending.lines, ref: pending.ref, server: activeRole.fullName || activeRole.name || '',
          expectedSession: serviceTableSessions.get(tableId) || '',
          // Appending an independent ticket depends on the visit identity,
          // not seen_ts: every guest phone refreshes that heartbeat.
        }),
      }, SV_SEND_TIMEOUT_MS)
        .then(({ status, data: j }) => {
          if (status === 200 && j && j.ok) {
            /* Acknowledgement is per immutable line batch. A retry must not
               mark a newly-added line as sent merely because the ticket ref
               already exists. */
            const acknowledged = Array.isArray(j.lines) && j.lines.length ? j.lines : pending.lines;
            const currentPending = svReadPending(tableId);
            if (!currentPending || currentPending.ref !== pending.ref) {
              return { ok: false, error: 'pending-conflict' };
            }
            const currentOrder = tableOrders[tableId] || [];
            pending.lines.forEach((sentLine) => {
              const ack = acknowledged.find((line) => line && line.uid && line.uid === sentLine.uid)
                || acknowledged.find((line) => line && line.id === sentLine.id && line.lineId === sentLine.lineId);
              if (!ack) return;
              const qty = Math.max(0, Math.round(Number(ack.qty) || Number(sentLine.qty) || 0));
              const local = currentOrder.find((line) => line && line.uid === sentLine.uid)
                || currentOrder.find((line) => line && line.id === sentLine.id && line.lineId === sentLine.lineId);
              if (!local) return;
              const baseSentQty = pending.baseSentQty && Object.prototype.hasOwnProperty.call(pending.baseSentQty, sentLine.uid)
                ? Number(pending.baseSentQty[sentLine.uid]) || 0
                : Math.max(0, (Number(local.sentQty) || 0) - (Number(sentLine.qty) || 0));
              local.sentQty = Math.max(Number(local.sentQty) || 0,
                Math.min(Number(local.qty) || 0, baseSentQty + qty));
            });
            const knownState = serviceStateVersion.get(tableId);
            serviceBillAwaiting.set(tableId, {
              after: Number(knownState && knownState.ts) || 0,
              until: Date.now() + 30000,
            });
            if (tables[tableId] && !tables[tableId].orderNo && j.number != null) {
              tables[tableId].orderNo = serviceOrderRef({
                number: j.number, mode: 'table', channel: 'kiwi',
                server: activeRole.fullName || activeRole.name || '',
              });
            }
            if (svReadPending(tableId)?.ref === pending.ref) svForgetPending(tableId);
            const result = {
              ok: true, number: j.number, dropped,
              reference: serviceOrderRef({
                number: j.number, mode: 'table', channel: 'kiwi',
                server: activeRole.fullName || activeRole.name || '',
              }),
              replayed: !!j.replayed,
            };
            const remaining = currentOrder.some((line) => Math.max(0, (+line.qty || 0) - (+line.sentQty || 0)) > 0);
            if (!remaining) return result;
            return svSendOrderBatch(tableId).then((nextResult) => nextResult.ok ? result : nextResult);
          }
          return { ok: false, error: (j && j.error) || ('http-' + status) };
        })
        /* Délai dépassé : le serveur a peut-être reçu le lot. Le lot garde sa
           référence, un nouvel essai sera reconnu comme le même envoi. */
        .catch((err) => ({ ok: false, error: err && err.timeout ? 'timeout' : 'offline' }));
    }
    /* « Lancer » ne reste jamais grisé sans fin : au-delà, la réponse est un
       échec lisible et la commande reste à envoyer. */
    const SV_SEND_TIMEOUT_MS = 12000;
    /* Serialize sends per table. A second tap shares the first promise; the
       first request drains any line added while its ACK was in flight, and no
       ACK can mutate a later pending batch. */
    function svSendOrder(tableId) {
      if (svBrowseMode()) return Promise.resolve({ ok: false, error: 'browse-mode' });
      if (svSendFlights.has(tableId)) return svSendFlights.get(tableId);
      const previous = svSendFlights.get(tableId) || Promise.resolve();
      const run = previous.catch(() => {}).then(() => svSendOrderBatch(tableId));
      const tracked = run.finally(() => {
        if (svSendFlights.get(tableId) === tracked) svSendFlights.delete(tableId);
      });
      svSendFlights.set(tableId, tracked);
      return tracked;
    }

    /* ---------- Generated orders for occupied tables ---------- */
    /* For tables without a seedOrder, generate a plausible order from menu (deterministic) */
    function buildInitialOrder(id, t) {
      if (!SV_DEMO) return [];
      if (seedOrders[id]) return seedOrders[id].map(l => ({ ...l }));
      if (t.status === 'khawya') return [];
      /* Une table réelle sans commande saisie est vide. La suite invente des
         lignes à partir de la carte de démo — inoffensif en vitrine, faux chez
         un client. */
      const seed = parseInt(id.replace('T',''), 10);
      const lines = [];
      const mains = menuItems.filter(m => ['tajines','couscous','pastillas'].includes(m.cat));
      const drinks = menuItems.filter(m => m.cat === 'boissons');
      const starters = menuItems.filter(m => m.cat === 'entrees');
      const main = mains[seed % mains.length];
      lines.push({ id: main.id, name: main.name, qty: t.covers, price: main.price });
      const drink = drinks[seed % drinks.length];
      lines.push({ id: drink.id, name: drink.name, qty: t.covers, price: drink.price });
      if (seed % 2 === 0) {
        const st = starters[seed % starters.length];
        lines.push({ id: st.id, name: st.name, qty: 1, price: st.price });
      }
      return lines;
    }

    /* tableOrders is the editable store — populated lazily on first open */
    const tableOrders = {};
    /* Tables with unsent changes (need "Lancer la commande" to send to terminals) */
    const dirtyOrders = new Set();
    const serviceDraftTimers = new Map();
    function markDirty(tableId) {
      if (!tableId) return;
      dirtyOrders.add(tableId);
      clearTimeout(serviceDraftTimers.get(tableId));
      serviceDraftTimers.set(tableId, setTimeout(() => {
        serviceDraftTimers.delete(tableId);
        const t = tables[tableId];
        if (t) publishServiceTableState(tableId, t.status, t.covers, false);
      }, 300));
    }

    /* Stable per-line id so the same dish can sit on two lines with
       different kitchen notes (id stays = menu id for menu / routing lookups). */
    let lineSeq = 0;
    const newLineUid = () => 'ln' + (++lineSeq);
    /* Escape user-typed text before it goes into innerHTML. */
    /* A refusal reads as a sentence, never as the API's code
       (« Modification refusée : floor-table-required »). */
    const SV_ERR = {
      'floor-table-required': 'cette table n\u2019est pas dans votre coupure',
      'stale-table-visit': 'la table a été réglée ou rouverte, rechargez-la',
      'concurrent-update': 'un collègue vient de la modifier, réessayez',
      'table-operation-conflict': 'un collègue vient de la modifier, réessayez',
      'session-closed': 'la table est déjà fermée',
      'service-closed': 'le service est fermé',
      'order-not-found': 'commande introuvable, elle a peut-être été réglée',
      'not-found': 'commande introuvable, elle a peut-être été réglée',
      'line-not-on-order': 'ce plat n\u2019est plus sur la commande',
      'bad-transition': 'la commande a déjà changé d\u2019état',
      'too-many-lines': 'trop de lignes sur une seule commande',
      'empty-order': 'la commande est vide',
      'write-failed': 'le serveur n\u2019a pas pu enregistrer, réessayez',
    };
    /* Background refreshes wait for the waiter's hand. A poll or the minute
       tick rebuilt the menu or the table sheet mid-tap: the button under the
       finger vanished before its click, and a kitchen note lost focus and
       closed the keyboard. A rebuild now waits until no finger is down, no
       field is focused and the last touch is 900 ms old. */
    let svTouching = false, svLastTouch = 0;
    ['pointerdown', 'pointerup', 'pointercancel'].forEach((type) => {
      document.addEventListener(type, () => { svTouching = type === 'pointerdown'; svLastTouch = Date.now(); }, true);
    });
    function svUserBusy() {
      const a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
      return svTouching || Date.now() - svLastTouch < 900;
    }
    const svDeferred = {};
    function svWhenIdle(key, fn) {
      if (!svUserBusy()) { clearTimeout(svDeferred[key]); delete svDeferred[key]; fn(); return; }
      if (svDeferred[key]) return;
      svDeferred[key] = setTimeout(() => { delete svDeferred[key]; svWhenIdle(key, fn); }, 700);
    }
    const svErrLabel = code => SV_ERR[String(code || '')] || 'opération impossible, réessayez';
    const esc = s => String(s == null ? '' : s)
      .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function ensureTableOrder(id) {
      if (!tableOrders[id]) {
        const t = tables[id];
        tableOrders[id] = buildInitialOrder(id, t).map(l => ({
          uid:   newLineUid(),
          id:    l.id || '',
          name:  l.name,
          price: l.price,
          qty:   l.qty,
          note:  '',
        }));
      }
      return tableOrders[id];
    }
    /* Ce que le serveur sait déjà encaissé sur la visite ouverte de la table
       sans avoir soldé de commande (parts d'une addition partagée, acomptes
       d'une table fusionnée ici). L'addition proposée en est diminuée : une
       table fusionnée après un paiement partiel proposait de nouveau le total
       réuni, et l'acompte était encaissé deux fois. */
    const serviceVisitCredit = new Map();   // tableId → centimes
    function getTableTotal(id) {
      const o = tableOrders[id] || buildInitialOrder(id, tables[id]);
      const bill = o.reduce((s, l) => s + l.price * l.qty, 0);
      const credit = Math.max(0, Number(serviceVisitCredit.get(id)) || 0);
      if (!credit) return bill;
      return Math.max(0, Math.round(bill * 100) - credit) / 100;
    }

    /* ---------- State ---------- */
    let currentTab = 'tables';
    let activeTableId = null;       // currently viewing in screen-table
    let menuContextId = null;       // table for which menu is collecting items
    let activeFilter = 'all';
    let activeCat = 'all';
    let currentScope = 'mine';      // 'mine' | 'all'
    let shiftStart = null;
    let tablesPaid = 0;
    let attendanceAction = 'clock-in';
    let attendanceCode = '';

    function consumeAttendanceCode() {
      attendanceCode = '';
      const input = $('#attendance-code');
      if (input) input.value = '';
    }

    /* ---------- Toast ---------- */
    function toast(msg, ms = 1800) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = typeof employeeTranslation === 'function' ? employeeTranslation(String(msg)) : msg;
      $('#toast-stack').appendChild(el);
      setTimeout(() => el.classList.add('fade'), ms);
      setTimeout(() => el.remove(), ms + 280);
    }

    /* ---------- Browse mode: read-only ----------
       « Consulter sans pointer » ouvre le planning et les heures, rien d'autre.
       Un employé non pointé ne prend ni commande ni paiement : le serveur
       refuse déjà (activeServiceEmployee exige un pointage ouvert), et le
       client ne le laisse même plus essayer. Trois verrous, du plus large au
       plus fin : `inert` sur tout ce qui n'est pas le profil, un garde-clic
       unique en phase de capture, et un garde au pied de chaque fonction qui
       écrit (commande, paiement, état de table, ouverture, onglet). */
    const SV_BROWSE_MSG = 'Pointez votre arrivée pour prendre une commande ou un paiement';
    const SV_BROWSE_OPEN_MODALS = ['month-schedule-modal', 'hours-history-modal'];
    function svBrowseMode() { return document.body.classList.contains('is-browse-mode'); }
    function svBrowseGuard() {
      if (!svBrowseMode()) return false;
      toast(SV_BROWSE_MSG, 2600);
      return true;
    }
    function svApplyBrowseLock(on) {
      $$('#screen-main .tab').forEach(t => { t.inert = on && !t.classList.contains('tab-profil'); });
      const bar = $('#menu-cart-bar');
      if (bar) bar.inert = on;
      $$('.modal-veil').forEach(m => { m.inert = on && !SV_BROWSE_OPEN_MODALS.includes(m.id); });
    }
    document.addEventListener('click', (e) => {
      if (!svBrowseMode() || !e.target || !e.target.closest) return;
      const zone = e.target.closest('#screen-table, #menu-cart-bar, #screen-main .tab:not(.tab-profil), .modal-veil');
      if (!zone || SV_BROWSE_OPEN_MODALS.includes(zone.id)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      svBrowseGuard();
    }, true);

    /* ---------- Screens ---------- */
    function showScreen(id) {
      /* Quitter l'écran principal quitte la consultation : une session expirée
         ou une déconnexion ne doit pas laisser le prochain employé verrouillé. */
      if (id !== 'screen-main' && svBrowseMode()) exitBrowseMode();
      $$('.screen').forEach(s => {
        const active = s.id === id;
        s.classList.toggle('is-active', active);
        s.setAttribute('aria-hidden', active ? 'false' : 'true');
        s.inert = !active;
      });
      document.body.classList.toggle('is-main-screen', id === 'screen-main');
      if (id === 'screen-main') requestAnimationFrame(() => moveBtPill(true));
      // The cart bar lives inside screen-main; hide it when leaving Main
      if (id !== 'screen-main') {
        const bar = $('#menu-cart-bar');
        if (bar) bar.classList.remove('is-visible');
      }
    }

    /* ---------- PIN login ---------- */
    let pinInput = '';

    function renderPinDots() {
      $$('.pin-dot').forEach((d, i) => {
        d.classList.toggle('is-filled', i < pinInput.length);
      });
    }

    let liveEmployeeState = null;
    let pinBusy = false;

    /* Tout échec retombait sur « Email ou code personnel incorrect » : une coupure
       réseau, un pointage non écrit ou une session révoquée accusaient le code
       de l'employé, qui le retapait en boucle. Chaque cause dit maintenant la
       sienne ; sans code ni statut c'est le réseau (fetch a levé avant toute
       réponse). Retourne true quand la session n'existe plus. */
    function pinError(code, status) {
      const gone = code === 'employee-session-required' || status === 401;
      const msg = gone ? 'Session expirée · reconnectez-vous'
        : code === 'store-suspended' ? 'Cet établissement est suspendu'
        : code === 'subscription-required' ? 'Abonnement en attente de validation'
        : (code === 'not-configured' || code === 'rate-limit-unavailable') ? 'Service momentanément indisponible'
        : code === 'attendance-code-invalid' ? 'Code de pointage incorrect ou expiré'
        : code === 'too_many_attempts' ? 'Trop d\'essais · réessayez plus tard'
        : code === 'attendance-write-failed' ? 'Pointage non enregistré · réessayez'
        : (!code && !status) ? 'Connexion indisponible · vérifiez le réseau'
        : 'Opération impossible · réessayez';
      toast(msg);
      return gone;
    }
    /* Le propriétaire a retiré cet employé (ou son code a changé) pendant qu'il
       était en service : /api/employee répond 401 à chaque sondage. L'app restait
       ouverte, sans erreur, sur des données figées. On referme proprement. */
    function endRevokedSession() {
      if (SV_DEMO) return;
      stopServiceSync();
      clearEmployeeOperationalState();
      resetToEmployeePortal('Session expirée · reconnectez-vous');
    }

    async function handlePinKey(key) {
      if (pinBusy) return;
      if (key === 'back') {
        if (pinInput.length === 0) return;
        pinInput = pinInput.slice(0, -1);
        renderPinDots();
        return;
      }
      if (pinInput.length >= 4) return;
      pinInput += key;
      renderPinDots();

      if (pinInput.length === 4) {
        // Capture the entered code before we reset pinInput.
        const entered = pinInput;
        pinBusy = true;
        if (!SV_DEMO) return; // live portal uses the email + PIN form below
        // Success pop on the 4 dots, staggered left → right.
        const dots = $$('.pin-dot');
        dots.forEach((d, i) => {
          setTimeout(() => d.classList.add('is-success'), i * 70);
        });
        // Wait for the pop choreography (~500ms total — 3*70 stagger + 360 anim)
        // before transitioning to the next screen, so the user sees it.
        setTimeout(() => {
          pinInput = '';
          pinBusy = false;
          // Clear both filled + success states for next login cycle
          dots.forEach(d => d.classList.remove('is-success', 'is-filled'));
          // Resolve the role: an operator-managed PIN (if any) wins, otherwise the
          // demo rule — 0000 → non-server employee (plongeur), any other → serveur.
          activeRole = resolveRole(entered);
          applyRoleToClockin();
          resetNfc();
          showScreen('screen-clockin');
          lucide.createIcons();
        }, 560);
      }
    }

    $('#pin-keypad').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-key]');
      if (!btn) return;
      handlePinKey(btn.dataset.key);
    });

    // Physical keyboard support (desktop demo)
    document.addEventListener('keydown', (e) => {
      if (!SV_DEMO) return;
      if (!$('#screen-pin').classList.contains('is-active')) return;
      if (e.key >= '0' && e.key <= '9') { handlePinKey(e.key); return; }
      if (e.key === 'Backspace')         { handlePinKey('back'); return; }
    });

    function openEmployeeSession(data) {
      liveEmployeeState = data;
      employeeStoreZone = data.store && data.store.timezone || '';
      try { localStorage.setItem('kiwiEmployeeMerchant', data.merchant || ''); } catch (_) {}
      applyEmployeeLive(data);
      /* Bootstrap ran before login and therefore had no tenant yet. Load the
         authenticated restaurant's menu now instead of waiting for the user
         to hide/show or reload the app. */
      try { svRebuildCarte(); svFetchCarte(); } catch (_) {}
      activeRole = resolveRole('');
      if (!activeRole) throw new Error('employee-role-missing');
      const open = data.attendance && data.attendance.open;
      if (open) {
        shiftStart = new Date(Number(open.inTs) || Date.now());
        startServiceSync();
        applyRoleToMain();
        renderSchedule();
        renderHours();
        updateShiftMeta();
        setTab(activeRole.defaultTab);
        renderAll();
        showScreen('screen-main');
      } else {
        shiftStart = null;
        prepareAttendanceGate('clock-in');
      }
      try { document.dispatchEvent(new CustomEvent('kiwi-employee-authenticated')); } catch (_) {}
      if (window.lucide) lucide.createIcons();
    }

    const employeeLogin = $('#employee-login');
    if (!SV_DEMO) document.body.classList.add('live-employee-portal');
    if (employeeLogin) employeeLogin.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (SV_DEMO || pinBusy) return;
      const email = String($('#employee-email').value || '').trim();
      const pin = String($('#employee-pin').value || '').replace(/\D/g, '').slice(0, 4);
      const error = $('#employee-login-error');
      const button = $('#employee-login-submit');
      error.textContent = '';
      if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{4}$/.test(pin)) {
        error.textContent = 'Entrez votre email et votre code à 4 chiffres.';
        return;
      }
      pinBusy = true; button.disabled = true;
      try {
        if (!window.KiwiEmployeeLive) throw new Error('not-configured');
        openEmployeeSession(await window.KiwiEmployeeLive.login(email, pin));
        $('#employee-pin').value = '';
      } catch (err) {
        const c = err && err.code;
        error.textContent = c === 'too_many_attempts' ? 'Trop d’essais. Réessayez dans quelques minutes.'
          : c === 'store-suspended' ? 'Cet établissement est suspendu.'
          : c === 'employee-access-ambiguous' ? 'Cet email existe dans plusieurs établissements. Contactez votre responsable.'
          : (c === 'not-configured' || c === 'rate-limit-unavailable' || (err && err.status >= 500)) ? 'Service momentanément indisponible. Réessayez.'
          : (err && !err.status && !c) ? 'Connexion indisponible. Vérifiez le réseau et réessayez.'
          : 'Email ou code personnel incorrect.';
      } finally {
        pinBusy = false; button.disabled = false;
      }
    });

    /* ===========================================================
       ROLES — identity model
       -----------------------------------------------------------
       Same terminal, multiple roles. PIN 0000 logs in a non-server
       employee (plongeur in the demo) — same UI, same clock-in,
       same welcome flash, but a restricted main view (profil only).
       Any other 4-digit code logs in the serveur with full access.
       =========================================================== */
    const ROLES = {
      serveur: {
        id: 'yassir',  name: 'Yassir', fullName: 'Yassir K.',  initials: 'YK',
        role: 'Serveur',  tabs: ['tables', 'menu', 'notifications', 'profil'],
        defaultTab: 'tables', restricted: false,
      },
      plongeur: {
        id: 'mounir',  name: 'Mounir', fullName: 'Mounir A.',  initials: 'MA',
        role: 'Plongeur', tabs: ['notifications', 'profil'],
        defaultTab: 'profil', restricted: true,
      },
    };
    let activeRole = ROLES.serveur;

    /* ── Real / paired store → neutralize ALL demo staff + floor state ──────────
       Mirrors the caisse's applyStoreIdentity: a real store's waiter app opens
       with an empty floor and generic staff, never the Café Atlas demo roster
       (Yassir / Mehdi / Karim / Sofia) or pre-seeded tables/orders. Local demo
       (unpaired localhost) is untouched — svReal() is false there. */
    if (svReal()) {
      // Floor: BLANK it — not Café Atlas's specific T1-T21 layout (that geometry —
      // Yassir's salle, Karim's terrasse, Sofia's étage — is demo data, and showing
      // one venue's floor inside another is the P7 leak). Delete every seeded table
      // so the waiter opens an empty floor until the store builds its own; every
      // renderer here iterates Object.keys(tables) or guards tables[id], so empty is
      // safe. currentUser still resolves in `servers` (kept, renamed generic below).
      Object.keys(tables).forEach(function (id) { delete tables[id]; });
      // No pre-seeded orders on a clean floor.
      Object.keys(seedOrders).forEach(function (id) { delete seedOrders[id]; });
      // Roster: generic, all on-duty (drops the "en pause" colleague alert too).
      var _svGen = { yassir: 'Serveur', mehdi: 'Serveur 2', karim: 'Serveur 3', sofia: 'Serveur 4' };
      Object.keys(servers).forEach(function (k) {
        servers[k].name = _svGen[k] || 'Serveur';
        servers[k].initials = 'S';
        servers[k].status = 'on-duty';
      });
      // Role identity: generic when no operator-managed PIN personalizes it. A
      // managed PIN still wins via resolveRole()'s Object.assign.
      ROLES.serveur.id = 'serveur'; ROLES.serveur.name = 'Serveur';
      ROLES.serveur.fullName = 'Serveur'; ROLES.serveur.initials = 'S';
      ROLES.plongeur.name = 'Plongeur'; ROLES.plongeur.fullName = 'Plongeur';
      ROLES.plongeur.initials = 'P';
      // The id is also the SCHEDULE_DATA key, and 'mounir' is a demo week
      // (08:00–16:00, Mounir A.). The serveur was moved off it above; the
      // restricted role kept it, so a real store's employee opened their profile
      // on a schedule that belongs to Café Atlas. Now that EVERY non-floor role
      // lands here — cook, cashier, magasinier — it must be blank too:
      // renderSchedule() no-ops on an unknown id, renderHours() already does.
      ROLES.plongeur.id = 'plongeur';
    }

    /* Managed PINs (from the operator console via /api/config) win over the demo
       rule, additively — if none match, behavior is exactly as before.

       WHO GETS THE FLOOR. This used to read `role === 'plongeur'`, so the
       dishwasher was the only employee held back and EVERY other role walked
       into the tables view: a cook, a cashier, a stockroom hand, a hairdresser.
       They are not waiters. The decision now comes from assets/staff-roles.js —
       floor service and management open the full app, everyone else lands on the
       restricted view (clock-in, shift, hours, profile), which is all they need.

       The restricted role object is the plongeur one, so it keeps `restricted`,
       its single tab and its schedule id — but never its NAME: a cashier is
       shown "Caissier", not "Plongeur". Unknown roles stay on the floor (see
       KiwiRoles.isService) so nobody loses access they have today, and the file
       failing to load falls straight back to the old rule. */
    function resolveRole(entered) {
      if (!SV_DEMO && liveEmployeeState && liveEmployeeState.employee) {
        const emp = liveEmployeeState.employee;
        const raw = emp.role || '';
        const storeType = String(liveEmployeeState.store && liveEmployeeState.store.type || '').toLowerCase();
        const nonDining = storeType && !['restaurant', 'cafe', 'café'].includes(storeType);
        if (nonDining) {
          return Object.assign({}, ROLES.plongeur, {
            id: emp.id || ROLES.plongeur.id,
            name: emp.firstName || String(emp.name || 'Employé').split(/\s+/)[0],
            fullName: emp.name || 'Employé', initials: emp.initials || 'E',
            role: window.KiwiRoles ? KiwiRoles.label(raw) : (raw || 'Employé'),
            tabs: ['tables', 'notifications', 'profil'], defaultTab: 'tables',
            restricted: true, tradeWorkspace: true,
          });
        }
        const R = window.KiwiRoles;
        const floor = R ? R.isService(raw) : /serveur|service|salle|manager|propri/i.test(raw);
        const base = floor ? ROLES.serveur : ROLES.plongeur;
        return Object.assign({}, base, {
          id: emp.id || base.id,
          name: emp.firstName || String(emp.name || 'Employé').split(/\s+/)[0],
          fullName: emp.name || 'Employé',
          initials: emp.initials || 'E',
          role: R ? R.label(raw) : (raw || 'Employé'),
        });
      }
      /* Ici vivait un repli qui comparait `entered` aux codes de KiwiConfig.pins.
         Il ne pouvait plus rien décider — le portail réel appelle resolveRole('')
         et le pavé à quatre chiffres est réservé à la démo — et il n'existait que
         parce que /api/config expédiait les codes au navigateur. Ce n'est plus le
         cas : le rôle vient de la session employé (liveEmployeeState), sinon rien. */
      return SV_DEMO ? ((entered === '0000') ? ROLES.plongeur : ROLES.serveur) : null;
    }

    function tableSeats(t) {
      if (+t.seats > 0) return +t.seats;
      const m = String(t.type || '').match(/(\d+)/);
      return m ? +m[1] : 2;
    }
    function employeeSchedule(data) {
      const map = (data && data.schedule) || {};
      const monday = employeeCivilDate();
      monday.setHours(12, 0, 0, 0);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      const week = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday); d.setDate(monday.getDate() + i);
        const key = employeeCivilKey(d);
        const s = map[key];
        week.push(s && !s.off && s.start && s.end ? { in: s.start, out: s.end } : null);
      }
      return { week, dates: map, monthHours: '·' };
    }
    function applyEmployeeLive(data) {
      if (!data || !data.employee) return;
      const wasPaused = isEmployeePaused();
      liveEmployeeState = data;
      employeeStoreZone = data.store && data.store.timezone || '';
      tickClock();
      const emp = data.employee;
      currentUser = emp.id || 'employee';
      loadServiceHistory();

      Object.keys(servers).forEach((k) => { delete servers[k]; });
      (data.colleagues || []).forEach((c) => {
        servers[c.id] = { name: c.name || 'Employé', initials: c.initials || 'E', status: c.status || 'off-duty' };
      });
      if (!servers[currentUser]) servers[currentUser] = { name: emp.name, initials: emp.initials || 'E', status: data.attendance && data.attendance.open ? 'on-duty' : 'off-duty' };
      const nowPaused = !!(data.attendance && data.attendance.open && data.attendance.open.pauseTs);
      if (shiftStart && wasPaused !== nowPaused) {
        serviceNotify('Gestion du service', nowPaused ? 'La caisse vous a mis en pause.' : 'La caisse a terminé votre pause.', {
          type: 'team-message', id: 'pause-' + (nowPaused ? 'start-' : 'end-') + Date.now(), ts: Date.now(),
        });
      }
      if (shiftStart) {
        (data.messages || []).forEach((message) => {
          if (!message || !message.id || teamMessageSeen.has(message.id)) return;
          teamMessageSeen.add(message.id);
          serviceNotify(message.sender || 'Caisse', message.text || '', {
            type: 'team-message', id: message.id, ts: message.ts,
          });
        });
      }

      const floor = data.floor || { zones: [], tables: [], staff: [] };
      const zoneNames = Object.create(null), floorStaff = Object.create(null);
      (floor.zones || []).forEach((z) => { zoneNames[z.id] = z.name || 'Salle'; });
      (floor.staff || []).forEach((s) => { floorStaff[s.id] = s.name || ''; });
      const colleagueByName = Object.create(null);
      (data.colleagues || []).forEach((c) => { colleagueByName[String(c.name || '').trim().toLowerCase()] = c.id; });
      /* A refresh carries the owner's latest geometry/assignment, not the
         live order state held by this service app. Preserve that state while
         replacing the plan so polling cannot turn an occupied table empty. */
      const previousTables = Object.assign({}, tables);
      Object.keys(tables).forEach((k) => { delete tables[k]; });
      (floor.tables || []).forEach((t) => {
        const rawAssigned = Array.isArray(t.servers) && t.servers.length ? t.servers : (t.server ? [t.server] : []);
        const assignedIds = Array.from(new Set(rawAssigned.map((rawId) => {
          const id = String(rawId || '');
          return servers[id] ? id : (colleagueByName[String(floorStaff[id] || '').trim().toLowerCase()] || '');
        }).filter(Boolean))).slice(0, 3);
        const assigned = assignedIds[0] || '';
        const id = String(t.num || t.id || '').trim() || String(t.id || 'Table');
        /* The file still contains sample tables for the standalone demo. On a
           live login those objects exist before the first cloud poll, so
           preserving them here made T1/T2/T4 look occupied after every reload.
           Preserve only state that this live session has actually received
           from /api/service/events. */
        const previous = serviceStateVersion.has(id) ? (previousTables[id] || null) : null;
        tables[id] = {
          zone: t.zone || 'salle', zoneLabel: zoneNames[t.zone] || 'Salle', server: assigned, servers: assignedIds,
          covers: tableSeats(t), seats: tableSeats(t),
          status: previous ? previous.status : (t.status === 'occupied' ? 'ka-yaklo' : 'khawya'),
          elapsed: previous ? (previous.elapsed || 0) : 0,
        };
      });
      SCHEDULE_DATA[emp.id] = employeeSchedule(data);
      const storeName = data.store && data.store.name || '';
      /* Le serveur renvoie le slug quand le commerce n'a pas de nom enregistré :
         ce n'est pas une enseigne, on laisse alors le repli habituel. */
      if (storeName && storeName !== data.merchant) svStoreName = storeName;
      document.querySelectorAll('.ci-restaurant').forEach((el) => { el.textContent = storeName; });
      const sc = document.getElementById('kg-sc-meta'); if (sc) sc.textContent = storeName;
    }

    function applyRoleToClockin() {
      const r = activeRole;
      const greetEl = $('.ci-greeting');
      const roleEl  = $('.ci-role');
      if (greetEl) greetEl.innerHTML = `${esc(employeeHello(''))} <em>${esc(r.name)}</em>`;
      if (roleEl)  roleEl.textContent = svName('Café Atlas') ? `${employeeRoleName(r.role)} · ${svName('Café Atlas')}` : employeeRoleName(r.role);
    }

    function applyRoleToMain() {
      const r = activeRole;
      const av = $('.tb-avatar');
      const nm = $('.tb-name');
      const pAv = $('.profil-avatar');
      const pNm = $('.profil-name');
      const pRl = $('.profil-role');
      if (av)  av.textContent  = r.initials;
      if (nm)  nm.textContent  = r.fullName;
      if (pAv) pAv.textContent = r.initials;
      if (pNm) pNm.textContent = r.fullName;
      if (pRl) pRl.textContent = svName('Café Atlas') ? `${employeeRoleName(r.role)} · ${svName('Café Atlas')}` : employeeRoleName(r.role);
      document.body.classList.toggle('is-role-restricted', r.restricted);
      $$('.bt-btn').forEach(btn => {
        btn.hidden = !r.tabs.includes(btn.dataset.tab);
      });
    }

    /* A clocked-in floor employee receives the store floor for the explicit
       "Toutes les tables" coverage view. The edge still identifies which
       tables are theirs and which belong to a paused colleague, so alerts are
       targeted instead of ringing every phone for every ticket. */
    let serviceSyncTimer = null;
    let serviceOrderSince = 0;
    let serviceEventSince = 0;
    let servicePlanTick = 0;
    const serviceOrderStatus = new Map();
    /* Canonical kitchen/order rows keyed by order id. Shared table snapshots
       are transport/cache only; once this map has answered, they may never add
       a sent item that does not exist in /api/order/queue. */
    const serviceCanonicalOrders = new Map();
    const serviceTableSessions = new Map();
    const serviceReopenedBills = new Map();
    let serviceReopenedBillsAvailable = !!SV_DEMO;
    const serviceTableSessionRevisions = new Map();
    let serviceCanonicalReady = false;
    const serviceEventSeen = new Set();
    const serviceStateVersion = new Map();
    const serviceBillAwaiting = new Map();
    const SERVICE_BILL_SYNC_VERSION = 4;
    const teamMessageSeen = new Set();
    const serviceMineTables = new Set();
    const servicePausedTables = new Set();
    const serviceNotifications = [];
    let serviceUnread = 0;
    let serviceHistoryKey = '';








    let serviceTableLocks = {};









    /* ── Ce que l'app sait, et depuis quand ──────────────────────────────────
     * Les erreurs de synchro étaient avalées (`.catch(() => {})`) : sans
     * réseau, le plan de salle restait figé, tables « libres » comprises, et
     * rien ne le disait. svSync retient la dernière synchro RÉUSSIE ; les
     * données sont « en retard » quand le dernier tour a échoué, quand le
     * système se sait hors ligne, ou quand aucune synchro n'a réussi depuis
     * trois tours. Alors, et seulement alors, l'en-tête l'écrit avec l'heure. */
    const SV_POLL_TIMEOUT_MS = 10000;
    const SV_POLL_SKIP = {};
    const svSync = { lastOkAt: 0, failing: false, resumedAt: 0 };





    window.addEventListener('online', () => { svRenderSyncStatus(); if (shiftStart && !SV_DEMO) { try { pollServiceSync(); } catch (_) {} } });
    window.addEventListener('offline', () => {
      svRenderSyncStatus();
      if (currentTab === 'tables') svWhenIdle('tables', () => { try { renderTables(); } catch (_) {} });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      svSync.resumedAt = Date.now();
      svRenderSyncStatus();
      if (shiftStart && !SV_DEMO && liveEmployeeState) { try { pollServiceSync(); } catch (_) {} }
    });
    if (typeof setInterval === 'function') {
      setInterval(() => { if (!document.hidden) svRenderSyncStatus(); }, 10000);
    }

    /* Matériel Symbols (assets/icons/material/schedule.svg, wifi_off.svg),
       tracés intacts, remplis par currentColor. */
    const SV_ICON_SYNC = '<svg class="ms" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="m612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z"/></svg>';
    const SV_ICON_OFFLINE = '<svg class="ms" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M790-56 414-434q-47 11-87.5 33T254-346l-84-86q32-32 69-56t79-42l-90-90q-41 21-76.5 46.5T84-516L0-602q32-32 66.5-57.5T140-708l-84-84 56-56 736 736-58 56Zm-381-93.5Q380-179 380-220q0-42 29-71t71-29q42 0 71 29t29 71q0 41-29 70.5T480-120q-42 0-71-29.5ZM716-358l-29-29-29-29-144-144q81 8 151.5 41T790-432l-74 74Zm160-158q-77-77-178.5-120.5T480-680q-21 0-40.5 1.5T400-674L298-776q44-12 89.5-18t92.5-6q142 0 265 53t215 145l-84 86Z"/></svg>';

    /* ── Le plan de salle avant sa première synchro ──────────────────────────
       Le plan (les tables) arrive avec la session ; leur ÉTAT (occupée,
       addition, libre) n'arrive qu'avec la première synchro. Avant, toutes les
       tables s'affichaient « libres », ce qui est faux pendant le service :
       une ligne le dit au-dessus du plan, et un plan vide distingue
       « chargement », « injoignable » et « réellement vide ». */


    /* Six secondes restent la cadence de référence : c'est elle qui tient
       partout tant que le concentrateur temps réel n'est pas déployé, et c'est
       elle qui revient d'elle-même à la moindre coupure de socket. Quand une
       socket EST ouverte, la caisse réveille le serveur à l'instant où une
       table change — le sondage n'est plus la façon d'apprendre le changement,
       seulement le filet, et il peut s'espacer. On relit la cadence à chaque
       tour : il n'y a rien à défaire au retour. */
    const SERVICE_SYNC_FAST = 6000;
    const SERVICE_SYNC_LIVE = 20000;
    /* L'abonnement se retente à chaque tour, et c'est voulu : live-socket.js
       est chargé en `defer` (donc après ce script) et le commerçant n'est connu
       qu'une fois l'employé pointé. Un appel de plus quand la salle est déjà la
       bonne ne coûte rien — KiwiLiveSocket.on ressort aussitôt. */

    /* ── LE LOT PARTI À MOITIÉ ────────────────────────────────────────────
     * Un lot enregistré ici est une commande que le serveur a validée devant
     * le client mais dont la cuisine n'a pas encore accusé réception. Il était
     * bien écrit sur le disque — et plus jamais relu tout seul : il fallait
     * que quelqu'un rouvre CETTE table et appuie de nouveau sur envoyer. Une
     * tablette qui se recharge au mauvais moment laissait donc une commande en
     * suspens que personne ne savait en suspens.
     *
     * On les vide au démarrage, et dès que le réseau revient. `svSendOrderBatch`
     * repart du lot stocké avec sa référence d'origine : c'est la même
     * commande, pas une seconde. */
    let svDrainAt = 0;


    window.addEventListener('online', () => { try { svDrainPendingBatches(); } catch (_) {} });
    /* Le dernier instant où l'on peut encore écrire : l'onglet que l'iOS
       recycle ne repasse pas par un événement plus tardif. */
    window.addEventListener('pagehide', () => { try { svSaveDrafts(); } catch (_) {} });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { try { svSaveDrafts(); } catch (_) {} }
    });


    /* A service login is an identity boundary, not just a different name in
       the header. Table drafts live in memory so they survive navigation inside
       one shift, but they must NEVER survive logout / clock-out and become the
       next employee's bill. In particular, cancel every delayed state upload
       before clearing the lines: otherwise a 300 ms timer created by employee A
       fires after employee B logs in and republishes A's bill with B's session. */


    /* ===========================================================
       Six-digit caisse code — gates "Pointer l'arrivée"
       -----------------------------------------------------------
       The employee's login proves who they are. The short-lived code
       shown by the paired caisse proves they are inside the store.
       =========================================================== */
    let nfcTapped = false;



    $('#attendance-code').addEventListener('input', (event) => {
      const value = String(event.target.value || '').replace(/\D/g, '').slice(0, 6);
      event.target.value = value;
      attendanceCode = value;
      if (value.length === 6) fireNfcTap();
      else resetNfc();
    });

    /* ---------- Clock-in / Clock-out ---------- */
    $('#ci-button').addEventListener('click', async () => {
      const btn = $('#ci-button');
      if (btn.classList.contains('is-loading')) return;
      btn.classList.add('is-loading');
      try {
        if (window.Notification && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
      } catch (_) {}

      let cloudStart = null;
      if (!SV_DEMO) {
        try {
          if (attendanceAction === 'clock-out') {
            await finishClockOut();
            btn.classList.remove('is-loading');
            return;
          }
          const saved = await window.KiwiEmployeeLive.clockIn(attendanceCode);
          if (saved && saved.queued) toast(PUNCH_SAVED, 3200);
          cloudStart = saved && saved.entry && saved.entry.inTs ? new Date(saved.entry.inTs) : new Date();
          if (liveEmployeeState && liveEmployeeState.attendance) liveEmployeeState.attendance.open = saved.entry || null;
          consumeAttendanceCode();
        } catch (err) {
          btn.classList.remove('is-loading');
          if (pinError(err && err.code, err && err.status)) endRevokedSession();
          return;
        }
      }
      enterServiceAfterClockIn(btn, cloudStart);
    });

    /* The shift is open: the same entry whether the code came from the field
       above or from the kit's pad (kiwiSkin2027:team). */


    /* ===========================================================
       BROWSE MODE — consult schedule from home without clocking in
       -----------------------------------------------------------
       Employee taps "Consulter sans pointer" on the clock-in screen.
       We jump straight to a read-only profil view:
         · no shiftStart (no live duration ticking)
         · body.is-browse-mode hides shift-card, gamification, tabs
         · off-shift banner shows a "Pointer mon arrivée" CTA that
           returns to the normal clock-in flow if they're actually
           at the restaurant.
       =========================================================== */




    // Entry point on clock-in screen
    $('#ci-browse-link').addEventListener('click', () => {
      enterBrowseMode();
    });

    // "Pointer mon arrivée" CTA inside the off-shift banner — bounce back
    // to the clock-in screen so the employee can enter the caisse code.
    $('#offshift-clockin').addEventListener('click', () => {
      exitBrowseMode();
      prepareAttendanceGate('clock-in');
      lucide.createIcons();
    });

    // "Se déconnecter" — full logout back to PIN screen.
    $('#offshift-logout').addEventListener('click', () => {
      exitBrowseMode();
      logoutEmployeeSession();
    });

    /* ---------- Greeting flash sequence (post clock-in) ---------- */







    /* The lock names nobody until someone has signed in on this phone: on a
       fresh install it greeted "Yassir", a stranger to whoever holds it. Once
       an employee has used the device we greet them, with a way to hand over. */

    document.querySelector('[data-pin-switch]')?.addEventListener('click', function () {
      const who = document.querySelector('[data-pin-who]');
      if (who) { delete who.dataset.employee; who.textContent = who.dataset.venue || 'Kiwi'; }
      this.hidden = true;
      pinInput = ''; renderPinDots();
    });




    /* Pointage gardé sur le téléphone (réseau coupé) : l'employé le sait, puis
       apprend qu'il est parti, ou qu'il a été refusé (assets/employee-live.js). */
    const PUNCH_SAVED = 'Pointage enregistré sur ce téléphone · envoi dès le retour du réseau';
    document.addEventListener('kiwi-employee-punch-queue', (event) => {
      const d = (event && event.detail) || {};
      if (d.rejected && d.rejected.length) toast('Pointage du téléphone refusé · voyez avec votre responsable', 4200);
      else if (d.sent && !d.pending) toast('Pointage du téléphone envoyé', 2400);
    });


    /* ---------- Design 2027 (kiwiSkin2027:team) ----------
       The sign-in and the attendance code on the kit's pad
       (assets/kit/team-pin.js), judged by KiwiPinFlow's team and clock rows.
       Live sessions only: the demo keeps its own keypad. What the pad does not
       decide stays here: loading the session, and what follows a recorded
       clock-in or clock-out. Flag off, KiwiTeamPin never exists. */



    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountTeamSignIn);
    else mountTeamSignIn();



    $('#profil-clockout').addEventListener('click', () => {
      clockOut();
    });

    /* ---------- Tabs ---------- */
    /* Slide + rubber-band the highlight pill to the active tab (Instagram-style). */
    let btPillLeft = null, btPillW = null;

    window.addEventListener('resize', () => moveBtPill(true));



    $$('.bt-btn').forEach(btn => {
      btn.addEventListener('click', () => setTab(btn.dataset.tab));
    });

    /* ---------- Tables tab ---------- */
    const statusLabel = {
      'khawya':       'Libre',
      'a-commander':  'À commander',
      'ka-yaklo':     'En cours',
      'bgha-ykhlass': 'Addition demandée',
      'ka-tkhdam':    'Paiement…',
      'khlass':       'Réglée',
    };

















    $('#scope-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-scope]');
      if (!btn) return;
      currentScope = btn.dataset.scope;
      renderTables();
    });

    $('#table-filters').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      activeFilter = btn.dataset.filter;
      renderTables();
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-reset-filter]')) {
        activeFilter = 'all';
        renderTables();
      }
    });

    // Colleague-pause alert → switch to "Toutes" view
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-go-all]')) {
        currentScope = 'all';
        renderTables();
      }
    });

    document.addEventListener('click', (e) => {
      const card = e.target.closest('.table-card');
      if (card && currentTab === 'tables') {
        openTableDetail(card.dataset.table);
      }
    });

    /* ---------- Table Detail Screen ---------- */




    /* Special table detail view when a split is in progress */


    /* Leave the table-detail screen and land cleanly on the FLOOR.
       Bug fix: the back arrow / "Lancer" used to call showScreen('screen-main')
       WITHOUT setTab('tables'). showScreen only toggles the full-screen layer —
       not the inner tab panel — so after the take-order → menu flow (where
       currentTab is 'menu') you were dropped onto the Menu panel still showing
       "Commande pour Tx", with no back affordance. The screen felt frozen.
       Always return to the Tables floor and clear the lingering order context. */


    /* ---- back button ---- */
    $('#td-back').addEventListener('click', returnToFloor);

    /* ---- footer actions ---- */
    $('#td-footer').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (activeTableId && (!serviceReopenedBillsAvailable || serviceReopenedBills.has(activeTableId))) {
        toast(`Table ${activeTableId} · note rouverte, règlement au comptoir`, 4800);
        return;
      }

      if (action === 'take-order') {
        const t = tables[activeTableId];
        if (t && t.status === 'a-commander') {
          t.status = 'ka-yaklo';
          t.elapsed = 0;
          publishServiceTableState(activeTableId, t.status, t.covers, false);
        }
        menuContextId = activeTableId;
        showScreen('screen-main');
        setTab('menu');
      } else if (action === 'lancer') {
        // Fire the order to the kitchen + bar terminals, then return to the
        // floor — the server's work at this table is done for now. (Previously
        // we stayed on the detail screen and the back arrow misrouted to the
        // Menu panel, which read as a freeze.)
        const sentId = activeTableId;
        const order = tableOrders[sentId] || [];
        const hasNotes = order.some(l => (l.note || '').trim());
        let msg = `Table ${sentId} · commande envoyée`;
        const dests = svStationNames(order);
        if (dests)                            msg += ` · ${dests}`;
        if (hasNotes)                         msg += ` · notes transmises`;

        /* La vitrine n'a pas de commerce derrière : rien à envoyer, et le
           parcours de démonstration doit rester instantané. */
        if (SV_DEMO) {
          dirtyOrders.delete(sentId);
          returnToFloor();
          toast(msg);
          return;
        }

        /* Le bouton se verrouille le temps de l'aller-retour — sans cela un
           serveur pressé tape deux fois et part avant la réponse. Il DIT
           aussi qu'il travaille : un bouton simplement grisé, sur un wifi
           lent, se lisait comme une app plantée. L'envoi a un délai
           (SV_SEND_TIMEOUT_MS) ; au-delà, l'échec est annoncé et la commande
           reste à envoyer. */
        btn.disabled = true;
        btn.classList.add('is-busy');
        btn.setAttribute('aria-busy', 'true');
        btn.innerHTML = `<span class="td-btn-spinner" aria-hidden="true"></span> ${esc(employeeTranslation('Envoi en cours…'))}`;
        svSendOrder(sentId).then((res) => {
          /* Rien n'est parti : on ne dit PAS « commande envoyée ». Le drapeau
           * « non envoyée » reste, le serveur reste sur la table. Annoncer la
           * cuisine ici était le faux succès que svSendOrderBatch vient de
           * cesser de produire — la moitié appelante doit cesser de l'annoncer
           * aussi, sinon le correctif ne se voit nulle part. */
          if (res.ok && res.nothing) {
            btn.disabled = false;
            renderTableDetail();
            toast(`Table ${sentId} · rien de nouveau à envoyer`, 3600);
            return;
          }
          if (res.ok) {
            publishServiceTableState(sentId, tables[sentId].status, tables[sentId].covers, false);
            dirtyOrders.delete(sentId);
            returnToFloor();
            const sentMsg = res.reference ? `${msg} · ticket ${res.reference}` : msg;
            /* Envoi partiel : ce qui est parti est parti, mais le serveur doit
             * savoir que des lignes sont restées à quai. */
            toast(res.dropped > 0
              ? `${sentMsg} · ${res.dropped} ligne(s) non identifiée(s) NON envoyée(s)`
              : sentMsg, res.dropped > 0 ? 5200 : undefined);
          } else {
            /* On NE nettoie pas le drapeau : la table doit rester marquée « non
               envoyée », c'est tout l'objet de ce changement. Le serveur reste
               sur la table, voit pourquoi, et peut relancer. */
            btn.disabled = false;
            renderTableDetail();
            toast(`Table ${sentId} · ${SV_SEND_MSG[res.error] || 'envoi impossible'}`, 4200);
          }
        });
      } else if (action === 'ask-bill') {
        const t = tables[activeTableId];
        const id = activeTableId;
        /* Sans réseau, la demande ne peut pas partir : on le dit tout de suite,
           sans basculer la table, plutôt que d'attendre un délai. */
        if (!SV_DEMO && svKnownOffline()) {
          toast("Pas de réseau. L'addition n'est pas transmise, réessayez au retour du réseau.", 5200);
          return;
        }
        const previousStatus = t.status;
        t.status = 'bgha-ykhlass';
        t.elapsed = 0;
        renderTableDetail();
        btn.disabled = true;
        const result = await publishServiceTableState(id, t.status, t.covers, false);
        btn.disabled = false;
        if (!result.ok) {
          t.status = previousStatus;
          renderTableDetail();
          toast(result.error === 'offline'
            ? "Pas de réseau. L'addition n'est pas transmise, réessayez au retour du réseau."
            : `Table ${id} · addition non transmise, réessayez`, 5200);
          return;
        }
        toast(`Addition demandée pour ${id}`);
      } else if (action === 'pay') {
        const pending = (tableOrders[activeTableId] || []).some((line) =>
          Math.max(0, Number(line.qty) || 0) > Math.max(0, Number(line.sentQty) || 0));
        if (pending || dirtyOrders.has(activeTableId)) {
          toast(`Table ${activeTableId} · envoyez d'abord la commande en cuisine`, 4800);
          return;
        }
        openPayChoice(activeTableId);
      } else if (action === 'print-bill') {
        /* Le téléphone n'a pas d'imprimante : il demande à la caisse hub
           d'impression de sortir l'addition de cette table. Ce bouton
           affichait « Impression… » sans rien envoyer nulle part. */
        const id = activeTableId;
        if (SV_DEMO) { toast(`Table ${id} · addition envoyée à la caisse`); return; }
        const unsent = (tableOrders[id] || []).some((line) =>
          Math.max(0, Number(line.qty) || 0) > Math.max(0, Number(line.sentQty) || 0));
        if (unsent || dirtyOrders.has(id)) {
          toast(`Table ${id} · envoyez d'abord la commande en cuisine`, 4800);
          return;
        }
        if (svKnownOffline()) { toast("Pas de réseau. L'addition n'est pas imprimée, réessayez.", 5200); return; }
        btn.disabled = true;
        let sent = null;
        try {
          sent = await svFetchJson('/api/service/events', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant: svSlug(), printBill: { table: id } }),
          });
        } catch (_) { sent = null; }
        btn.disabled = false;
        toast(sent && sent.ok && sent.data && sent.data.ok
          ? `Table ${id} · addition envoyée à l'imprimante de la caisse`
          : `Table ${id} · impression non transmise, réessayez`, 4200);
      } else if (action === 'cancel-table') {
        const id = activeTableId;
        const expectedSession = serviceTableSessions.get(id) || '';
        if (!SV_DEMO && !expectedSession) {
          toast(`Table ${id} · visite non synchronisée, réessayez`, 5200);
          return;
        }
        if (!confirm(employeePick(
          `Annuler toute la table ${id} ? Les commandes envoyées seront retirées et la cuisine prévenue. Aucun paiement ne sera enregistré.`,
          `Cancel the whole table ${id}? Orders already sent will be withdrawn and the kitchen told. No payment will be recorded.`,
          `إلغاء الطاولة ${id} بالكامل؟ ستُسحب الطلبات المرسلة ويُبلَّغ المطبخ. لن يُسجَّل أي دفع.`))) return;
        btn.disabled = true;
        let result;
        if (!SV_DEMO) {
          try {
            const data = await postServiceCancellation({ merchant: svSlug(),
              cancelTable: { table: id, expectedSession } });
            try { result = await publishServiceTableState(id, 'khawya', 0, false); }
            catch (_) { result = { ok: true }; /* canonical visit was already closed */ }
            result.cancelled = Number(data.ordersCancelled) || 0;
            result.sessionClosed = true;
          } catch (error) {
            btn.disabled = false;
            toast(`Table ${id} conservée · ${error.message || 'annulation impossible'}`, 5200);
            return;
          }
        } else result = { ok: true, cancelled: 0, sessionClosed: true };
        btn.disabled = false;
        tables[id].status = 'khawya';
        tables[id].covers = 0;
        tables[id].elapsed = 0;
        delete tableOrders[id];
        delete tables[id].orderNo;
        dirtyOrders.delete(id);
        tableSplits.delete(id);
        serviceTableSessions.delete(id);
        serviceTableSessionRevisions.delete(id);
        Array.from(serviceCanonicalOrders.entries()).forEach(([orderId, order]) => {
          if (String(order.table) === String(id)) serviceCanonicalOrders.delete(orderId);
        });
        returnToFloor();
        if (!result.ok) toast(`Table ${id} annulée · cuisine prévenue · plan en cours de synchronisation`, 5200);
        else toast(`Table ${id} annulée · ${result.cancelled} commande${result.cancelled > 1 ? 's' : ''} retirée${result.cancelled > 1 ? 's' : ''} · cuisine prévenue`);
      } else if (action === 'resume-split') {
        // Reopen the split modal directly on the flow screen
        openSplitModal(activeTableId);
      } else if (action === 'cancel-split') {
        const id = activeTableId;
        const sp = tableSplits.get(id);
        const paidCount = sp ? sp.paidCount : 0;
        const confirmMsg = paidCount > 0
          ? employeePick(
              `Annuler le split? ${paidCount} part${paidCount > 1 ? 's' : ''} déjà réglée${paidCount > 1 ? 's' : ''} ne ${paidCount > 1 ? 'seront' : 'sera'} pas remboursée${paidCount > 1 ? 's' : ''}.`,
              `Cancel the split? ${paidCount} share${paidCount > 1 ? 's' : ''} already paid will not be refunded.`,
              `إلغاء التقسيم؟ ${paidCount > 1 ? paidCount + ' حصص مدفوعة لن تُسترد' : 'حصة واحدة مدفوعة لن تُسترد'}.`)
          : employeePick('Annuler le split en cours?', 'Cancel the split in progress?', 'إلغاء التقسيم الجاري؟');
        if (!confirm(confirmMsg)) return;
        tableSplits.delete(id);
        // Restore table to bgha-ykhlass so the cashier can encaisser normally
        if (tables[id]) tables[id].status = 'bgha-ykhlass';
        renderTableDetail();
        if (currentTab === 'tables') renderTables();
        toast('Split annulé');
      } else if (action === 'transfer-table') {
        openTransferTableModal(activeTableId);
      } else if (action === 'merge-table') {
        openMergeTableModal(activeTableId);
      }
    });

    /* ── LA COMMANDE EN ATTENTE DE CETTE TABLE ────────────────────────────
     * `serviceCanonicalOrders` porte déjà tout ce qui vit sur le plancher,
     * statut compris. On ne garde que ce qui attend vraiment une décision. */


    /* ── ACCEPTER DEPUIS LA SALLE ─────────────────────────────────────────
     * Le serveur engage la cuisine et signe de son nom : `server` voyage avec
     * la transition, exactement comme quand le comptoir accepte. En cas
     * d'échec, la commande RESTE en attente et le bouton revient — jamais de
     * confirmation écrite d'un envoi qui n'a pas eu lieu. */
    $('#td-body').addEventListener('click', (e) => {
      const accBtn = e.target.closest('[data-accept-order]');
      if (!accBtn || accBtn.disabled) return;
      const orderId = accBtn.dataset.acceptOrder;
      const slug = svMerchant();
      if (!orderId || !slug) { toast('Commande introuvable'); return; }
      accBtn.disabled = true;
      accBtn.textContent = 'Envoi…';
      fetch('/api/order/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({
          merchant: slug,
          id: orderId,
          status: 'accepted',
          server: (activeRole && (activeRole.fullName || activeRole.name)) || '',
        }),
      })
        .then((r) => r.json().catch(() => null).then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (!ok || !j || j.ok !== true) throw new Error((j && j.error) || 'refus');
          const cached = serviceCanonicalOrders.get(orderId);
          if (cached) cached.status = 'accepted';
          serviceOrderStatus.set(orderId, 'accepted');
          toast('Commande envoyée en cuisine');
          renderTableDetail();
        })
        .catch((err) => {
          accBtn.disabled = false;
          accBtn.textContent = 'Accepter · envoyer en cuisine';
          toast(String(err && err.message) === 'floor-table-required'
            ? 'Cette table n\u2019est pas dans votre coupure'
            : 'Envoi impossible · la commande reste en attente');
        });
    });

    /* ---- qty buttons in table detail ---- */
    $('#td-body').addEventListener('click', (e) => {
      const qBtn = e.target.closest('[data-qty]');
      if (!qBtn) return;
      const row = qBtn.closest('[data-order-uid]');
      if (!row) return;
      changeOrderQty(activeTableId, row.dataset.orderUid, qBtn.dataset.qty === 'inc' ? 1 : -1);
    });

    /* ---- per-dish kitchen note — persist as the serveur types (no re-render,
       so focus stays); the note then routes with that dish to its station ---- */
    $('#td-body').addEventListener('input', (e) => {
      const inp = e.target.closest('.td-item-note');
      if (!inp || !activeTableId) return;
      const line = (tableOrders[activeTableId] || []).find(l => l.uid === inp.dataset.noteUid);
      if (line) {
        line.note = inp.value;
        inp.classList.toggle('has-note', !!inp.value.trim());
        markDirty(activeTableId);
      }
    });

    $('#td-body').addEventListener('change', async (e) => {
      const inp = e.target.closest('.td-item-note');
      if (!inp || !activeTableId) return;
      const line = (tableOrders[activeTableId] || []).find(l => l.uid === inp.dataset.noteUid);
      if (line && line.sentQty > 0 && !SV_DEMO) {
        try {
          const res = await fetch('/api/order/queue', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merchant: svSlug(),
              editLine: {
                table: activeTableId,
                lineId: line.uid || line.id,
                note: inp.value,
                actor: activeRole.fullName || activeRole.name || 'Serveur'
              }
            })
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || (data && !data.ok)) {
            if (data && data.reason === 'accepted') {
              toast('Plat déjà en cuisine · parlez au chef ou annulez');
            } else {
              toast(`Note : ${(data && data.error) || 'erreur de modification'}`);
            }
          }
        } catch (_) {}
      }
    });

    let voidLineTarget = null;

    let selectedVoidReason = 'client_change';
    let selectedVoidIsWaste = 0;

    /* Le parent facturé et les composants gratuits sont atomiques. Le lien
       formulaUid évite de toucher une boisson identique ajoutée hors formule. */






    $('#void-reasons-chips') && $('#void-reasons-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('.void-reason-chip');
      if (!chip) return;
      selectedVoidReason = chip.dataset.voidReason;
      selectedVoidIsWaste = Number(chip.dataset.isWaste) || 0;
      document.querySelectorAll('#void-reasons-chips .void-reason-chip').forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
    });

    document.getElementById('void-reason-modal').addEventListener('click', (e) => {
      if (e.target.closest('#void-confirm')) { confirmVoidLine(); return; }
      if (e.target.closest('#void-cancel') || e.target === $('#void-reason-modal')) {
        if ($('#void-confirm')?.disabled) { toast('Annulation en cours · attendez la réponse du serveur'); return; }
        $('#void-reason-modal').classList.remove('is-open');
        voidLineTarget = null;
        return;
      }
    });



    /* ---------- New Table modal ---------- */
    let newTableId = null;
    let newTableCovers = 2;




    $('#new-table-modal').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-nt-covers]');
      if (chip) { newTableCovers = parseInt(chip.dataset.ntCovers); renderNewTableChips(); return; }
      if (e.target.closest('#nt-confirm')) { confirmNewTable(); return; }
      if (e.target.closest('#nt-cancel') || e.target === $('#new-table-modal'))
        { $('#new-table-modal').classList.remove('is-open'); return; }
    });

    /* ---------- Transfer Table modal ---------- */
    let trfFromId = null;
    let trfSelectedToId = null;









    $('#transfer-table-modal').addEventListener('click', (e) => {
      const card = e.target.closest('[data-trf-to]');
      if (card) {
        trfSelectedToId = card.dataset.trfTo;
        renderTransferTableGrid();
        const btnText = $('#trf-btn-text');
        if (btnText) btnText.textContent = `Déplacer vers ${trfSelectedToId}`;
        const confirmBtn = $('#trf-confirm');
        if (confirmBtn) confirmBtn.disabled = false;
        return;
      }
      if (e.target.closest('#trf-confirm')) { confirmTransferTable(); return; }
      if (e.target.closest('#trf-cancel') || e.target === $('#transfer-table-modal')) {
        $('#transfer-table-modal').classList.remove('is-open');
        return;
      }
    });

    /* ---------- Merge Table modal ---------- */
    let mrgSourceId = null;
    let mrgSelectedTargetId = null;







    $('#merge-table-modal').addEventListener('click', (e) => {
      const card = e.target.closest('[data-mrg-target]');
      if (card) {
        mrgSelectedTargetId = card.dataset.mrgTarget;
        renderMergeTableGrid();
        const btnText = $('#mrg-btn-text');
        if (btnText) btnText.textContent = `Fusionner avec ${mrgSelectedTargetId}`;
        const confirmBtn = $('#mrg-confirm');
        if (confirmBtn) confirmBtn.disabled = false;
        return;
      }
      if (e.target.closest('#mrg-confirm')) { confirmMergeTable(); return; }
      if (e.target.closest('#mrg-cancel') || e.target === $('#merge-table-modal')) {
        $('#merge-table-modal').classList.remove('is-open');
        return;
      }
    });

    /* ---------- Menu tab ---------- */


    /* ── Une carte vide n'est pas une carte pas encore arrivée ─────────────
       « Carte pas encore composée » s'affichait AVANT la première réponse,
       et aussi quand le serveur était injoignable : le serveur lisait qu'il
       n'y avait rien à vendre. Trois états désormais : en chargement,
       injoignable, et réellement vide (le serveur a répondu sans plat). */








    /* « Souvent avec… » : l'article que les tickets de ce commerce associent
       le plus souvent au dernier plat pris pour cette table (calcul serveur
       sur 28 jours, functions/api/pairs.js). Jamais un article déjà pris pour
       la table, jamais un article qu'on ne peut pas vendre seul en ce moment.
       Le « + » passe par le même chemin qu'un toucher sur la carte du plat. */





    /* ---------- Options sheet — forced before a dish with groups joins the order ---------- */
    let optDraft = null;  // { itemId, sel: { groupId: value | Set | bool } }









    /* Push a configured line (stacking identical configs that have no manual note). */


    $('#opt-modal').addEventListener('click', (e) => {
      if (e.target === $('#opt-modal') || e.target.closest('#opt-cancel')) { closeOptionsSheet(); return; }
      if (e.target.closest('#opt-confirm')) { confirmOptions(); return; }
      const pill = e.target.closest('.opt-pill');
      if (!pill || !optDraft) return;
      const g = pill.dataset.optGroup, val = pill.dataset.optVal, def = optionGroups[g];
      if (def.kind === 'multi') { const s = optDraft.sel[g]; s.has(val) ? s.delete(val) : s.add(val); }
      else if (def.kind === 'toggle') optDraft.sel[g] = !optDraft.sel[g];
      else optDraft.sel[g] = (optDraft.sel[g] === val ? null : val);
      renderOptionsSheet(false);
    });

    /* ---------- Formule / Menus Composés Sheet ---------- */
    let fmlDraft = null;







    /* ── LE CAFÉ INCLUS A AUSSI SA QUESTION ─────────────────────────────
       Browse, 2026-10-05 : l'Espresso d'une formule brunch porte, vendu seul,
       un choix obligatoire « Hot or Ice ». La feuille de formule ne le posait
       pas, donc le bar recevait « Espresso » sans savoir s'il était glacé (et
       le serveur refusait la commande avant 5fb4d383). La question est posée
       ici, sous le choix, pour chaque article inclus qui porte un choix unique
       obligatoire. Pas de prix affiché : un article inclus ne facture pas ses
       options (functions/api/order/_lib.js · formula-part à 0). */

















    $('#formula-modal').addEventListener('click', (e) => {
      if (e.target === $('#formula-modal') || e.target.closest('#fml-cancel')) {
        closeFormulaSheet();
        return;
      }
      if (e.target.closest('#fml-confirm')) {
        confirmFormula();
        return;
      }
      const childPill = e.target.closest('[data-fml-child-group]');
      if (childPill && fmlDraft) {
        const [sid, itemId] = String(childPill.dataset.fmlChild || '').split('|');
        const chosen = fmlChildSel(fmlDraft.activeUnit, sid, itemId);
        const g = childPill.dataset.fmlChildGroup, val = childPill.dataset.fmlChildVal;
        chosen[g] = chosen[g] === val ? undefined : val;
        renderFormulaSheet(false); return;
      }
      const optPill = e.target.closest('[data-fml-opt-group]');
      if (optPill && fmlDraft) {
        const g=optPill.dataset.fmlOptGroup, val=optPill.dataset.fmlOptVal, def=optionGroups[g];
        if(def.kind==='multi'){const s=fmlDraft.optSel[g];s.has(val)?s.delete(val):s.add(val);}
        else if(def.kind==='toggle') fmlDraft.optSel[g]=!fmlDraft.optSel[g];
        else fmlDraft.optSel[g]=fmlDraft.optSel[g]===val?null:val;
        renderFormulaSheet(false); return;
      }
      const unitBtn = e.target.closest('[data-fml-unit]');
      if (unitBtn && fmlDraft) {
        fmlDraft.activeUnit = Number(unitBtn.dataset.fmlUnit);
        renderFormulaSheet(false);
        return;
      }
      const sameBtn = e.target.closest('[data-fml-same]');
      if (sameBtn && fmlDraft) {
        const u0 = fmlDraft.units[0];
        for (let i = 1; i < fmlDraft.totalUnits; i++) {
          fmlDraft.units[i] = {};
          Object.keys(u0).forEach(k => {
            fmlDraft.units[i][k] = new Set(u0[k]);
          });
          fmlDraft.childSel[i] = JSON.parse(JSON.stringify(fmlDraft.childSel[0] || {}));
        }
        renderFormulaSheet(false);
        toast('Choix dupliqués pour toutes les portions');
        return;
      }
      const expandBtn = e.target.closest('[data-fml-expand]');
      if (expandBtn && fmlDraft) {
        const sid = expandBtn.dataset.fmlExpand;
        fmlDraft.collapsedSlots[sid] = false;
        fmlDraft.activeSlotId = sid;
        renderFormulaSheet(false);
        return;
      }
      const chip = e.target.closest('.fml-chip');
      if (chip && fmlDraft) {
        if (chip.classList.contains('disabled')) return;
        const sid = chip.dataset.fmlSlot;
        const itemId = chip.dataset.fmlItem;
        const item = menuItems.find(m => m.id === fmlDraft.itemId);
        if (!item || !item.formula) return;
        const slot = item.formula.slots.find(s => s.id === sid);
        if (!slot) return;

        const curUnitSlots = fmlDraft.units[fmlDraft.activeUnit];
        if (!curUnitSlots[sid]) curUnitSlots[sid] = new Set();
        const sel = curUnitSlots[sid];
        const max = slot.max != null ? slot.max : 1;

        if (max === 1) {
          if (sel.has(itemId)) {
            if ((slot.min != null ? slot.min : 1) === 0) sel.delete(itemId);
          } else {
            sel.clear();
            sel.add(itemId);
          }
        } else {
          if (sel.has(itemId)) {
            sel.delete(itemId);
          } else {
            if (sel.size < max) sel.add(itemId);
          }
        }

        const satisfied = isFmlSlotSatisfied(slot, sel);
        if (satisfied) {
          const nextIncomplete = item.formula.slots.find(s => !isFmlSlotSatisfied(s, curUnitSlots[s.id]));
          if (nextIncomplete) {
            fmlDraft.activeSlotId = nextIncomplete.id;
          }
        }

        renderFormulaSheet(false);
      }
    });

    /* Menu-card +/- — + adds a unit, - removes from the plain line (else the last). */


    $('#menu-grid').addEventListener('click', (e) => {
      const step = e.target.closest('.step-btn');
      if (step) {
        if (!menuContextId) { toast('Sélectionnez une table d\'abord'); return; }
        const card = step.closest('.menu-item');
        changeMenuQty(menuContextId, card.dataset.menuId, step.dataset.step === 'inc' ? 1 : -1);
        return;
      }
      const card = e.target.closest('.menu-item');
      if (card) {
        if (!menuContextId) { toast('Sélectionnez une table d\'abord'); return; }
        const id = card.dataset.menuId;
        if (itemHasFormula(id)) openFormulaSheet(id);
        else if (itemHasOptions(id)) openOptionsSheet(id);
        else addToTableOrder(menuContextId, id);
        return;
      }
    });

    $('#cat-pills').addEventListener('click', (e) => {
      const c = e.target.closest('[data-cat]');
      if (!c) return;
      activeCat = c.dataset.cat;
      activeSub = null;
      renderCatPills();
      renderMenu();
    });

    document.addEventListener('click', (e) => {
      if (e.target.closest('#menu-context-close')) {
        menuContextId = null;
        renderMenuContext();
        renderMenu();
        renderCartBar();
      }
    });

    $('#menu-pair-chip').addEventListener('click', (e) => {
      if (!menuContextId) return;
      const add = e.target.closest('[data-pair-add]');
      if (add) {
        const id = add.dataset.pairAdd;
        if (itemHasFormula(id)) openFormulaSheet(id);
        else if (itemHasOptions(id)) openOptionsSheet(id);
        else addToTableOrder(menuContextId, id);
        return;
      }
      const no = e.target.closest('[data-pair-dismiss]');
      if (no) {
        try { KiwiPairs.dismiss('table:' + menuContextId, no.dataset.pairDismiss); } catch (_) {}
        renderCartBar();
      }
    });

    // Tap the cart bar → go back to table detail
    $('#menu-cart-bar').addEventListener('click', () => {
      if (!menuContextId) return;
      activeTableId = menuContextId;
      showScreen('screen-table');
      renderTableDetail();
      lucide.createIcons();
    });

    /* ---------- Notifications tab · iOS Relative Time & Card Layout ---------- */
    function notificationRelativeTime(ts) {
      const now = Date.now();
      const time = Number(ts) || now;
      const d = new Date(time);
      const diffSec = Math.max(0, Math.floor((now - time) / 1000));
      const diffMin = Math.floor(diffSec / 60);
      const lang = (window.employeeLang && employeeLang()) || 'fr';

      if (diffMin <= 59) {
        if (lang === 'ar') {
          if (diffMin < 1) return 'الآن';
          return `منذ ${diffMin} د`;
        }
        if (lang === 'en') {
          if (diffMin < 1) return 'now';
          return `${diffMin}m ago`;
        }
        // Default French
        if (diffMin < 1) return "À l'instant";
        return `Il y a ${diffMin} min`;
      }

      // More than 59 min ago: show exact time (e.g. 14:32)
      return d.toLocaleTimeString(employeeLocale(), { timeZone: (globalThis.KiwiZoneLaw?.effectiveZone((employeeStoreZone || Intl.DateTimeFormat().resolvedOptions().timeZone), d) || (employeeStoreZone || Intl.DateTimeFormat().resolvedOptions().timeZone)), hour: '2-digit', minute: '2-digit' });
    }

    function notificationOrigin(type) {
      const lang = (window.employeeLang && employeeLang()) || 'fr';
      const origins = {
        ready: { fr: 'Cuisine', en: 'Kitchen', ar: 'المطبخ' },
        orderpro: { fr: 'OrderPro', en: 'OrderPro', ar: 'أوردر برو' },
        'bgha-ykhlass': { fr: 'Addition', en: 'Bill', ar: 'الحساب' },
        khlass: { fr: 'Paiement', en: 'Payment', ar: 'الدفع' },
        khawya: { fr: 'Salle', en: 'Floor', ar: 'القاعة' },
        'team-message': { fr: 'Équipe', en: 'Team', ar: 'الفريق' },
      };
      const found = origins[type];
      return (found && (found[lang] || found.fr)) || 'Kiwi POS';
    }

    function notificationIcon(type) {
      if (type === 'team-message') return 'message-square';
      if (type === 'orderpro') return 'smartphone';
      if (type === 'ready') return 'chef-hat';
      if (type === 'khlass') return 'circle-check';
      if (type === 'bgha-ykhlass') return 'receipt-text';
      if (type === 'khawya') return 'door-open';
      return 'bell';
    }

    function renderNotifications() {
      const list = $('#notification-list');
      if (!list) return;
      /* Les 100 dernières d'abord, puis l'archive de cet appareil (voir
         saveServiceHistory), 50 de plus à chaque « Voir plus ». Le compte
         affiché repart de zéro quand l'employé ou le marchand change. */
      let archived = [];
      try {
        const saved = serviceHistoryKey ? JSON.parse(localStorage.getItem(serviceHistoryKey + ':archive') || '[]') : [];
        archived = (Array.isArray(saved) ? saved : []).filter((item) => item && item.id);
      } catch (_) {}
      if (list.dataset.archiveFor !== serviceHistoryKey) {
        list.dataset.archiveFor = serviceHistoryKey;
        list.dataset.archiveShown = '0';
      }
      const archiveShown = Math.min(archived.length, Number(list.dataset.archiveShown) || 0);
      const notices = serviceNotifications.concat(archived.slice(0, archiveShown));
      if (!notices.length) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon"><i data-lucide="bell"></i></div>
            <h3>Aucune notification</h3>
            <p>Tables installées, commandes OrderPro, plats prêts et additions apparaîtront ici.</p>
          </div>`;
      } else {
        list.innerHTML = notices.map((item) => `
          <button class="notification-card${item.unread ? ' is-unread' : ''}" type="button" data-notification-table="${esc(item.table)}">
            <div class="notif-header">
              <div class="notif-origin">
                <span class="notif-app-icon"><i data-lucide="${notificationIcon(item.type)}"></i></span>
                <span class="notif-app-name">${esc(notificationOrigin(item.type))}</span>
              </div>
              <div class="notif-time-badge">
                <span class="notif-time">${notificationRelativeTime(item.ts)}</span>
                ${item.unread ? '<span class="notif-unread-dot" aria-label="Non lue"></span>' : ''}
              </div>
            </div>
            <div class="notif-content">
              <div class="notification-title">${esc(item.title)}</div>
              <div class="notification-body">${esc(item.body)}</div>
            </div>
          </button>`).join('')
          + (archived.length > archiveShown
            ? `<button class="notification-more" type="button" data-notification-more>${employeePick('Voir plus', 'Show more', 'عرض المزيد')} · ${archived.length - archiveShown} ${employeePick('plus anciennes', 'older', 'أقدم')}</button>`
            : '');
        list.querySelectorAll('[data-notification-table]').forEach((button) => {
          button.addEventListener('click', () => {
            const id = serviceTableId(button.dataset.notificationTable);
            setTab('tables');
            if (id && tables[id]) { openTableDetail(id); }
          });
        });
        const more = list.querySelector('[data-notification-more]');
        if (more) more.addEventListener('click', () => {
          list.dataset.archiveShown = String(archiveShown + 50);
          renderNotifications();
        });
      }
      if (window.lucide) lucide.createIcons();
    }

    /* Temps travaillé du service en cours, PAUSES DÉDUITES. Les tuiles et le
       bandeau comptaient « maintenant moins l'arrivée » : une heure de pause
       restait comptée, puis la fiche d'heures enregistrée au départ (déduite,
       elle, côté serveur) était plus courte que ce que l'employé avait vu
       s'afficher toute la soirée. Même règle que /api/employee clock-out. */
    function shiftElapsedMs() {
      if (!shiftStart) return 0;
      const now = Date.now();
      let ms = now - shiftStart.getTime();
      const open = !SV_DEMO && liveEmployeeState && liveEmployeeState.attendance && liveEmployeeState.attendance.open;
      if (open) {
        (Array.isArray(open.breaks) ? open.breaks : []).forEach((b) => {
          const a = Number(b && b.inTs) || 0, z = Number(b && b.outTs) || 0;
          if (a && z > a) ms -= (z - a);
        });
        if (open.pauseTs) ms -= Math.max(0, now - Number(open.pauseTs));
      }
      return Math.max(0, ms);
    }

    /* ---------- Profil tab ---------- */
    function renderProfil() {
      if (!shiftStart) return;
      renderPauseControl();
      $('#profil-shift-start').textContent = shiftStart.toLocaleTimeString(employeeLocale(), { timeZone: (globalThis.KiwiZoneLaw?.effectiveZone((employeeStoreZone || Intl.DateTimeFormat().resolvedOptions().timeZone), shiftStart) || (employeeStoreZone || Intl.DateTimeFormat().resolvedOptions().timeZone)), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

      const totalMin = Math.floor(shiftElapsedMs() / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      $('#profil-shift-duration').textContent = `${h}h ${String(m).padStart(2,'0')}`;

      // Tables stats — only meaningful for the serveur.
      if (!activeRole.restricted) {
        const all = Object.values(tables);
        const active = all.filter(t => t.status === 'ka-yaklo' || t.status === 'bgha-ykhlass' || t.status === 'ka-tkhdam').length;
        const paid = all.filter(t => t.status === 'khlass').length + tablesPaid;
        $('#profil-tables-active').textContent = `${active} / ${all.length}`;
        $('#profil-tables-paid').textContent = paid;
      }
      renderHours();
    }

    function isEmployeePaused() {
      const open = liveEmployeeState && liveEmployeeState.attendance && liveEmployeeState.attendance.open;
      return !!((open && open.pauseTs) || (servers[currentUser] && servers[currentUser].status === 'on-pause'));
    }
    function renderPauseControl() {
      const btn = $('#profil-pause');
      if (!btn) return;
      const paused = isEmployeePaused();
      btn.classList.toggle('is-paused', paused);
      const label = btn.querySelector('span');
      if (label) label.textContent = paused ? 'En pause · gérée depuis la caisse' : 'Pause gérée depuis la caisse';
      const icon = btn.querySelector('i');
      if (icon) icon.setAttribute('data-lucide', 'coffee');
    }

    /* ===========================================================
       SCHEDULE + HOURS — profil tab (Mon..Sun)
       -----------------------------------------------------------
       Per-role weekly schedule and rolling hours-worked. Yassir sees
       his evening service shifts; Mounir sees day shifts. The today
       cell highlights live and the hours-today tile reflects the
       current shift's elapsed time.
       =========================================================== */
    const SCHEDULE_DATA = {
      yassir: {
        // Mon → Sun
        week: [
          { in: '17:00', out: '23:00' },
          { in: '17:00', out: '23:00' },
          null,
          { in: '17:00', out: '23:00' },
          { in: '11:00', out: '23:00' },
          { in: '11:00', out: '23:00' },
          { in: '11:00', out: '19:00' },
        ],
        monthHours: '142h 30',
      },
      mounir: {
        week: [
          { in: '08:00', out: '16:00' },
          { in: '08:00', out: '16:00' },
          { in: '08:00', out: '16:00' },
          null,
          { in: '08:00', out: '16:00' },
          { in: '08:00', out: '16:00' },
          null,
        ],
        monthHours: '156h 00',
      },
    };

    function shiftHHMM(s) {
      if (!s) return null;
      const [h1, m1] = s.in.split(':').map(Number);
      const [h2, m2] = s.out.split(':').map(Number);
      const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
      return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}`;
    }
    function shiftMinutes(s) {
      if (!s) return 0;
      const [h1, m1] = s.in.split(':').map(Number);
      const [h2, m2] = s.out.split(':').map(Number);
      const a = h1 * 60 + m1, b = h2 * 60 + m2;
      return b > a ? b - a : b === a ? 0 : (1440 - a) + b;
    }

    function renderSchedule() {
      const sched = SCHEDULE_DATA[activeRole.id];
      const week  = $('#kg-week');
      if (!sched || !week) return;
      // Mon=0 … Sun=6 (we display the week starting Monday).
      const today    = employeeCivilDate();
      const todayIdx = (today.getDay() + 6) % 7;
      const monday   = new Date(today);
      monday.setDate(today.getDate() - todayIdx);
      const short = employeeLanguage === 'en'
        ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        : employeeLanguage === 'ar'
          ? ['إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت', 'أحد']
          : ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

      week.innerHTML = sched.week.map((s, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const isToday = i === todayIdx;
        const isRest  = !s;
        return `<div class="kg-day${isToday ? ' is-today' : ''}${isRest ? ' is-rest' : ''}">
          <div class="kg-day-name">${short[i]}</div>
          <div class="kg-day-num">${d.getDate()}</div>
          <div class="kg-day-hours">${isRest ? 'Repos' : shiftHHMM(s)}</div>
        </div>`;
      }).join('');

      if (!svReal()) {
        const schedule = {};
        for (let i = 0; i < 14; i++) {
          const d = new Date(today); d.setDate(today.getDate() + i);
          const shift = sched.week[(d.getDay() + 6) % 7];
          if (shift) schedule[d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')] = { start:shift.in, end:shift.out };
        }
        window.KiwiTeamDemoSchedule = () => svReal() ? null : schedule;
        document.dispatchEvent(new CustomEvent('kiwi-demo-schedule', {detail:{schedule}}));
      }
      // "Prochain service": today's shift while it has not ended, else the
      // next working day. It skipped today, so at 01:00 the card said
      // Thursday while the list below still showed tonight's shift.
      // Il ne regardait QUE la semaine affichée et l'horloge de l'appareil :
      // un planning publié la semaine suivante donnait « aucun service », et
      // un téléphone réglé sur un autre fuseau décidait seul si le service du
      // soir était fini. On lit maintenant le planning daté du serveur sur 14
      // jours, avec l'heure du commerce.
      const nowMin = (() => {
        try {
          const parts = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-GB', { timeZone: employeeStoreZone || undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
          const get = (type) => Number((parts.find((x) => x.type === type) || {}).value) || 0;
          return get('hour') * 60 + get('minute');
        } catch (_) { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
      })();
      const shiftAtOffset = (offset) => {
        if (svReal()) {
          const d = new Date(today); d.setDate(today.getDate() + offset);
          const raw = sched.dates && sched.dates[employeeCivilKey(d)];
          return raw && !raw.off && raw.start && raw.end ? { in: raw.start, out: raw.end } : null;
        }
        return sched.week[(todayIdx + offset) % 7];
      };
      let nextOffset = -1, s = null;
      for (let off = 0; off < 14 && nextOffset === -1; off++) {
        const candidate = shiftAtOffset(off);
        if (!candidate) continue;
        if (off === 0) {
          const [oh, om] = candidate.out.split(':').map(Number), [ih, im] = candidate.in.split(':').map(Number);
          const endMin = (oh * 60 + om) <= (ih * 60 + im) ? oh * 60 + om + 1440 : oh * 60 + om;
          if (nowMin >= endMin) continue;
        }
        nextOffset = off; s = candidate;
      }
      const dayEl  = $('#kg-sched-next-day');
      const timeEl = $('#kg-sched-next-time');
      const wrapEl = $('#kg-sched-next');
      if (nextOffset >= 0 && dayEl && timeEl) {
        const dafrFull = Array.from({ length: 7 }, (_, i) => {
          const day = new Date(2026, 7, 3 + i, 12);
          return day.toLocaleDateString(employeeLocale(), { weekday: 'long' });
        });
        const nextIdx = (todayIdx + nextOffset) % 7;
        const wrap = todayIdx + nextOffset >= 7;
        const prefix = nextOffset === 0                ? (employeeLanguage === 'en' ? 'Today' : employeeLanguage === 'ar' ? 'اليوم' : "Aujourd'hui")
                     : nextOffset === 1                ? (employeeLanguage === 'en' ? 'Tomorrow' : employeeLanguage === 'ar' ? 'غداً' : 'Demain')
                     : nextOffset === 2                ? (employeeLanguage === 'en' ? 'The day after tomorrow' : employeeLanguage === 'ar' ? 'بعد غدٍ' : 'Après-demain')
                     : wrap                            ? (employeeLanguage === 'en' ? 'Next week' : employeeLanguage === 'ar' ? 'الأسبوع القادم' : 'Semaine prochaine')
                     :                                  dafrFull[nextIdx];
        dayEl.textContent = `${prefix} · ${dafrFull[nextIdx]}`;
        timeEl.textContent = `${s.in} → ${s.out}`;
        if (wrapEl) wrapEl.style.display = '';
      } else if (wrapEl) {
        wrapEl.style.display = 'none';
      }
    }

    let scheduleMonthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    function scheduleForDate(sched, date) {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const raw = sched && sched.dates && sched.dates[key];
      if (raw) return (!raw.off && raw.start && raw.end) ? { in: raw.start, out: raw.end } : null;
      if (!svReal() && sched && sched.week) {
        const today = new Date(), monday = new Date(today);
        monday.setHours(12, 0, 0, 0); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        const diff = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12) - monday) / 86400000);
        return diff >= 0 && diff < 7 ? sched.week[diff] : null;
      }
      return null;
    }
    function renderMonthSchedule() {
      const sched = SCHEDULE_DATA[activeRole.id];
      const grid = $('#kg-month-grid'), title = $('#kg-month-title');
      if (!grid || !title) return;
      const year = scheduleMonthCursor.getFullYear(), month = scheduleMonthCursor.getMonth();
      title.textContent = scheduleMonthCursor.toLocaleDateString(employeeLocale(), { month: 'long', year: 'numeric' });
      const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2026, 7, 3 + i, 12).toLocaleDateString(employeeLocale(), { weekday: 'short' }));
      const blanks = (new Date(year, month, 1).getDay() + 6) % 7;
      const days = new Date(year, month + 1, 0).getDate();
      const now = employeeCivilDate();
      let html = weekdays.map((day) => `<div class="kg-month-weekday">${day}</div>`).join('');
      for (let i = 0; i < blanks; i++) html += '<div class="kg-month-day is-blank"></div>';
      for (let day = 1; day <= days; day++) {
        const date = new Date(year, month, day, 12), shift = scheduleForDate(sched, date);
        const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
        html += `<div class="kg-month-day${isToday ? ' is-today' : ''}">
          <div class="kg-month-day-num">${day}</div>
          ${shift ? `<div class="kg-month-day-shift">${esc(shift.in)}<br>${esc(shift.out)}</div>` : '<div class="kg-month-day-rest">·</div>'}
        </div>`;
      }
      grid.innerHTML = html;
      if (window.lucide) lucide.createIcons();
    }
    function closeMonthSchedule() { $('#month-schedule-modal').classList.remove('is-open'); }
    $('#kg-month-open').addEventListener('click', () => {
      const now = employeeCivilDate(); scheduleMonthCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      renderMonthSchedule(); $('#month-schedule-modal').classList.add('is-open');
    });
    $('#kg-month-prev').addEventListener('click', () => { scheduleMonthCursor.setMonth(scheduleMonthCursor.getMonth() - 1); renderMonthSchedule(); });
    $('#kg-month-next').addEventListener('click', () => { scheduleMonthCursor.setMonth(scheduleMonthCursor.getMonth() + 1); renderMonthSchedule(); });
    $('#kg-month-close').addEventListener('click', closeMonthSchedule);
    $('#month-schedule-modal').addEventListener('click', (event) => { if (event.target === $('#month-schedule-modal')) closeMonthSchedule(); });

    let hoursHistoryCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    function formatWorkedMinutes(minutes) {
      const total = Math.max(0, Math.round(Number(minutes) || 0));
      return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}`;
    }
    function renderHoursHistory() {
      const monthEl = $('#hours-history-month'), totalEl = $('#hours-history-total'), listEl = $('#hours-history-list');
      if (!monthEl || !totalEl || !listEl) return;
      const year = hoursHistoryCursor.getFullYear(), month = hoursHistoryCursor.getMonth();
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
      const hours = (liveEmployeeState && liveEmployeeState.pointedHours) || {};
      const rows = Object.keys(hours).filter((key) => key.indexOf(prefix) === 0 && Number(hours[key]) > 0).sort();
      const totalMinutes = rows.reduce((sum, key) => sum + Math.round(Number(hours[key]) * 60), 0);
      monthEl.textContent = hoursHistoryCursor.toLocaleDateString(employeeLocale(), { month: 'long', year: 'numeric' });
      totalEl.textContent = formatWorkedMinutes(totalMinutes);
      listEl.innerHTML = rows.length ? rows.map((key) => {
        const parts = key.split('-').map(Number);
        const date = new Date(parts[0], parts[1] - 1, parts[2], 12);
        return `<div class="hours-history-day"><span>${date.toLocaleDateString(employeeLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</span><strong>${formatWorkedMinutes(Number(hours[key]) * 60)}</strong></div>`;
      }).join('') : '<div class="hours-history-empty">Aucune heure enregistrée pour ce mois.</div>';
    }
    function closeHoursHistory() { $('#hours-history-modal').classList.remove('is-open'); }
    $('#kg-hours-open').addEventListener('click', () => {
      const now = employeeCivilDate(); hoursHistoryCursor = new Date(now.getFullYear(), now.getMonth(), 1);
      renderHoursHistory(); $('#hours-history-modal').classList.add('is-open');
    });
    $('#hours-history-prev').addEventListener('click', () => { hoursHistoryCursor.setMonth(hoursHistoryCursor.getMonth() - 1); renderHoursHistory(); });
    $('#hours-history-next').addEventListener('click', () => { hoursHistoryCursor.setMonth(hoursHistoryCursor.getMonth() + 1); renderHoursHistory(); });
    $('#hours-history-close').addEventListener('click', closeHoursHistory);
    $('#hours-history-modal').addEventListener('click', (event) => { if (event.target === $('#hours-history-modal')) closeHoursHistory(); });

    $$('[data-app-reload]').forEach((button) => {
      button.addEventListener('click', () => window.location.reload());
    });

    function renderHours() {
      /* A REAL waiter has no demo schedule/history: keep today's live elapsed,
         but never sum a demo week or show the demo month total ('142h 30').
         Local demo (svReal() false, id always in SCHEDULE_DATA) is unchanged. */
      const real = svReal();
      const sched = SCHEDULE_DATA[activeRole.id];
      // Today — live elapsed since shift start.
      const todayEl = $('#kg-h-today');
      let todayMin = 0;
      if (shiftStart) {
        todayMin = Math.floor(shiftElapsedMs() / 60000);
      }
      if (todayEl) todayEl.textContent = `${Math.floor(todayMin / 60)}h ${String(todayMin % 60).padStart(2, '0')}`;

      // This week — cloud hours already completed + the active shift.
      const today    = employeeCivilDate();
      const todayIdx = (today.getDay() + 6) % 7;
      let weekMin = todayMin;
      if (real && liveEmployeeState) {
        const monday = new Date(today); monday.setHours(12, 0, 0, 0); monday.setDate(today.getDate() - todayIdx);
        const hmap = liveEmployeeState.hours || {};
        for (let i = 0; i < 7; i++) {
          const d = new Date(monday); d.setDate(monday.getDate() + i);
          weekMin += Math.round((Number(hmap[employeeCivilKey(d)]) || 0) * 60);
        }
      } else if (sched) { for (let i = 0; i < todayIdx; i++) weekMin += shiftMinutes(sched.week[i]); }
      const weekEl = $('#kg-h-week');
      if (weekEl) weekEl.textContent = `${Math.floor(weekMin / 60)}h ${String(weekMin % 60).padStart(2, '0')}`;

      // This month — sum the store's real closed shifts.
      const monthEl = $('#kg-h-month');
      if (monthEl) {
        if (!real) monthEl.textContent = sched ? sched.monthHours : '·';
        else {
          const prefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-`;
          const mins = Object.keys((liveEmployeeState && liveEmployeeState.hours) || {})
            .filter((k) => k.indexOf(prefix) === 0)
            .reduce((sum, k) => sum + Math.round((Number(liveEmployeeState.hours[k]) || 0) * 60), todayMin);
          monthEl.textContent = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}`;
        }
      }
    }

    /* Update topbar shift meta every minute */
    function updateShiftMeta() {
      if (!shiftStart) return;
      const totalMin = Math.floor(shiftElapsedMs() / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      $('#tb-shift-meta').textContent = `${employeeTranslation('En service')} · ${h}h ${String(m).padStart(2,'0')}`;
      if (currentTab === 'profil') renderProfil();
      else                          renderHours();
    }
    setInterval(updateShiftMeta, 30000);

    /* Tick elapsed minutes for occupied tables */
    setInterval(() => {
      Object.keys(tables).forEach(id => {
        const t = tables[id];
        if (t.status === 'ka-yaklo' || t.status === 'bgha-ykhlass' || t.status === 'ka-tkhdam') {
          t.elapsed = t.openedTs
            ? Math.max(0, Math.floor((Date.now() - t.openedTs) / 60000))
            : t.elapsed + 1;
        }
      });
      if (currentTab === 'tables') svWhenIdle('tables', () => { if (currentTab === 'tables') renderTables(); });
      svWhenIdle('detail', () => {
        if (activeTableId && $('#screen-table').classList.contains('is-active')) renderTableDetail();
      });
    }, 60000);

    /* ---------- Payment Choice modal ---------- */
    let payTableId = null;
    const tableClients = new Map();
    /* One id per physical BILL, never per physical table. Reusing `ref: 3` as
       the sale id meant every later settlement of table 3 looked like a retry
       of the first one and INSERT OR IGNORE silently dropped it. The id remains
       stable while a payment is being retried, then a newly opened bill gets a
       new id. */
    const employeePaymentRefs = new Map();
    let servicePaymentTally = () => {};
    /* ── L'IDENTIFIANT DE PAIEMENT DOIT SURVIVRE À UN RECHARGEMENT ───────────
     * C'est la clé d'idempotence de /api/sale : le même identifiant rejoué ne
     * crée pas de deuxième vente (INSERT OR IGNORE). Il ne vivait qu'en
     * mémoire, donc il ne survivait pas à un F5, à un onglet que iOS recycle en
     * arrière-plan, ni à une déconnexion.
     *
     * Le scénario coûteux : le règlement échoue APRÈS que la vente est
     * enregistrée, le serveur recharge l'application — le geste naturel devant
     * une erreur — et repaie la table. Identifiant neuf, donc deuxième vente :
     * la recette du soir compte le couvert deux fois. Le serveur ne peut pas le
     * voir, et le patron le découvre au rapport Z.
     *
     * On l'écrit donc à côté de la table qu'il solde. Il est effacé au
     * paiement confirmé et à la déconnexion — jamais à l'échec, qui est
     * exactement le moment où il faut le garder. */
    const EMP_PAY_REFS_KEY = 'kiwiEmployeePaymentRefs';


    /* Une clé par établissement : un serveur qui change de boutique ne doit pas
       rejouer l'identifiant d'une table portant le même numéro ailleurs. */



    /* Le serveur a encaissé ce qui était dû au moment du paiement, mais une
       commande est arrivée entre-temps (un dessert entre deux parts d'un
       partage, une vente en file d'attente) : il solde les commandes payées et
       garde la table ouverte pour le reste. On ne libère donc rien : la table
       repasse en « addition demandée » avec le seul reste, et le prochain
       encaissement prend un identifiant neuf (rejouer l'ancien serait
       dédupliqué comme la même vente). */


    let serviceClientRows = [];





    serveurPaymentEvents1();
    serveurPaymentEvents2();
    serveurPaymentEvents3();

    /* ---------- CARD modal ---------- */
    let splitPayCallback = null;
    let cardSuccessTimer = null;
    let cardFootTimer = null;
    const cardModal = $('#card-modal');
    const reader = {
      disc: $('#reader-disc'),
      status: $('#reader-status'),
      method: $('#reader-method'),
      txn: $('#reader-txn'),
      actions: $('#card-actions'),
      foot: $('#card-foot'),
    };

    /* ── LE LECTEUR CARTE N'EXISTE PAS SUR LE TÉLÉPHONE ─────────────────────
       Deux secondes après l'ouverture, la feuille affichait « Carte approuvée »
       et un numéro « TXN #KW-28xxx » tiré au hasard, puis le serveur enregistrait
       un paiement carte que personne n'avait vu passer. Pire : toucher le fond
       de la feuille PENDANT l'attente soldait la table. En session réelle, le
       serveur encaisse sur le terminal du commerce et CONFIRME lui-même ; rien
       n'est inventé, rien ne se solde sans ce geste. La démo garde sa mise en
       scène. */
    let cardApproved = false;
    const cardConfirmBtn = $('#card-confirm');

    serveurPaymentEvents4();






    serveurPaymentEvents5();

    /* ---------- CASH modal ---------- */
    let cashAmountOverride = null;
    const cashModal = $('#cash-modal');
    const cashInput = $('#cash-received');
    const cashRendu = $('#cash-rendu');
    const cashRenduVal = $('#cash-rendu-val');
    const cashConfirm = $('#cash-confirm');
    const cashStepInput = $('#cash-step-input');
    const cashStepSuccess = $('#cash-step-success');
    const cashSuccessRendu = $('#cash-success-rendu');






    serveurPaymentEvents6();
    serveurPaymentEvents7();
    /* « Confirmer » ENREGISTRE la vente ; « Fermer » ne fait que fermer.
       Avant, l'écran disait « Espèces confirmées » dès « Confirmer », et la
       vente ne partait qu'au « Fermer » suivant : une app fermée, un
       téléphone verrouillé ou un appel entre les deux, et l'argent encaissé
       n'existait nulle part. Le succès ne s'affiche qu'une fois le serveur
       d'accord ; un refus laisse la feuille ouverte, montant intact. */
    let cashSettled = false;
    let cashPay = null;                      // paiement d'une part (addition partagée)
    serveurPaymentEvents8();
    serveurPaymentEvents9();

    /* ---------- Mark paid ---------- */
    const employeePaymentsInFlight = new Set();


    /* ---------- SPLIT BILL ---------- */
    /* Regroupe l'addition par plat pour le partage. Deux plats du même nom à
       des prix différents (une formule avec ou sans supplément) se fondaient
       au prix du premier : chacun payait la moyenne et les lignes mentaient.
       Un autre prix garde sa propre carte et son nom de base. */

    /* Argent en centimes entiers, comme le serveur et table-settlement.js :
       totalCents ici, amountCents / tipCents sur chaque part. Seuls les prix
       unitaires du menu (itemTotals) et les lignes de ticket restent en
       dirhams, et chaque passage de l'un à l'autre se fait à un seul endroit. */
    const splitState = {
      tableId: null,
      totalCents: 0,
      itemTotals: {},     // { itemName: { totalQty, unitPrice } }
      splitMode: 'egal',
      numParts: 2,
      tipMode: '0',
      customTipPct: 0,
      numConvives: 2,
      perConvive: {},     // { conviveNum: { itemName: qty } }
      activeConvive: 1,
      flow: null,
    };

    /* Persisted splits per table — survives modal close, table switch, etc.
       Allows the server to start a split, dismiss the modal, help other
       customers, and come back to keep encaisser. */
    const tableSplits = new Map();  // tableId → { mode, parts, paidCount, total }









    /* ---- Par article helpers ---- */





    /* ---- Par article renderers ---- */










    /* Backward-compat stubs (legacy callers no-op) */












    serveurPaymentEvents10();
    serveurPaymentEvents11();

    /* ---------- Render-all on demand ---------- */
    function renderAll() {
      renderTables();
      renderCatPills();
      renderMenu();
      renderNotifications();
      renderProfil();
    }

    /* ---------- Bootstrap ---------- */
    /* La carte d'abord depuis le miroir (instantanée, hors ligne comprise), puis
       depuis le serveur ; et au retour sur l'onglet, parce qu'un serveur repose
       sa tablette entre deux tables et que c'est là que le patron change un prix. */
    try { svRebuildCarte(); svFetchCarte(); } catch (_) {}
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { try { svFetchCarteNow(); } catch (_) {} }
    });
    document.addEventListener('kiwi-paired', () => { try { svFetchCarteNow(); } catch (_) {} });
    document.addEventListener('DOMContentLoaded', () => {
      if (window.lucide) lucide.createIcons();
    });
    window.addEventListener('load', () => {
      if (window.lucide) lucide.createIcons();
    });

    /* =========================================================
       === Gamification layer ===
       Profil cards · Carte du soir · rank chip.
       Read-only over existing state; banked to localStorage.
       Touches nothing in the PIN, tables, menu, cart or payment
       flows — it wraps markTablePaid/renderProfil as pass-throughs
       and intercepts the clock-out button upstream (capture phase).
       ========================================================= */
    serveurShiftReport();

    /* The employee portal owns its authentication. Restore an existing session;
       otherwise stay on this page and show the email + PIN form. Never bounce
       back to the owner login screen — that circular redirect was the reason a
       valid employee could not get into the app. */
    if (!SV_DEMO) {
      window.addEventListener('load', function () {
        if (!window.KiwiEmployeeLive) { $('#employee-login-error').textContent = 'Service momentanément indisponible.'; return; }
        window.KiwiEmployeeLive.refresh().then(function (data) {
          openEmployeeSession(data);
        }).catch(function () {
          showScreen('screen-pin');
          const email = $('#employee-email'); if (email) email.focus();
        });
      });
    }
