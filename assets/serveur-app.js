    /* =========================================================
       Kiwi Serveur — demo logic
       Single-file. No build, no framework.
       ========================================================= */

    /* Real venue identity for the waiter app. Serveur has no env/identity layer,
       so derive from the 6-digit pairing (kiwiPairedVenue) or, on a hosted domain,
       the pinned merchant slug. A real venue shows ITS name — never the demo
       "Café Atlas · Maarif". Local demo (unpaired localhost) is unchanged. */
    function svPaired() {
      try {
        if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedVenue === 'function') {
          var pv = window.KiwiPlatform.pairedVenue();
          if (pv) return pv;
        }
      } catch (_) {}
      try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; }
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
    function svHosted() { try { var h = (location.hostname || '').toLowerCase(); return !(h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '' || /\.local$/.test(h)); } catch (_) { return false; } }
    function svReal()   { return !!svMerchant() || svHosted(); }
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

    function serviceNorm(value) {
      let s = String(value || '').trim().toLowerCase();
      try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
      return s.replace(/\s+/g, ' ');
    }
    function serviceTableId(value) {
      const wanted = serviceNorm(value).replace(/^table\s*/, '').replace(/^t(?=\d+$)/, '');
      return Object.keys(tables).find((id) => serviceNorm(id).replace(/^t(?=\d+$)/, '') === wanted) || '';
    }
    function serviceHistoryStorageKey() {
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug() || 'store';
      return 'kiwi-service-notifications:' + merchant + ':' + (currentUser || 'employee');
    }
    function loadServiceHistory() {
      const key = serviceHistoryStorageKey();
      if (serviceHistoryKey === key) return;
      serviceHistoryKey = key;
      serviceNotifications.length = 0;
      serviceEventSeen.clear();
      try {
        const saved = JSON.parse(localStorage.getItem(key) || '[]');
        (Array.isArray(saved) ? saved : []).slice(0, 100).forEach((item) => {
          if (!item || !item.id) return;
          item.unread = false;
          serviceNotifications.push(item);
          serviceEventSeen.add(item.id);
        });
      } catch (_) {}
    }
    function saveServiceHistory() {
      if (!serviceHistoryKey) return;
      try { localStorage.setItem(serviceHistoryKey, JSON.stringify(serviceNotifications.slice(0, 100))); } catch (_) {}
    }
    async function publishServiceTableState(id, status, covers, closeSession) {
      if (svBrowseMode()) return { ok: false, error: 'browse-mode' };
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug();
      if (!merchant || SV_DEMO) return { ok: !!SV_DEMO, demo: !!SV_DEMO };
      let closeData = null;
      if (closeSession) {
        try {
          /* Close the canonical visit FIRST. Publishing "free" while its
             OrderPro session is still open lets the next queue poll reopen the
             table. The two requests used to race and the UI announced success
             without checking either one. */
          const response = await svFetchJson('/api/order/queue', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant, closeTable: id, closedBy: 'service',
              expectedSession: serviceTableSessions.get(id) || '',
              expectedRevision: serviceTableSessionRevisions.get(id) || undefined }),
          });
          closeData = response.data;
          if (!response.ok || !closeData || !closeData.ok) {
            return { ok: false, error: (closeData && closeData.error) || ('close-' + response.status) };
          }
        } catch (err) { return { ok: false, error: err && err.timeout ? 'timeout' : 'offline' }; }
      }
      try {
        const response = await svFetchJson('/api/service/events', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ merchant, state: {
            table: id, status, covers: Math.max(0, Number(covers) || 0),
            syncVersion: SERVICE_BILL_SYNC_VERSION,
            /* Plus de `lines`. Ce document dit qui est assis, pas ce qu'il a
               commandé — l'addition vient de la file. Les envoyer entretenait
               une seconde vérité vivante. */
          } }),
        });
        const data = response.data;
        return {
          ok: !!(response.ok && data && data.ok),
          error: response.ok ? (data && data.error) : ('state-' + response.status),
          unpaid: Number(closeData && closeData.unpaid) || 0,
          sessionClosed: !!closeData,
        };
      } catch (err) {
        return { ok: false, error: err && err.timeout ? 'timeout' : 'offline', sessionClosed: !!closeData,
          unpaid: Number(closeData && closeData.unpaid) || 0 };
      }
    }

    let serviceTableLocks = {};
    async function setTableLock(id, action) {
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug();
      if (!merchant || SV_DEMO || !id) return;
      try {
        await fetch('/api/service/events', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchant,
            lock: {
              table: id,
              action: action || 'acquire',
              actor: activeRole.fullName || activeRole.name || 'Serveur'
            }
          })
        });
      } catch (_) {}
    }
    function serviceNotify(title, body, meta) {
      const noticeId = (meta && meta.id) || ('notice-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
      loadServiceHistory();
      if (serviceEventSeen.has(noticeId)) return;
      serviceEventSeen.add(noticeId);
      serviceNotifications.unshift({
        id: noticeId,
        title: String(title || 'Notification'), body: String(body || ''),
        table: String(meta && meta.table || ''), type: String(meta && meta.type || 'service'),
        ts: Number(meta && meta.ts) || Date.now(), unread: currentTab !== 'notifications',
      });
      if (serviceNotifications.length > 100) serviceNotifications.length = 100;
      saveServiceHistory();
      if (currentTab !== 'notifications') serviceUnread++;
      try { renderNotifications(); } catch (_) {}
      updateNotificationBadge();
      toast(body ? `${title} · ${body}` : title, 4200);
      try {
        if (window.Notification && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
          new Notification(title, { body: body || '', tag: 'kiwi-service-' + title + '-' + body });
        }
      } catch (_) {}
    }
    async function pollServiceOrders(merchant, since) {
      const orders = [];
      let cursor = null;
      for (let page = 0; page < 100; page++) {
        if (merchant !== svSlug() || !shiftStart) return null;
        const url = '/api/order/queue?merchant=' + encodeURIComponent(merchant)
          + '&since=' + encodeURIComponent(since) + '&role=service'
          + (cursor ? '&cursor=' + encodeURIComponent(JSON.stringify(cursor)) : '');
        const response = await svFetchJson(url, {
          credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
        }, SV_POLL_TIMEOUT_MS);
        if (!response.ok) return null;
        const data = response.data;
        if (!data || !data.ok || data.ordersAvailable === false) return null;
        orders.push(...(Array.isArray(data.orders) ? data.orders : []));
        if (!data.nextCursor) return { ...data, orders };
        cursor = data.nextCursor;
      }
      return null; // never present a partial queue as a complete one
    }
    function ingestServiceOrders(data) {
      if (!data || !data.ok || data.ordersAvailable === false) return;
      serviceOrderSince = data.now || serviceOrderSince;
      serviceCanonicalReady = true;
      serviceMineTables.clear();
      servicePausedTables.clear();
      ((data.service && data.service.mineTables) || []).forEach((id) => serviceMineTables.add(serviceTableId(id) || String(id)));
      ((data.service && data.service.pausedTables) || []).forEach((id) => servicePausedTables.add(serviceTableId(id) || String(id)));
      serviceTableSessions.clear();
      serviceTableSessionRevisions.clear();
      serviceVisitCredit.clear();
      /* « En cours · N mn » vient de l'heure d'ouverture que le serveur a
         écrite (`opened_ts`), pas d'un compteur local. Le compteur repartait
         de zéro à chaque rechargement, et une table ouverte depuis une heure
         par un collègue ou par la caisse affichait « 0 mn » ; un téléphone
         verrouillé, dont setInterval est suspendu, prenait du retard. On
         oublie l'heure de toute table avant de relire les sessions vivantes :
         une table sans session retombe sur le compteur, jamais sur une heure
         périmée. */
      Object.keys(tables).forEach((k) => { delete tables[k].openedTs; });
      (data.sessions || []).forEach((session) => {
        if (!session || session.mode !== 'table') return;
        const id = serviceTableId(session.table);
        if (id && session.id) {
          serviceTableSessions.set(id, String(session.id));
          serviceTableSessionRevisions.set(id, Number(session.seen_ts) || 0);
          if (Number(session.creditCents) > 0) serviceVisitCredit.set(id, Math.round(Number(session.creditCents)));
          else serviceVisitCredit.delete(id);
          if (tables[id] && Number(session.opened_ts) > 0) {
            tables[id].openedTs = Number(session.opened_ts);
            tables[id].elapsed = Math.max(0, Math.floor((Date.now() - tables[id].openedTs) / 60000));
          }
        }
        const canonical = serviceStateVersion.get(id);
        if (id && tables[id] && tables[id].status === 'khawya' && !(canonical && canonical.status === 'khawya')) {
          tables[id].status = 'ka-yaklo';
        }
      });
      serviceReopenedBills.clear();
      serviceReopenedBillsAvailable = data.reopenedBillsAvailable !== false;
      (data.reopenedBills || []).forEach((bill) => {
        const id = serviceTableId(bill && bill.table);
        if (id && bill && String(bill.session || '') === serviceTableSessions.get(id)) {
          serviceReopenedBills.set(id, bill);
        }
      });
      (data.orders || []).forEach((order) => {
        if (!order || !order.id) return;
        const before = serviceOrderStatus.get(order.id) || '';
        serviceOrderStatus.set(order.id, order.status);
        const table = serviceTableId(order.table) || order.table || '';
        if (order.mode === 'table' && table) {
          if (order.status === 'rejected' || order.paid) serviceCanonicalOrders.delete(order.id);
          else {
            serviceCanonicalOrders.set(order.id, { ...order, table });
            if (tables[table] && !tables[table].orderNo) tables[table].orderNo = serviceOrderRef(order);
          }
        }
        const shouldNotify = !isEmployeePaused() && (serviceMineTables.has(table) || servicePausedTables.has(table));
        if (shouldNotify && order.status === 'pending' && before !== 'pending') {
          serviceNotify(`Table ${table}`, `nouvelle commande ${serviceOrderRef(order)}`.trim(), { table, type: 'orderpro', id: 'order-' + order.id + '-pending', ts: order.updated_ts });
        } else if (shouldNotify && order.status === 'ready' && before !== 'ready') {
          serviceNotify(`Table ${table}`, `commande ${serviceOrderRef(order)} prête`.trim(), { table, type: 'ready', id: 'order-' + order.id + '-ready', ts: order.updated_ts });
        }
      });
      /* Rebuild the SENT part of every bill from the canonical order queue.
         Ready/accepted notifications are status changes only; they cannot
         append items. This also removes any old fabricated snapshot that was
         already stored in service-events but has no KDS/order counterpart. */
      Object.keys(tables).forEach((table) => reconcileCanonicalServiceBill(table));
      try { renderAll(); } catch (_) {}
    }

    function reconcileCanonicalServiceBill(table) {
      if (!serviceCanonicalReady || !tables[table]) return;
      const canonical = [];
      serviceCanonicalOrders.forEach((order) => {
        if (String(order.table) !== String(table)) return;
        (order.lines || []).forEach((line, index) => canonical.push({
          uid: 'order-' + order.id + '-' + index,
          canonicalUid: line.uid || line.id || '',
          cloudKey: 'order:' + order.id + ':' + index,
          orderId: order.id,
          id: line.id || '', name: line.name || 'Article',
          price: Math.max(0, Number(line.unitPrice) || 0),
          ...(line.promo && line.promo.id ? { promo: line.promo } : {}),
          qty: Math.max(1, Number(line.qty) || 1),
          sentQty: Math.max(1, Number(line.qty) || 1),
          note: line.note || '',
          kind: line.kind || '',
          formulaUid: line.formulaUid || '',
          formulaName: line.formulaName || '',
          slotLabel: line.slotLabel || '',
          formulaSlotId: line.formulaSlotId || '',
          lineId: line.lineId || '',
          opts: Array.isArray(line.visuals) ? line.visuals.map((visual) => ({
            group: visual.group || '', label: visual.label || '',
            p: Math.max(0, Number(visual.price) || 0), emoji: visual.emoji || '',
          })) : [],
          sourceCanonical: true,
          voidPending: !!line.voidAlert,
        }));
      });
      /* Keep only THIS phone's not-yet-sent draft. A line hydrated from caisse
         is never a local draft (`sourceCaisse`), so an orphan 373 MAD snapshot
         cannot survive merely because its quantities look sent. */
      const localDraft = (tableOrders[table] || []).filter((line) =>
        line.sourceLocal === true
        && Number(line.sentQty || 0) < Number(line.qty || 0));
      tableOrders[table] = canonical.concat(localDraft);
      if (!canonical.length && !localDraft.length && tables[table].status === 'ka-yaklo') {
        /* Occupancy may still be real (clients seated), only the invented bill
           is removed. Never close the table from a missing order alone. */
        tables[table].elapsed = Math.max(0, Number(tables[table].elapsed) || 0);
      }
    }
    function ingestServiceEvents(data) {
      if (!data || !data.ok) return;
      serviceEventSince = data.now || serviceEventSince;
      window.KiwiServiceRequests?.ingest(data, {
        merchant: svSlug(), notify: toast, refresh: pollServiceSync,
        openTable: value => { const id = serviceTableId(value); if (svBrowseMode()) return; if (id && tables[id]) { setTab('tables'); openTableDetail(id); } },
      });
      if (data.locks && typeof data.locks === 'object') serviceTableLocks = data.locks;
      Object.keys(data.states || {}).forEach((key) => {
        const state = data.states[key] || {};
        const id = serviceTableId(state.table || key) || String(state.table || key);
        if (!tables[id]) return;
        /* Service states are snapshots, not permanent table history. The till
           itself expires a saved service after twelve hours; the phone must
           use the same boundary or yesterday's occupied tables reappear on a
           fresh clock-in merely because the page was reloaded. */
        if (Number(state.ts) && Number(state.ts) < Date.now() - 12 * 60 * 60 * 1000) return;
        /* Employee drafts from a PREVIOUS attendance period do not belong to a
           newly clocked-in phone. A real open bill is continuously owned and
           echoed by the caisse (`source: caisse`), so it still crosses shift
           changes; an orphan employee-only snapshot does not get resurrected
           merely because another account signs in on the same device. */
        const currentShiftStart = shiftStart instanceof Date ? shiftStart.getTime() : 0;
        if (state.source === 'employee' && currentShiftStart
          && Number(state.ts || 0) < currentShiftStart) return;
        /* Versions before v2 could publish the sample bill that booted with
           this single-file demo into a real restaurant. Those poisoned states
           are exactly the bills that reappear after refresh. Never hydrate a
           live phone from any legacy bill payload; a current caisse snapshot
           or a new employee action replaces it normally. */
        const legacyBillState = Array.isArray(state.lines)
          && Number(state.syncVersion || 0) < SERVICE_BILL_SYNC_VERSION;
        if (legacyBillState) {
          serviceStateVersion.set(id, {
            status: 'khawya', ts: Number(state.ts) || 0,
            source: 'legacy-cleanup', hasLines: true,
          });
          tables[id].status = 'khawya';
          tables[id].elapsed = 0;
          delete tables[id].orderNo;
          tableOrders[id] = [];
          return;
        }
        serviceStateVersion.set(id, {
          status: state.status, ts: Number(state.ts) || 0, source: state.source || '',
          hasLines: Array.isArray(state.lines),
        });
        tables[id].status = state.status || tables[id].status;
        if (state.covers) tables[id].covers = state.covers;
        const awaiting = serviceBillAwaiting.get(id);
        const stateTs = Number(state.ts) || 0;
        if (awaiting && (stateTs > awaiting.after || Date.now() > awaiting.until)) serviceBillAwaiting.delete(id);
        /* ── L'INSTANTANÉ NE FABRIQUE PLUS D'ADDITION ────────────────────────
         * Ce bloc reconstruisait des lignes à partir de `state.lines` tant que
         * la file n'avait pas répondu. C'était la DERNIÈRE porte par laquelle un
         * document partagé pouvait devenir une addition — et donc la dernière
         * source des factures fantômes au démarrage : une table qui s'ouvre
         * avec des articles que personne n'a commandés, parce qu'un instantané
         * ancien, écrit par un autre appareil, arrivait avant la file.
         *
         * L'addition n'a plus qu'une source : la file des commandes. Le temps
         * qu'elle réponde — une seconde ou deux — la table s'affiche occupée
         * (le statut, lui, appartient bien à cet instantané) avec une addition
         * vide. Montrer « rien, pour l'instant » est honnête ; montrer des
         * articles peut-être faux ne l'est pas, et c'est ce qu'on encaissait. */
        if (serviceCanonicalReady) reconcileCanonicalServiceBill(id);
        if (state.status === 'khawya' || state.status === 'khlass') {
          tables[id].elapsed = 0;
          delete tables[id].orderNo;
          Array.from(serviceCanonicalOrders.entries()).forEach(([orderId, order]) => {
            if (String(order.table) === String(id)) serviceCanonicalOrders.delete(orderId);
          });
          tableOrders[id] = [];
        }
      });
      (data.events || []).forEach((event) => {
        if (!event || serviceEventSeen.has(event.id)) return;
        if (event.guestRequest) { serviceEventSeen.add(event.id); return; }
        const id = serviceTableId(event.table) || event.table;
        if (event.type === 'table-seated' && tables[id]) {
          tables[id].status = 'a-commander';
          tables[id].covers = event.covers || tables[id].covers;
          tables[id].elapsed = 0;
          serviceNotify(`Table ${id}`, `${event.customer || 'Clients'} installé${event.covers ? ` · ${event.covers} pers.` : ''} · menus à apporter`, { table: id, type: event.type, id: event.id, ts: event.ts });
          return;
        }
        if (event.type === 'guest-call') {
          const asks = { water: 'Demande de l’eau', bread: 'Demande du pain', napkins: 'Demande des serviettes', 'clear-table': 'Demande de débarrasser' };
          serviceNotify(`Table ${id}`, asks[event.action] || 'Appelle un serveur', {
            table: id, type: event.type, id: event.id, ts: event.ts,
          });
          return;
        }
        if (event.type !== 'table-state') { serviceEventSeen.add(event.id); return; }
        const messages = {
          'a-commander': 'Clients installés · menus à apporter',
          'ka-yaklo': 'Table ouverte · commande en cours',
          'bgha-ykhlass': 'Addition demandée',
          'ka-tkhdam': 'Paiement en cours',
          'khlass': 'Addition réglée',
          'khawya': 'Table libérée',
        };
        if (messages[event.status]) serviceNotify(`Table ${id}`, messages[event.status], { table: id, type: event.status, id: event.id, ts: event.ts });
      });
      try { renderAll(); } catch (_) {}
    }
    function pollServiceSync() {
      if (SV_DEMO || !shiftStart || !liveEmployeeState) return;
      const merchant = liveEmployeeState.merchant || svSlug();
      if (!merchant) return;
      /* Every clocked-in role needs live attendance and manager messages. Only
         floor-service roles continue into orders, tables and KDS events. */
      const restricted = !!activeRole.restricted;
      if (window.KiwiEmployeeLive) {
        KiwiEmployeeLive.refresh().then((data) => {
          applyEmployeeLive(data);
          activeRole = resolveRole('');
          applyRoleToMain();
          svWhenIdle('all', () => { try { renderAll(); } catch (_) {} });
          /* Un rôle sans plan de salle n'a que cette lecture pour savoir s'il
             est à jour. */
          if (restricted) svSyncMark(true);
        }).catch((err) => {
          if (err && err.status === 401) { endRevokedSession(); return; }
          if (restricted) svSyncMark(false);
        });
      }
      if (restricted) return;
      /* Menu edits made by the owner on another device reach the service app
         on the same short live-sync cadence as orders and table events.
         svFetchCarte shares an in-flight read and skips a fresh one. */
      try { svFetchCarte(); } catch (_) {}
      /* ── Une erreur de synchro n'est plus avalée ───────────────────────────
         Les deux lectures (événements de salle, puis file des commandes) ont
         chacune un délai. Le tour ne compte comme une synchro réussie que si
         les DEUX ont répondu ; sinon l'en-tête le dit (svSyncMark), avec
         l'heure de la dernière mise à jour réelle. */
      svFetchJson('/api/service/events?merchant=' + encodeURIComponent(merchant) + '&since=' + serviceEventSince, {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      }, SV_POLL_TIMEOUT_MS).then((r) => (r.ok ? r.data : null)).then((events) => {
        if (merchant !== svSlug() || !shiftStart) return SV_POLL_SKIP;
        ingestServiceEvents(events);
        return pollServiceOrders(merchant, serviceOrderSince).then((orders) => ({ events, orders }));
      }).then((res) => {
        if (res === SV_POLL_SKIP) return;
        ingestServiceOrders(res.orders);
        svSyncMark(!!(res.events && res.events.ok && res.orders && res.orders.ok));
      }).catch(() => { svSyncMark(false); });
      servicePlanTick++;
      /* Team, schedule and floor assignments share this six-second live loop.
         Eighteen seconds was long enough for a newly assigned table to look
         broken during service even though the cloud write had succeeded. */
    }

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
    function svSyncMark(ok) {
      const wasFailing = svSync.failing;
      if (ok) { svSync.lastOkAt = Date.now(); svSync.failing = false; }
      else svSync.failing = true;
      svRenderSyncStatus();
      /* La ligne au-dessus du plan dépend de cet état : on la redessine quand
         il change, sans attendre (et sans repeindre sous le doigt). */
      if (wasFailing !== svSync.failing && currentTab === 'tables') {
        svWhenIdle('tables', () => { try { renderTables(); } catch (_) {} });
      }
    }
    function svSyncReset() {
      svSync.lastOkAt = 0; svSync.failing = false; svSync.resumedAt = 0;
      svRenderSyncStatus();
    }
    function svDataStale() {
      if (SV_DEMO || !shiftStart || !liveEmployeeState) return false;
      if (svKnownOffline() || svSync.failing) return true;
      if (!svSync.lastOkAt) return false;          // premier tour en cours : la ligne des tables le dit
      /* Un téléphone verrouillé ne sonde pas : on ne compte le silence qu'à
         partir du retour à l'écran. */
      const cadence = (window.KiwiLiveSocket && KiwiLiveSocket.live && KiwiLiveSocket.live()) ? SERVICE_SYNC_LIVE : SERVICE_SYNC_FAST;
      const since = Math.max(svSync.lastOkAt, svSync.resumedAt || 0);
      return Date.now() - since > cadence * 3 + SV_POLL_TIMEOUT_MS;
    }
    function svClock(ts) {
      const d = new Date(ts);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    function svRenderSyncStatus() {
      const el = document.getElementById('tb-sync');
      if (!el) return;
      const stale = svDataStale();
      document.body.classList.toggle('sv-stale', stale);
      if (!stale) {
        el.hidden = true;
        if (el.dataset.fr) { el.dataset.fr = ''; el.textContent = ''; }
        return;
      }
      /* Écrit en français ; l'observateur de langue le traduit (patron
         « Hors ligne · dernière mise à jour HH:MM » dans EMPLOYEE_PATTERNS). */
      const fr = svSync.lastOkAt
        ? `Hors ligne · dernière mise à jour ${svClock(svSync.lastOkAt)}`
        : 'Hors ligne · pas encore synchronisé';
      if (el.dataset.fr !== fr) { el.dataset.fr = fr; el.textContent = fr; }
      el.hidden = false;
    }
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
    function svFloorNoteHTML() {
      if (SV_DEMO || !shiftStart || !liveEmployeeState || serviceCanonicalReady) return '';
      if (activeRole && activeRole.restricted) return '';
      if (!Object.keys(tables).length) return '';
      return (svSync.failing || svKnownOffline())
        ? `<div class="floor-note is-down" role="status">${SV_ICON_OFFLINE}<span>${esc(employeeTranslation("Serveur injoignable · l'état des tables n'est peut-être pas à jour"))}</span></div>`
        : `<div class="floor-note" role="status">${SV_ICON_SYNC}<span>${esc(employeeTranslation('Synchronisation des tables…'))}</span></div>`;
    }
    function svFloorEmptyHTML() {
      const floorKnown = SV_DEMO || !!(liveEmployeeState && liveEmployeeState.floor);
      let icon, title, body;
      if (floorKnown) {
        icon = '<i data-lucide="layout-grid"></i>';
        title = 'Aucune table dans le plan de salle';
        body = 'Le responsable compose le plan de salle depuis le tableau de bord.';
      } else if (svSync.failing || svKnownOffline()) {
        icon = SV_ICON_OFFLINE;
        title = 'Serveur injoignable';
        body = "Les tables s'afficheront au retour du réseau.";
      } else {
        icon = SV_ICON_SYNC;
        title = 'Chargement des tables…';
        body = 'Le plan de salle arrive du serveur.';
      }
      return `<div class="tables-empty" role="status">
        <div class="tables-empty-icon">${icon}</div>
        <strong>${esc(employeeTranslation(title))}</strong>
        <p>${esc(employeeTranslation(body))}</p>
      </div>`;
    }
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
    function joinServiceSocket() {
      try {
        if (!window.KiwiLiveSocket || SV_DEMO || !liveEmployeeState) return;
        const merchant = liveEmployeeState.merchant || svSlug();
        if (merchant) KiwiLiveSocket.on(merchant, 'service', pollServiceSync);
      } catch (_) {}
    }
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
    function svDrainPendingBatches() {
      if (SV_DEMO || svBrowseMode()) return;
      const now = Date.now();
      if (now - svDrainAt < 4000) return;
      svDrainAt = now;
      const prefix = 'kiwi:service-pending-v1:';
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug() || 'store';
      const operator = (liveEmployeeState && (liveEmployeeState.staffId || liveEmployeeState.employeeId)) || currentUser || 'employee';
      const mine = prefix + merchant + ':' + operator + ':';
      const ids = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.indexOf(mine) === 0) ids.push(key.slice(mine.length));
        }
      } catch (_) { return; }
      ids.forEach((id) => {
        const pending = svReadPending(id);
        if (!pending) return;
        /* Un lot très ancien n'est plus une commande en cours : le rejouer
           enverrait en cuisine des plats d'un service terminé. On le laisse
           visible plutôt que de l'imprimer. */
        if (Date.now() - Number(pending.createdAt || 0) > SV_DRAFT_TTL) return;
        try {
          svSendOrderBatch(id).then((r) => {
            if (r && r.ok && !r.nothing) toast('Commande en attente envoyée · cuisine', 'ok');
          }).catch(() => {});
        } catch (_) {}
      });
    }
    function startServiceSync() {
      if (serviceSyncTimer || SV_DEMO) return;
      try { svRestoreDrafts(); } catch (_) {}
      try { svDrainPendingBatches(); } catch (_) {}
      pollServiceSync();
      const tick = () => {
        joinServiceSocket();
        const live = window.KiwiLiveSocket && KiwiLiveSocket.live();
        serviceSyncTimer = setTimeout(() => {
          try { pollServiceSync(); } catch (_) {}
          tick();
        }, live ? SERVICE_SYNC_LIVE : SERVICE_SYNC_FAST);
      };
      tick();
    }
    window.addEventListener('online', () => { try { svDrainPendingBatches(); } catch (_) {} });
    /* Le dernier instant où l'on peut encore écrire : l'onglet que l'iOS
       recycle ne repasse pas par un événement plus tardif. */
    window.addEventListener('pagehide', () => { try { svSaveDrafts(); } catch (_) {} });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { try { svSaveDrafts(); } catch (_) {} }
    });
    function stopServiceSync() {
      if (serviceSyncTimer) clearTimeout(serviceSyncTimer);
      try { if (window.KiwiLiveSocket) KiwiLiveSocket.stop(); } catch (_) {}
      serviceSyncTimer = null;
      serviceOrderSince = 0;
      serviceEventSince = 0;
      servicePlanTick = 0;
      serviceOrderStatus.clear();
      serviceCanonicalOrders.clear();
      serviceReopenedBills.clear();
      serviceReopenedBillsAvailable = !!SV_DEMO;
      serviceCanonicalReady = false;
      serviceEventSeen.clear();
      serviceStateVersion.clear();
      serviceBillAwaiting.clear();
      serviceHistoryKey = '';
      serviceMineTables.clear();
      servicePausedTables.clear();
      try { svSyncReset(); } catch (_) {}
    }

    /* A service login is an identity boundary, not just a different name in
       the header. Table drafts live in memory so they survive navigation inside
       one shift, but they must NEVER survive logout / clock-out and become the
       next employee's bill. In particular, cancel every delayed state upload
       before clearing the lines: otherwise a 300 ms timer created by employee A
       fires after employee B logs in and republishes A's bill with B's session. */
    function clearEmployeeOperationalState() {
      serviceDraftTimers.forEach((timer) => clearTimeout(timer));
      serviceDraftTimers.clear();
      dirtyOrders.clear();
      svPendingRef.clear();
      svPendingBatches.clear();
      serviceTableSessionRevisions.clear();
      Object.keys(tableOrders).forEach((id) => delete tableOrders[id]);
      tableClients.clear();
      /* Effacé AUSSI du stockage : un identifiant de paiement laissé derrière
         soi appartiendrait à l'employé suivant qui ouvre la même table. */
      employeePaymentRefsForgetAll();
      serviceBillAwaiting.clear();
      activeTableId = null;
      menuContextId = null;
    }

    /* ===========================================================
       Six-digit caisse code — gates "Pointer l'arrivée"
       -----------------------------------------------------------
       The employee's login proves who they are. The short-lived code
       shown by the paired caisse proves they are inside the store.
       =========================================================== */
    let nfcTapped = false;
    function prepareAttendanceGate(action) {
      attendanceAction = action === 'clock-out' ? 'clock-out' : 'clock-in';
      applyRoleToClockin();
      resetNfc();
      const button = $('#ci-button');
      const caption = $('#nfc-caption');
      if (button) {
        const label = button.querySelector('span');
        if (label) label.textContent = attendanceAction === 'clock-out' ? 'Pointer le départ' : 'Pointer l’arrivée';
      }
      if (caption) caption.textContent = attendanceAction === 'clock-out'
        ? 'Saisissez le code de la caisse pour terminer le service'
        : 'Saisissez le code de la caisse pour ouvrir le service';
      showScreen('screen-clockin');
      if (teamKit()) { mountTeamClock(); return; }
      setTimeout(() => { const input = $('#attendance-code'); if (input) input.focus(); }, 80);
    }
    function resetNfc() {
      nfcTapped = false;
      const z = $('#nfc-zone'), c = $('#nfc-caption'), b = $('#ci-button');
      if (z) z.classList.remove('is-tapped');
      if (c) c.textContent = attendanceAction === 'clock-out'
        ? 'Saisissez le code de la caisse pour terminer le service'
        : 'Saisissez le code de la caisse pour ouvrir le service';
      if (b) b.disabled = true;
    }
    function fireNfcTap() {
      if (nfcTapped) return;
      if (!SV_DEMO && attendanceCode.length !== 6) return;
      nfcTapped = true;
      const z = $('#nfc-zone'), c = $('#nfc-caption'), b = $('#ci-button');
      if (SV_DEMO) {
        if (z) z.classList.add('is-tapped');
        if (c) c.textContent = attendanceAction === 'clock-out'
          ? `Départ autorisé · ${activeRole.name}`
          : `Arrivée autorisée · ${activeRole.name}`;
      } else if (c) {
        /* Six chiffres tapés ne prouvent rien : « Arrivée autorisée » et la coche
           s'affichaient avant que le serveur ait comparé le code à celui de la
           caisse, puis un code faux se faisait refuser après coup. Ici on dit
           seulement que le code est saisi ; l'autorisation vient de la réponse. */
        c.textContent = 'Code saisi · il sera vérifié au pointage';
      }
      if (b) b.disabled = false;
    }
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
    function enterServiceAfterClockIn(btn, cloudStart) {
      /* New flow — mirrors the dashboard intro sequence:
       *   0       button morphs into a check
       *   640     clockin screen leaves (zoom + blur, 380ms)
       *   1020    GREETING FLASH appears (paper bg fades in, h1 slides up)
       *   1900    typewriter reveal begins
       *   2700    caret drops, sentence reads clean
       *   3300    greeting fades + main screen zooms in (existing animation)
       *   4000    greeting removed
       */
      setTimeout(() => {
        $('#screen-clockin').classList.add('is-leaving');

        // 380ms later — clockin gone, swap to main (kept hidden) + show greeting
        setTimeout(() => {
          shiftStart = cloudStart || new Date();
          startServiceSync();
          $$('.screen').forEach(s => s.classList.remove('is-leaving'));
          showScreen('screen-main');
          const main = $('#screen-main');
          main.classList.add('is-pre-hidden');
          btn.classList.remove('is-loading');
          // Wire identity + role-restricted tabs BEFORE first paint
          applyRoleToMain();
          renderSchedule();
          renderHours();
          updateShiftMeta();
          // Pre-render so the dive-in shows real data, not empty bones.
          // Restricted roles land straight in the profil tab.
          setTab(activeRole.defaultTab);
          renderAll();
          lucide.createIcons();

          runGreetingFlash(main);
        }, 380);
      }, 640);
    }

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
    function enterBrowseMode() {
      document.body.classList.add('is-browse-mode');
      svApplyBrowseLock(true);
      // Hard guarantee: no shift in flight when consulting from home.
      shiftStart = null;

      $$('.screen').forEach(s => s.classList.remove('is-leaving'));
      showScreen('screen-main');
      const main = $('#screen-main');
      main.classList.remove('is-pre-hidden', 'is-entering');

      applyRoleToMain();
      // Force profil tab — schedule + hours is the only sensible view
      // when off-shift, regardless of role.
      setTab('profil');
      renderSchedule();
      renderHours();
      try { renderAll(); } catch (e) {}
      // Topbar shift-meta: replace "En service · 0h 00" with "Hors service"
      const tbMeta = $('#tb-shift-meta');
      if (tbMeta) tbMeta.textContent = 'Hors service';
      lucide.createIcons();
    }

    function exitBrowseMode() {
      document.body.classList.remove('is-browse-mode');
      svApplyBrowseLock(false);
      // Reset topbar back to default for the next clock-in cycle.
      const tbMeta = $('#tb-shift-meta');
      if (tbMeta) tbMeta.textContent = 'En service · 0h 00';
    }

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
    function runGreetingFlash(mainEl) {
      const greetEl = $('[data-kiwi-greet]');
      if (!greetEl) {
        // Fallback: skip flash, just reveal main
        mainEl.classList.remove('is-pre-hidden');
        mainEl.classList.add('is-entering');
        const tab = $('.tab-tables');
        tab.classList.add('is-fresh');
        setTimeout(() => tab.classList.remove('is-fresh'), 1300);
        setTimeout(() => mainEl.classList.remove('is-entering'), 700);
        return;
      }

      // --- Dynamic copy — picks per role ---
      const line1El = $('#greet-line1');
      const subEl   = $('#greet-sub');
      if (line1El) line1El.textContent = `${employeeHello(activeRole.name)},`;
      if (subEl) {
        if (activeRole.restricted) {
          // Non-server staff — generic welcome, no table-counting.
          subEl.textContent = `${svName('Café Atlas') || 'Service'} · ${employeeRoleName(activeRole.role).toLocaleLowerCase(employeeLocale())} · ${employeeShiftWish()}`;
        } else {
          const myCount = Object.keys(tables).filter(id => isMineTable(tables[id])).length;
          const tod = (typeof timeOfDay === 'function') ? timeOfDay() : 'ce soir';
          const paused = Object.entries(servers).filter(([id, s]) => id !== currentUser && s.status === 'on-pause');
          let sub = `${employeeTableCount(myCount)} ${tod} · ${employeeShiftWish()}`;
          if (paused.length > 0) sub = `${employeeTableCount(myCount)} ${tod} · ${paused[0][1].name.split(' ')[0]} ${employeeLanguage === 'ar' ? 'في استراحة' : employeeLanguage === 'en' ? 'on break' : 'en pause'}`;
          subEl.textContent = sub;
        }
      }

      // --- Wrap <em> in .em-clip + measure natural width ---
      let emClip = null;
      const greetH1 = greetEl.querySelector('h1');
      const greetEm = greetH1 && greetH1.querySelector('em');
      if (greetEm && !greetEm.parentNode.classList.contains('em-clip')) {
        const naturalW = Math.ceil(greetEm.getBoundingClientRect().width) + 6;
        emClip = document.createElement('span');
        emClip.className = 'em-clip';
        emClip.style.setProperty('--em-w', naturalW + 'px');
        greetEm.parentNode.insertBefore(emClip, greetEm);
        emClip.appendChild(greetEm);
      } else if (greetEm) {
        // Re-fire path (logout/login): wrapper exists, re-measure
        emClip = greetEm.parentNode;
        emClip.classList.remove('is-revealed', 'is-typing');
        // Force reflow before re-revealing
        void emClip.offsetWidth;
      }

      // t=0: show backdrop + slide up h1
      greetEl.classList.add('is-visible');
      greetEl.setAttribute('aria-hidden', 'false');

      // t=880: typewriter reveal begins
      setTimeout(() => emClip && emClip.classList.add('is-revealed', 'is-typing'), 880);

      // t=1680: caret drops
      setTimeout(() => emClip && emClip.classList.remove('is-typing'), 1680);

      // t=2280: greeting fades + main zooms in
      setTimeout(() => {
        greetEl.classList.remove('is-visible');
        greetEl.setAttribute('aria-hidden', 'true');
        mainEl.classList.remove('is-pre-hidden');
        mainEl.classList.add('is-entering');
        // The "fresh" stagger lives on tab-tables; only fire it if the user
        // lands there (servers). Restricted roles land on profil.
        if (!activeRole.restricted) {
          const tab = $('.tab-tables');
          tab.classList.add('is-fresh');
          setTimeout(() => tab.classList.remove('is-fresh'), 1300);
        }
        setTimeout(() => mainEl.classList.remove('is-entering'), 700);
      }, 2280);
    }

    function updateWelcomeCopy() {
      const myCount = Object.keys(tables).filter(id => isMineTable(tables[id])).length;
      const paused = Object.entries(servers).filter(([id, s]) => id !== currentUser && s.status === 'on-pause');
      $('#wb-line1').textContent = `${employeeHello(activeRole.name)}!`;
      const tod = timeOfDay();
      let line2 = `${employeeTableCount(myCount)} ${tod} · ${employeeShiftWish()}`;
      if (paused.length > 0) {
        line2 = `${employeeTableCount(myCount)} ${tod} · ${paused[0][1].name.split(' ')[0]} ${employeeLanguage === 'ar' ? 'في استراحة' : employeeLanguage === 'en' ? 'on break' : 'en pause'}`;
      }
      $('#wb-line2').textContent = line2;
    }

    function showWelcomeBanner() {
      updateWelcomeCopy();
      const banner = $('#welcome-banner');
      // restart animation
      banner.classList.remove('is-visible');
      void banner.offsetWidth;
      banner.classList.add('is-visible');
      lucide.createIcons();
    }

    function resetToEmployeePortal(message) {
      window.KiwiServiceRequests?.reset();
      stopServiceSync();
      clearEmployeeOperationalState();
      shiftStart = null;
      tablesPaid = 0;
      pinInput = '';
      renderPinDots();
      pinGreetLastEmployee();
      showScreen('screen-pin');
      if (teamKit()) window.KiwiTeamPin.reset();
      if (message) toast(message);
    }
    /* The lock names nobody until someone has signed in on this phone: on a
       fresh install it greeted "Yassir", a stranger to whoever holds it. Once
       an employee has used the device we greet them, with a way to hand over. */
    function pinGreetLastEmployee() {
      const who = document.querySelector('[data-pin-who]');
      const sw = document.querySelector('[data-pin-switch]');
      if (!who || !sw) return;
      const first = String((document.querySelector('.tb-name') || {}).textContent || '').trim().split(/\s+/)[0];
      if (!first || first === 'Serveur') return;
      who.dataset.employee = first;
      who.dataset.venue = who.dataset.venue || who.textContent;
      who.textContent = employeeHello(first);
      sw.hidden = false;
    }
    document.querySelector('[data-pin-switch]')?.addEventListener('click', function () {
      const who = document.querySelector('[data-pin-who]');
      if (who) { delete who.dataset.employee; who.textContent = who.dataset.venue || 'Kiwi'; }
      this.hidden = true;
      pinInput = ''; renderPinDots();
    });

    function logoutEmployeeSession() {
      /* Clear synchronously, before the asynchronous cookie logout. A fast
         second login must not have even one event-loop turn in which the former
         employee's draft can publish under the new identity. */
      stopServiceSync();
      clearEmployeeOperationalState();
      if (!SV_DEMO && window.KiwiEmployeeLive) {
        window.KiwiEmployeeLive.logout().catch(() => {});
      }
      resetToEmployeePortal('Session fermée');
    }

    async function finishClockOut() {
      if (!SV_DEMO && window.KiwiEmployeeLive) {
        await window.KiwiEmployeeLive.clockOut(window.__kiwiShiftProgress || null, attendanceCode);
      }
      await afterClockOut();
    }
    async function afterClockOut() {
      if (!SV_DEMO && window.KiwiEmployeeLive) {
        consumeAttendanceCode();
        await window.KiwiEmployeeLive.logout();
      }
      resetToEmployeePortal(employeeLanguage === 'en' ? 'Shift closed' : employeeLanguage === 'ar' ? 'تم إنهاء الوردية' : 'Fin de service enregistrée');
    }

    /* ---------- Design 2027 (kiwiSkin2027:team) ----------
       The sign-in and the attendance code on the kit's pad
       (assets/kit/team-pin.js), judged by KiwiPinFlow's team and clock rows.
       Live sessions only: the demo keeps its own keypad. What the pad does not
       decide stays here: loading the session, and what follows a recorded
       clock-in or clock-out. Flag off, KiwiTeamPin never exists. */
    function teamKit() { return !SV_DEMO && !!window.KiwiTeamPin; }
    function mountTeamSignIn() {
      if (!teamKit()) return;
      window.KiwiTeamPin.signIn($('#screen-pin'), {
        signedIn: () => window.KiwiEmployeeLive.refresh().then(openEmployeeSession),
      });
    }
    function mountTeamClock() {
      window.KiwiTeamPin.clock($('#screen-clockin'), {
        action: attendanceAction,
        body: attendanceAction === 'clock-out'
          ? (code) => ({ action: 'clock-out', progress: window.__kiwiShiftProgress || null, attendanceCode: code })
          : undefined,
        done: (saved) => {
          /* The answer is the session as the server now holds it. */
          window.KiwiEmployeeLive.refresh().catch(() => {});
          if (attendanceAction === 'clock-out') {
            afterClockOut().catch(() => resetToEmployeePortal());
            return;
          }
          const start = saved && saved.entry && saved.entry.inTs ? new Date(saved.entry.inTs) : new Date();
          if (liveEmployeeState && liveEmployeeState.attendance) liveEmployeeState.attendance.open = (saved && saved.entry) || null;
          consumeAttendanceCode();
          enterServiceAfterClockIn($('#ci-button'), start);
        },
        signIn: endRevokedSession,
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountTeamSignIn);
    else mountTeamSignIn();

    function clockOut() {
      if (!SV_DEMO && attendanceCode.length !== 6) {
        prepareAttendanceGate('clock-out');
        toast('Saisissez le code de la caisse pour pointer le départ');
        return;
      }
      finishClockOut().catch((error) => {
        if (pinError(error && error.code, error && error.status)) endRevokedSession();
      });
    }

    $('#profil-clockout').addEventListener('click', () => {
      clockOut();
    });

    /* ---------- Tabs ---------- */
    /* Slide + rubber-band the highlight pill to the active tab (Instagram-style). */
    let btPillLeft = null, btPillW = null;
    function moveBtPill(forceInstant) {
      const cap = $('#bt-capsule'), pill = $('#bt-pill');
      if (!cap || !pill) return;
      const active = cap.querySelector('.bt-btn[aria-pressed="true"]');
      if (!active || cap.offsetWidth === 0) return;  // hidden / not laid out yet
      const capR = cap.getBoundingClientRect(), r = active.getBoundingClientRect();
      const left = Math.round(r.left - capR.left), w = Math.round(r.width);
      const set = (l, width) => { pill.style.transform = `translateX(${l}px)`; pill.style.width = width + 'px'; };
      pill.style.opacity = '1';
      if (forceInstant || btPillLeft === null) {
        pill.style.transition = 'none'; set(left, w); void pill.offsetWidth; pill.style.transition = '';
        btPillLeft = left; btPillW = w; return;
      }
      if (left === btPillLeft && w === btPillW) return;
      // phase 1: stretch the pill to span old + new, phase 2: settle on the target
      const spanLeft = Math.min(btPillLeft, left);
      const spanW = Math.max(btPillLeft + btPillW, left + w) - spanLeft;
      set(spanLeft, spanW);
      setTimeout(() => set(left, w), 115);
      btPillLeft = left; btPillW = w;
    }
    window.addEventListener('resize', () => moveBtPill(true));

    function setTab(name) {
      if (svBrowseMode() && name !== 'profil') { svBrowseGuard(); return; }
      const content = $('#main-content');
      if (content && name !== currentTab) content.scrollTop = 0;
      currentTab = name;
      $$('.bt-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === name ? 'true' : 'false'));
      moveBtPill();
      $$('.tab').forEach(t => {
        const match = t.dataset.tab === name;
        t.hidden = !match;
        t.classList.toggle('is-active', match);
      });
      // Refresh content per tab
      if (name === 'tables')   renderTables();
      if (name === 'menu')     { renderMenuContext(); renderCatPills(); renderMenu(); }
      if (name === 'notifications') {
        serviceUnread = 0;
        serviceNotifications.forEach((item) => { item.unread = false; });
        renderNotifications();
        updateNotificationBadge();
      }
      if (name === 'profil')   renderProfil();
      // Always update cart bar visibility on tab switch
      renderCartBar();
      lucide.createIcons();
    }

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

    function updateFilterCounts() {
      updateNotificationBadge();
    }

    function updateNotificationBadge() {
      const badge = $('#bt-notification-badge');
      if (!badge) return;
      badge.textContent = serviceUnread > 99 ? '99+' : String(serviceUnread);
      badge.hidden = serviceUnread < 1;
    }

    function filterMatches(t) {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'occupied') return ['a-commander','ka-yaklo','bgha-ykhlass','ka-tkhdam'].includes(t.status);
      if (activeFilter === 'bgha') return t.status === 'bgha-ykhlass';
      if (activeFilter === 'khawya') return t.status === 'khawya';
      return true;
    }

    function tableCardHTML(id, t, opts = {}) {
      const total = (t.status === 'khawya' || t.status === 'khlass') ? 0 : getTableTotal(id);
      const statusTxt = employeeTranslation(statusLabel[t.status]);
      const split = tableSplits.get(id);
      const pendingOrder = svPendingOrderFor(id);
      let line2 = '';
      if (pendingOrder) {
        line2 = `Commande OrderPro à valider · ${fmtMAD(pendingOrder.total)}`;
      } else if (split) {
        line2 = `Split en cours · ${split.paidCount}/${split.parts.length} réglées`;
      } else if (t.status === 'khawya')      line2 = employeeTranslation('Disponible');
      else if (t.status === 'khlass')        line2 = employeeTranslation('Réglée');
      else                                    line2 = `${statusTxt} · ${employeeMinuteCount(t.elapsed)}`;

      const displayTotal = total > 0 ? total : (pendingOrder ? pendingOrder.total : 0);
      const showAmount = displayTotal > 0;
      const urgentDot = (t.status === 'bgha-ykhlass' || pendingOrder) ? `<span class="tc-pulse-dot${pendingOrder ? ' is-pending' : ''}"></span>` : '';
      const orderProBadge = pendingOrder ? `<span class="tc-orderpro-badge" style="font-size:9.5px;font-weight:700;letter-spacing:0.04em;color:var(--forest-deep);background:var(--mint);padding:2px 7px;border-radius:6px;margin-left:6px;display:inline-flex;align-items:center;gap:3px;"><i data-lucide="smartphone" style="width:11px;height:11px;"></i>OrderPro</span>` : '';
      const serverInfo = t.server && servers[t.server];
      const serverChip = (opts.showServer && t.server !== currentUser && serverInfo)
        ? `<span class="tc-server-chip">${esc(serverInfo.initials)}</span>`
        : '';

      const currentActor = (activeRole && (activeRole.fullName || activeRole.name)) || 'Serveur';
      const activeLock = serviceTableLocks && serviceTableLocks[id];
      const isLockedByOther = activeLock && activeLock.actor && activeLock.actor !== currentActor && (Date.now() - Number(activeLock.ts || 0) < 60000);
      const lockChip = isLockedByOther ? `<span class="tc-lock-indicator" title="Prise en cours par ${esc(activeLock.actor)}"><i data-lucide="lock"></i></span>` : '';

      return `
        <button type="button" class="table-card${pendingOrder ? ' has-orderpro' : ''}" data-status="${esc(t.status)}" data-table="${esc(id)}">
          ${lockChip}
          <div class="tc-num">${esc(id)}</div>
          <div class="tc-info">
            <div class="tc-line1">${esc(id)} · ${employeeCoverCount(t.covers || t.seats || 0)} ${orderProBadge} ${serverChip} ${urgentDot}</div>
            <div class="tc-line2">${line2}</div>
          </div>
          <div class="tc-right">
            ${showAmount ? `<div class="tc-amount">${fmtMAD(displayTotal)}</div>` : ''}
          </div>
          <div class="tc-arrow"><i data-lucide="chevron-right"></i></div>
        </button>
      `;
    }

    function zoneDisplayLabel(table) {
      const key = String(table && table.zone || 'salle').toLowerCase();
      const labels = employeeLanguage === 'ar'
        ? { salle:'القاعة', terrasse:'الشرفة', etage:'الطابق', étage:'الطابق', comptoir:'المنضدة', patio:'الفناء', jardin:'الحديقة' }
        : employeeLanguage === 'en'
          ? { salle:'Dining room', terrasse:'Terrace', etage:'Upper floor', étage:'Upper floor', comptoir:'Counter', patio:'Patio', jardin:'Garden' }
          : { salle:'Salle', terrasse:'Terrasse', etage:'Étage', étage:'Étage', comptoir:'Comptoir', patio:'Patio', jardin:'Jardin' };
      const supplied = String(table && table.zoneLabel || '').trim();
      /* « Salle », « Terrasse »… : le nom par défaut d'une zone est un mot, pas
         un nom propre ; il suit la langue de l'app quelle que soit sa clé. */
      const FR_ZONES = { salle:'Salle', terrasse:'Terrasse', etage:'Étage', comptoir:'Comptoir', patio:'Patio', jardin:'Jardin' };
      const frKey = employeeLanguage !== 'fr' && Object.keys(FR_ZONES).find((k) => FR_ZONES[k].toLowerCase() === supplied.toLowerCase());
      if (frKey) return labels[frKey];
      return supplied && !(supplied === 'Salle' && (key !== 'salle' || employeeLanguage !== 'fr')) ? supplied : (labels[key] || supplied || labels.salle);
    }

    function renderTables() {
      updateFilterCounts();
      $$('.scope-btn').forEach(b => {
        const active = b.dataset.scope === currentScope;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      $$('.filter-chip').forEach(b => {
        const active = b.dataset.filter === activeFilter;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

      // Scope counts (always reflect totals)
      const mineCount = Object.keys(tables).filter(id => isMineTable(tables[id])).length;
      const allCount = Object.keys(tables).length;
      $('#scope-mine-count').textContent = mineCount;
      $('#scope-all-count').textContent = allCount;
      const scoped = Object.keys(tables).filter(id => currentScope === 'all' || isMineTable(tables[id])).map(id => tables[id]);
      const counts = {
        all: scoped.length,
        occupied: scoped.filter(t => ['a-commander','ka-yaklo','bgha-ykhlass','ka-tkhdam'].includes(t.status)).length,
        bgha: scoped.filter(t => t.status === 'bgha-ykhlass').length,
        khawya: scoped.filter(t => t.status === 'khawya').length,
      };
      Object.keys(counts).forEach(key => { const el = document.querySelector(`[data-filter-count="${key}"]`); if (el) el.textContent = counts[key]; });

      const wrap = $('#tables-zones');
      /* Plan vide : « chargement », « injoignable » ou « réellement vide »,
         jamais la boîte « modifiez le filtre » quand il n'y a rien à filtrer. */
      wrap.innerHTML = !Object.keys(tables).length
        ? svFloorEmptyHTML()
        : svFloorNoteHTML() + (currentScope === 'mine' ? renderOwnTables() : renderAllTables());
      lucide.createIcons();
    }

    function renderOwnTables() {
      const myIds = Object.keys(tables).filter(id => isMineTable(tables[id]) && filterMatches(tables[id]));

      // Pause-alert banner if any colleague on pause
      const paused = Object.entries(servers)
        .filter(([id, s]) => id !== currentUser && s.status === 'on-pause');
      let alertHTML = '';
      if (paused.length > 0) {
        alertHTML = paused.map(([id, s]) => {
          const n = Object.keys(tables).filter(tid => tableServerIds(tables[tid]).includes(id)).length;
          return `
            <div class="colleague-alert" data-go-all="${id}">
              <div class="colleague-alert-icon"><i data-lucide="coffee"></i></div>
              <div class="colleague-alert-text">
                <div class="colleague-alert-title">${esc(s.name)} ${employeeLanguage === 'ar' ? 'في استراحة' : employeeLanguage === 'en' ? 'on break' : 'en pause'}</div>
                <div class="colleague-alert-sub">${employeeLanguage === 'ar' ? `${employeeTableCount(n)} للتغطية · اضغط للعرض` : employeeLanguage === 'en' ? `${employeeTableCount(n)} to cover · tap to view` : `${employeeTableCount(n)} à couvrir · tapez pour voir`}</div>
              </div>
              <i data-lucide="chevron-right" class="colleague-alert-chev"></i>
            </div>`;
        }).join('');
      }

      const titleHTML = `
        <div class="scope-title">
          <span>${ownTablesTitle()}</span>
          <span class="scope-count-pill">${myIds.length}</span>
        </div>`;

      const zoneSeen = Object.create(null);
      const zones = myIds
        .map((id) => ({ key: tables[id].zone || 'salle', label: zoneDisplayLabel(tables[id]) }))
        .filter((z) => { if (zoneSeen[z.key]) return false; zoneSeen[z.key] = 1; return true; });
      const zonesHTML = zones.map(z => {
        const ids = myIds.filter(id => tables[id].zone === z.key);
        if (ids.length === 0) return '';
        return `
          <div class="zone-block">
            <div class="section-title-row">
              <span class="section-title">${z.label}</span>
              <span class="section-count">${employeeTableCount(ids.length)}</span>
            </div>
            <div class="table-list">
              ${ids.map(id => tableCardHTML(id, tables[id])).join('')}
            </div>
          </div>`;
      }).join('');

      const empty = myIds.length ? '' : `<div class="tables-empty">
        <div class="tables-empty-icon"><i data-lucide="utensils-crossed"></i></div>
        <strong>${employeeTranslation('Aucune table ici')}</strong>
        <p>${employeeTranslation('Modifiez le filtre pour retrouver vos tables.')}</p>
        <button type="button" class="empty-cta" data-reset-filter>${employeeTranslation('Afficher toutes les tables')}</button>
      </div>`;
      return alertHTML + titleHTML + zonesHTML + empty;
    }

    function renderAllTables() {
      // All 21 tables grouped by server. Order: current user first,
      // then on-pause colleagues (urgent coverage), then other colleagues.
      const filteredCount = Object.keys(tables).filter(id => filterMatches(tables[id])).length;
      const titleHTML = `
        <div class="scope-title">
          <span>Toutes les tables</span>
          <span class="scope-count-pill">${filteredCount}</span>
        </div>`;

      const orderedIds = Object.keys(servers).sort((a, b) => {
        if (a === currentUser) return -1;
        if (b === currentUser) return 1;
        const aP = servers[a].status === 'on-pause' ? 0 : 1;
        const bP = servers[b].status === 'on-pause' ? 0 : 1;
        return aP - bP;
      });

      const sectionsHTML = orderedIds.map(sid => {
        const ids = Object.keys(tables).filter(id => (sid === currentUser ? isMineTable(tables[id]) : tableServerIds(tables[id]).includes(sid)) && filterMatches(tables[id]));
        if (ids.length === 0) return '';
        const s = servers[sid];
        const isMe = sid === currentUser;
        const isOnPause = s.status === 'on-pause';
        const statusText = isOnPause
          ? (employeeLanguage === 'ar' ? 'في استراحة · يحتاج إلى تغطية' : employeeLanguage === 'en' ? 'On break · needs cover' : 'En pause · à couvrir')
          : employeeTranslation('En service');
        return `
          <div class="zone-block">
            <div class="colleague-header">
              <div class="colleague-avatar ${isOnPause ? 'on-pause' : ''} ${isMe ? 'is-me' : ''}">${esc(s.initials)}</div>
              <div class="colleague-info">
                <div class="colleague-name">${esc(s.name)}${isMe ? ' <span class="colleague-you">· vous</span>' : ''}</div>
                <div class="colleague-status ${isOnPause ? 'on-pause' : ''}">${statusText}</div>
              </div>
              <span class="colleague-count">${employeeTableCount(ids.length)}</span>
            </div>
            <div class="table-list">
              ${ids.map(id => tableCardHTML(id, tables[id], { showServer: !isMe })).join('')}
            </div>
          </div>`;
      }).join('');

      const empty = sectionsHTML ? '' : `<div class="tables-empty">
        <div class="tables-empty-icon"><i data-lucide="layout-grid"></i></div>
        <strong>${employeeTranslation('Aucune table ici')}</strong>
        <p>${employeeTranslation('Modifiez le filtre pour retrouver vos tables.')}</p>
        <button type="button" class="empty-cta" data-reset-filter>${employeeTranslation('Afficher toutes les tables')}</button>
      </div>`;
      return titleHTML + sectionsHTML + empty;
    }

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
    function openTableDetail(id) {
      if (svBrowseGuard()) return;
      const t = tables[id];
      if (!t) return;
      if (isEmployeePaused()) { toast('Reprenez le service pour prendre une commande'); return; }

      // Commande OrderPro en attente : ouvre directement le détail pour valider l'envoi en cuisine
      const pending = svPendingOrderFor(id);
      if (pending) {
        activeTableId = id;
        setTableLock(id, 'acquire');
        ensureTableOrder(id);
        renderTableDetail();
        showScreen('screen-table');
        lucide.createIcons();
        return;
      }

      // Khawya tables → covers picker first
      if (t.status === 'khawya') {
        openNewTableModal(id);
        return;
      }
      // Khlass tables → just show info briefly
      if (t.status === 'khlass') {
        toast(`Table ${id} déjà réglée`);
        return;
      }
      activeTableId = id;
      setTableLock(id, 'acquire');
      ensureTableOrder(id);
      renderTableDetail();
      showScreen('screen-table');
      lucide.createIcons();
    }

    function renderTableDetail() {
      svTouchDrafts();
      const id = activeTableId;
      if (!id) return;
      // Special path: if this table has a split in progress, show
      // the resume/cancel view instead of the normal order detail.
      if (tableSplits.has(id) && serviceReopenedBillsAvailable && !serviceReopenedBills.has(id)) {
        return renderTableDetailSplit(id);
      }
      const t = tables[id];
      const order = ensureTableOrder(id);
      if (!serviceReopenedBillsAvailable) {
        $('#td-table-name').textContent = `${id} · ${employeeCoverCount(t.covers || t.seats || 0)}`;
        $('#td-table-meta').textContent = 'Vérification des notes indisponible';
        $('#td-body').innerHTML = '<div class="td-pending-banner"><div class="td-pending-copy"><strong>Vérification indisponible</strong><span>La caisse peut encaisser. Le serveur ne peut pas confirmer ici qu’une note rouverte est encore due.</span></div></div>';
        $('#td-footer').innerHTML = '<button class="td-btn ghost" disabled>Vérification en cours · encaisser au comptoir</button>';
        return;
      }
      const reopened = serviceReopenedBills.get(id);
      if (reopened) {
        /* A reopened payment is not an unsent kitchen order. Its original
         * kitchen rows remain paid on the closed visit, so show the due part
         * without offering a misleading zero-MAD employee payment or a second
         * kitchen send. The cashier owns this split until it is settled. */
        $('#td-table-name').textContent = `${id} · ${employeeCoverCount(t.covers || t.seats || 0)}`;
        $('#td-table-meta').textContent = 'Note rouverte · règlement au comptoir';
        const pill = $('#td-status-pill');
        pill.dataset.status = 'bgha-ykhlass';
        pill.textContent = 'Note rouverte';
        const lines = (reopened.lines || []).map(line => `<div class="td-item">
          <span style="font-weight:700;width:32px;text-align:center">${esc(line.qty)}×</span>
          <span class="td-item-name">${esc(line.name)}</span>
          <span class="td-item-price">${fmtMAD(line.total)}</span></div>`).join('');
        $('#td-body').innerHTML = `<div class="td-pending-banner"><div class="td-pending-copy">
          <strong>Note ${esc(reopened.ref || '')} rouverte en caisse</strong>
          <span>Partie à régler : ${fmtMAD(reopened.amountCents / 100)}. Les autres parties déjà payées restent réglées.</span>
          </div></div><div class="td-order-list">${lines}</div>`;
        $('#td-footer').innerHTML = '<button class="td-btn ghost" disabled>Encaisser cette note au comptoir</button>';
        lucide.createIcons();
        return;
      }
      const total = order.reduce((s, l) => s + l.price * l.qty, 0);
      const isDirty = dirtyOrders.has(id);

      const currentActor = (activeRole && (activeRole.fullName || activeRole.name)) || 'Serveur';
      const activeLock = serviceTableLocks && serviceTableLocks[id];
      const isLockedByOther = activeLock && activeLock.actor && activeLock.actor !== currentActor && (Date.now() - Number(activeLock.ts || 0) < 60000);
      const lockBannerHtml = isLockedByOther ? `
        <div class="td-lock-banner">
          <i data-lucide="lock"></i>
          <span><strong>${esc(activeLock.actor)}</strong> prend la commande sur cette table</span>
        </div>
      ` : '';

      /* ── UNE COMMANDE QUI ATTEND, ET LE SERVEUR QUI PEUT DIRE OUI ─────────
       * L'app prévenait déjà (« nouvelle commande »), affichait déjà les
       * lignes — et n'offrait aucun geste : il fallait traverser la salle
       * pour qu'une autre paire de mains appuie au comptoir. Le bouton est
       * ici, sur la table concernée. Refuser reste au comptoir. */
      const pendingOrder = svPendingOrderFor(id);
      const pendingBannerHtml = pendingOrder ? `
        <div class="td-pending-banner">
          <div class="td-pending-copy">
            <strong>Commande ${esc(serviceOrderRef(pendingOrder))} en attente</strong>
            <span>Arrivée par le menu en ligne · elle n'est pas encore partie en cuisine.</span>
          </div>
          <button class="td-pending-go" data-accept-order="${esc(pendingOrder.id)}">Accepter · envoyer en cuisine</button>
        </div>
      ` : '';

      $('#td-table-name').textContent = `${id} · ${employeeCoverCount(t.covers || t.seats || 0)}`;
      $('#td-table-meta').textContent = (t.status === 'khawya' || t.status === 'khlass')
        ? employeeTranslation(statusLabel[t.status])
        : `${employeeTranslation(statusLabel[t.status])} · ${employeeMinuteCount(t.elapsed)}`;
      const pill = $('#td-status-pill');
      pill.dataset.status = t.status;
      pill.textContent = employeeTranslation(statusLabel[t.status]);

      // Body
      const body = $('#td-body');
      if (order.length === 0) {
        body.innerHTML = pendingBannerHtml + lockBannerHtml + `
          <div class="td-empty">
            <i data-lucide="utensils"></i>
            <p>Aucun article, appuyez sur <strong>Prendre la commande</strong> pour ouvrir le menu.</p>
          </div>
        `;
      } else {
        /* Once the guest asks for the bill, the priced lines become a receipt,
           not an editable cart. Extra items still go through "Ajouter", then
           must be sent before payment can resume. */
        const isEditable = (t.status === 'a-commander' || t.status === 'ka-yaklo');
        const itemsHTML = order.map(l => {
          const noteTxt = (l.note || '').trim();
          const optTxt = optsSummary(l.opts);
          const optLine = optTxt ? `<span class="td-item-optline">${SLIDERS_SVG}${esc(optTxt)}</span>` : '';
          const isPart = l.kind === 'formula-part';
          const isFormula = l.kind === 'formula';
          const displayName = isPart
            ? `<span style="color:var(--forest-ink);font-size:11px;font-weight:600;margin-right:4px;">[${esc(l.slotLabel || 'Choix')}]</span> ${esc(svLineName(l))}`
            : (isFormula ? `${esc(svLineName(l))} <span style="font-size:9.5px;font-weight:700;letter-spacing:0.05em;color:var(--forest-ink);background:var(--mint-tint);padding:1px 6px;border-radius:4px;margin-left:6px;">FORMULE</span>` : esc(svLineName(l)));
          const displayPrice = isPart
            ? `<span class="td-item-price" style="font-size:12px;color:var(--ink-4);">inclus</span>`
            : `<span class="td-item-price">${fmtMAD(l.price * l.qty)}</span>`;

          if (isEditable) {
            const stepper = isPart
              ? `<div class="td-item-qty" style="justify-content:center;color:var(--ink-4);font-size:13px;">↳</div>`
              : `
                <div class="td-item-qty">
                  <button class="td-qty-btn minus" data-qty="dec" aria-label="Annuler un ${esc(l.name)}" ${l.voidPending ? 'disabled title="En attente de la cuisine"' : ''}>−</button>
                  <span class="td-qty-num">${l.qty}</span>
                  <button class="td-qty-btn plus" data-qty="inc" aria-label="Plus">+</button>
                </div>`;
            return `
              <div class="td-item" data-order-uid="${l.uid}">
                ${stepper}
                <span class="td-item-name">${displayName}</span>
                ${displayPrice}
                ${optLine}${svPromoLine(l)}
                <input class="td-item-note${noteTxt ? ' has-note' : ''}" data-note-uid="${l.uid}"
                  placeholder="Note cuisine, ex. bien chaud, sans oignon" aria-label="Note cuisine, ${esc(l.name)}" />
              </div>
            `;
          } else {
            return `
              <div class="td-item" data-order-uid="${l.uid}">
                <span style="font-weight:700;width:32px;text-align:center;font-feature-settings:'tnum' 1;">${l.qty}×</span>
                <span class="td-item-name">${displayName}</span>
                ${displayPrice}
                ${!isPart && l.sentQty > 0 ? `<button type="button" class="td-qty-btn minus" data-qty="dec" aria-label="Annuler un ${esc(l.name)}" ${l.voidPending ? 'disabled title="En attente de la cuisine"' : ''}>−</button>` : ''}
                ${optLine}${svPromoLine(l)}
                ${noteTxt ? `<span class="td-item-noteline">Note cuisine · ${esc(noteTxt)}</span>` : ''}
              </div>
            `;
          }
        }).join('');

        body.innerHTML = pendingBannerHtml + `
          <div class="td-order-list">${itemsHTML}</div>
          <div class="td-summary">
            <div class="td-row"><span>Sous-total</span><span class="mono">${fmtMAD(total)}</span></div>
            <div class="td-row"><span>Service (compris)</span><span class="mono">0 MAD</span></div>
            <div class="td-total-row">
              <span class="lbl">Total</span>
              <span class="val">${fmtMAD(total)}</span>
            </div>
          </div>
        `;
        // Set each per-dish note input's value safely (avoids HTML-escaping issues).
        order.forEach(l => {
          const inp = body.querySelector(`.td-item-note[data-note-uid="${l.uid}"]`);
          if (inp) inp.value = l.note || '';
        });
      }

      // Footer buttons depend on status
      const footer = $('#td-footer');
      const lancerHTML = isDirty ? `
        <button class="td-btn primary lancer-btn" data-action="lancer">
          <i data-lucide="send-horizontal"></i> Lancer la commande
        </button>` : '';
      let fHTML = '';
      if (t.status === 'a-commander' || t.status === 'ka-yaklo') {
        if (order.length === 0) {
          fHTML = `
            <button class="td-btn primary" data-action="take-order">
              <i data-lucide="book-open"></i> Prendre la commande
            </button>
            <button class="td-btn danger sm" data-action="cancel-table">
              <i data-lucide="x"></i> Fermer la table
            </button>
          `;
        } else {
          fHTML = lancerHTML + `
            <button class="td-btn ${isDirty ? 'ghost' : 'primary'}" data-action="take-order">
              <i data-lucide="plus"></i> ${isDirty ? 'Ajouter encore' : 'Ajouter articles'}
            </button>
            <div class="td-btn-row">
              <button class="td-btn warn row-pair" data-action="ask-bill">
                <i data-lucide="receipt"></i> Addition
              </button>
              <button class="td-btn dark row-pair" data-action="pay">
                <i data-lucide="credit-card"></i> Encaisser
              </button>
            </div>
          `;
        }
      } else if (t.status === 'bgha-ykhlass') {
        fHTML = lancerHTML + `
          <button class="td-btn ${isDirty ? 'ghost' : 'primary'}" data-action="pay" ${isDirty ? 'disabled aria-disabled="true"' : ''}>
            <i data-lucide="credit-card"></i> ${isDirty ? 'Envoyez d’abord les modifications' : 'Encaisser ' + fmtMAD(total)}
          </button>
          <div class="td-btn-row">
            <button class="td-btn ghost row-pair" data-action="print-bill">
              <i data-lucide="printer"></i> Imprimer
            </button>
            <button class="td-btn ghost row-pair" data-action="take-order">
              <i data-lucide="plus"></i> Ajouter
            </button>
          </div>
        `;
      } else if (t.status === 'ka-tkhdam') {
        fHTML = `
          <button class="td-btn ghost" disabled style="opacity:.6">
            <i data-lucide="loader"></i> Paiement en cours…
          </button>
        `;
      } else if (t.status === 'khlass') {
        fHTML = `
          <button class="td-btn ghost" disabled>
            <i data-lucide="check-circle-2"></i> Table réglée
          </button>
        `;
      }
      if (t.status === 'a-commander' || t.status === 'ka-yaklo' || t.status === 'bgha-ykhlass') {
        fHTML += `
          <button class="td-btn danger sm" data-action="cancel-table" type="button"><i data-lucide="x"></i> Annuler toute la table</button>
          <div class="td-extra-row">
            <button class="td-extra-btn" type="button" data-action="transfer-table"><i data-lucide="arrow-right-left"></i>Changer table</button>
            <button class="td-extra-btn" type="button" data-action="merge-table"><i data-lucide="merge"></i>Fusionner</button>
          </div>
        `;
      }
      footer.innerHTML = fHTML;
      lucide.createIcons();
    }

    /* Special table detail view when a split is in progress */
    function renderTableDetailSplit(id) {
      const t = tables[id];
      const split = tableSplits.get(id);
      const paidTotal = split.parts.reduce((s, p) => s + (p.paid ? p.amount : 0), 0);
      const remaining = split.parts.length - split.paidCount;
      const remainingAmt = split.total - paidTotal;
      const pct = Math.round((split.paidCount / split.parts.length) * 100);

      $('#td-table-name').textContent = `${id} · ${t.covers} couvert${t.covers > 1 ? 's' : ''}`;
      $('#td-table-meta').textContent = `Split en cours · ${split.paidCount}/${split.parts.length} réglées`;
      const pill = $('#td-status-pill');
      pill.dataset.status = 'ka-tkhdam';
      pill.textContent = `Split ${split.paidCount}/${split.parts.length}`;

      // Body: split banner with progress + read-only order
      const order = ensureTableOrder(id);
      const orderHTML = order.map(l => {
        const optTxt = optsSummary(l.opts);
        return `
        <div class="td-item" style="opacity:0.55">
          <span style="font-weight:700;width:32px;text-align:center;font-feature-settings:'tnum' 1;">${l.qty}×</span>
          <span class="td-item-name">${esc(svLineName(l))}</span>
          <span class="td-item-price">${fmtMAD(l.price * l.qty)}</span>
          ${optTxt ? `<span class="td-item-optline">${SLIDERS_SVG}${esc(optTxt)}</span>` : ''}${svPromoLine(l)}
        </div>`;
      }).join('');

      $('#td-body').innerHTML = `
        <div class="td-split-banner">
          <div class="td-split-banner-row">
            <div class="td-split-banner-icon"><i data-lucide="split"></i></div>
            <div class="td-split-banner-text">
              <div class="td-split-banner-title">Split en cours · ${split.paidCount}/${split.parts.length}</div>
              <div class="td-split-banner-sub">${fmtMAD(paidTotal)} réglés / ${fmtMAD(split.total)} · reste ${fmtMAD(remainingAmt)}</div>
            </div>
          </div>
          <div class="td-split-progress">
            <div class="td-split-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="td-order-list">${orderHTML}</div>
      `;

      // Footer: primary Continuer + cancel
      $('#td-footer').innerHTML = `
        <button class="td-btn primary lancer-btn" data-action="resume-split">
          <i data-lucide="play"></i> Continuer le split · ${remaining} part${remaining > 1 ? 's' : ''}
        </button>
        <button class="td-btn danger sm" data-action="cancel-split">
          <i data-lucide="x"></i> Annuler le split
        </button>
      `;
      lucide.createIcons();
    }

    /* Leave the table-detail screen and land cleanly on the FLOOR.
       Bug fix: the back arrow / "Lancer" used to call showScreen('screen-main')
       WITHOUT setTab('tables'). showScreen only toggles the full-screen layer —
       not the inner tab panel — so after the take-order → menu flow (where
       currentTab is 'menu') you were dropped onto the Menu panel still showing
       "Commande pour Tx", with no back affordance. The screen felt frozen.
       Always return to the Tables floor and clear the lingering order context. */
    function returnToFloor() {
      if (activeTableId) setTableLock(activeTableId, 'release');
      activeTableId = null;
      menuContextId = null;
      showScreen('screen-main');
      setTab('tables');  // setTab renders the tables panel + hides the cart bar
      lucide.createIcons();
    }

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
        toast('Impression de l\'addition…');
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
    function svPendingOrderFor(tableId) {
      let found = null;
      serviceCanonicalOrders.forEach((order) => {
        if (found) return;
        if (String(order.table) !== String(tableId)) return;
        if (order.status !== 'pending') return;
        found = order;
      });
      return found;
    }

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
    async function postServiceCancellation(body) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch('/api/order/queue', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error(data?.error || `serveur ${res.status}`);
        return data;
      } catch (err) {
        if (controller.signal.aborted) throw new Error('délai dépassé · synchronisez la table avant de réessayer');
        throw err;
      } finally { clearTimeout(timer); }
    }
    let selectedVoidReason = 'client_change';
    let selectedVoidIsWaste = 0;

    /* Le parent facturé et les composants gratuits sont atomiques. Le lien
       formulaUid évite de toucher une boisson identique ajoutée hors formule. */
    function applyGroupedLineQtyDelta(lines, line, delta, adjustSentQty) {
      if (!line || line.kind === 'formula-part') return lines || [];
      const members = line.formulaUid
        ? (lines || []).filter(candidate => candidate.formulaUid === line.formulaUid)
        : [line];
      members.forEach(member => {
        member.qty = Math.max(0, (+member.qty || 0) + delta);
        if (adjustSentQty && member.sentQty != null) {
          member.sentQty = Math.max(0, (+member.sentQty || 0) + delta);
        }
      });
      return (lines || []).filter(member => (+member.qty || 0) > 0);
    }

    function openVoidReasonModal(tableId, line) {
      if (line.voidPending) { toast('Annulation déjà en attente de la cuisine'); return; }
      voidLineTarget = { tableId: tableId, line: line };
      selectedVoidReason = 'client_change';
      selectedVoidIsWaste = 0;
      $('#void-dish-name').textContent = `1× ${line.name}`;
      const chips = document.querySelectorAll('#void-reasons-chips .void-reason-chip');
      chips.forEach(c => c.classList.toggle('is-active', c.dataset.voidReason === 'client_change'));
      $('#void-reason-modal').classList.add('is-open');
      lucide.createIcons();
    }

    async function confirmVoidLine() {
      if (!voidLineTarget) return;
      const { tableId, line } = voidLineTarget;
      const confirmBtn = $('#void-confirm');
      if (confirmBtn) confirmBtn.disabled = true;

      if (!SV_DEMO) {
        try {
          const data = await postServiceCancellation({
              merchant: svSlug(),
              voidLine: {
                table: tableId,
                ...(line.orderId ? { orderId: line.orderId } : {}),
                lineId: line.canonicalUid || line.uid || line.id,
                qty: 1,
                reason: selectedVoidReason,
                isWaste: selectedVoidIsWaste,
                actor: activeRole.fullName || activeRole.name || 'Serveur'
              }
          });
          if (data.alertSent) {
            line.voidPending = true;
            toast(`Annulation demandée · attente de la cuisine · ${line.name}`);
            $('#void-reason-modal').classList.remove('is-open');
            if (confirmBtn) confirmBtn.disabled = false;
            voidLineTarget = null;
            renderTableDetail();
            return;
          }
          toast(`${line.name} annulé en cuisine`);
        } catch (err) {
          toast(`Annulation : ${err.message || 'erreur réseau'}`);
          if (confirmBtn) confirmBtn.disabled = false;
          return;
        }
      }

      tableOrders[tableId] = applyGroupedLineQtyDelta(tableOrders[tableId] || [], line, -1, true);
      markDirty(tableId);
      $('#void-reason-modal').classList.remove('is-open');
      if (confirmBtn) confirmBtn.disabled = false;
      voidLineTarget = null;
      renderTableDetail();
    }

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

    async function changeOrderQty(tableId, uid, delta) {
      /* One change per line at a time. Two quick taps computed the same target
         from the same line.qty before the first request returned, so one tap
         was lost, and two « − » could open two void requests. */
      const inFlight = changeOrderQty.inFlight || (changeOrderQty.inFlight = new Set());
      const flightKey = tableId + '|' + uid;
      if (inFlight.has(flightKey)) return;
      inFlight.add(flightKey);
      try {
      const order = tableOrders[tableId];
      if (!order) return;
      const line = order.find(l => l.uid === uid);
      if (!line) return;
      if (line.voidPending && delta < 0) { toast('Annulation déjà en attente de la cuisine'); return; }
      if (line.kind === 'formula-part') return;

      if (line.kind === 'formula' && delta > 0) {
        openFormulaSheet(line.id, 1);
        return;
      }

      // Pre-send local modification
      if (!line.sentQty || (line.qty > line.sentQty && delta < 0 && line.qty - 1 >= line.sentQty)) {
        tableOrders[tableId] = applyGroupedLineQtyDelta(order, line, delta, false);
        markDirty(tableId);
        renderTableDetail();
        return;
      }

      // Sent line modification
      if (delta < 0) {
        const newQty = line.qty + delta;
        if (newQty <= 0) {
          openVoidReasonModal(tableId, line);
          return;
        }

        if (!SV_DEMO) {
          try {
            const res = await fetch('/api/order/queue', {
              method: 'POST', credentials: 'same-origin', cache: 'no-store',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                merchant: svSlug(),
                editLine: {
                  table: tableId,
                  ...(line.orderId ? { orderId: line.orderId } : {}),
                  lineId: line.canonicalUid || line.uid || line.id,
                  qty: newQty,
                  isWaste: 0,
                  actor: activeRole.fullName || activeRole.name || 'Serveur'
                }
              })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || (data && !data.ok)) {
              toast(`Modification refusée · ${svErrLabel(data && data.error)}`);
              return;
            }
            if (data.alertSent || data.tier === 2) {
              line.voidPending = true;
              toast(`Réduction demandée · attente de la cuisine · ${line.name}`);
              renderTableDetail();
              return;
            }
            toast(`${line.name} modifié (${newQty}×)`);
          } catch (err) {
            toast(`Erreur réseau : ${err.message || ''}`);
            return;
          }
        }
        line.qty = newQty;
        line.sentQty = Math.min(line.sentQty, line.qty);
        renderTableDetail();
        return;
      }

      if (delta > 0) {
        const targetQty = line.qty + delta;
        if (!SV_DEMO) {
          try {
            const res = await fetch('/api/order/queue', {
              method: 'POST', credentials: 'same-origin', cache: 'no-store',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                merchant: svSlug(),
                editLine: {
                  table: tableId,
                  ...(line.orderId ? { orderId: line.orderId } : {}),
                  lineId: line.canonicalUid || line.uid || line.id,
                  qty: targetQty,
                  actor: activeRole.fullName || activeRole.name || 'Serveur'
                }
              })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || (data && !data.ok)) {
              toast(`Ajout refusé · ${svErrLabel(data && data.error)}`);
              return;
            }
            if (data.action === 'appended' && data.appendedLine) {
              tableOrders[tableId].push({
                uid: data.appendedLine.uid || newLineUid(),
                id: line.id,
                name: line.name,
                price: line.price,
                qty: data.appendedLine.qty || delta,
                opts: line.opts || [],
                note: '',
                sentQty: 0,
              });
              toast(`+1 ${line.name} ajouté`);
              renderTableDetail();
              return;
            }
          } catch (err) {
            toast(`Erreur réseau : ${err.message || ''}`);
            return;
          }
        }
        line.qty = targetQty;
        if (line.sentQty) line.sentQty = targetQty;
        renderTableDetail();
        return;
      }
      } finally { inFlight.delete(flightKey); }
    }

    /* ---------- New Table modal ---------- */
    let newTableId = null;
    let newTableCovers = 2;

    function openNewTableModal(tableId) {
      if (svBrowseGuard()) return;
      newTableId = tableId;
      newTableCovers = Math.max(2, tables[tableId]?.covers || 2);
      $('#nt-table-id').textContent = tableId;
      renderNewTableChips();
      $('#new-table-modal').classList.add('is-open');
      lucide.createIcons();
    }
    function renderNewTableChips() {
      $('#nt-covers-chips').innerHTML = [1,2,3,4,5,6,7,8].map(n =>
        `<button class="nt-chip ${n === newTableCovers ? 'is-active' : ''}" data-nt-covers="${n}">${n}</button>`
      ).join('');
    }
    async function confirmNewTable() {
      if (!newTableId) return;
      const id = newTableId;
      const confirm = $('#nt-confirm');
      if (confirm) confirm.disabled = true;
      if (!SV_DEMO) {
        try {
          const response = await fetch('/api/order/queue', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ merchant: svSlug(), openTable: id, covers: newTableCovers }),
          });
          const saved = await response.json().catch(() => null);
          if (!response.ok || !saved || !saved.ok || !saved.session) throw new Error('open-failed');
          serviceTableSessions.set(id, String(saved.session));
          serviceTableSessionRevisions.set(id, Number(saved.revision) || 0);
        } catch (_) {
          if (confirm) confirm.disabled = false;
          toast(`Table ${id} · ouverture non enregistrée, réessayez`, 4800);
          return;
        }
      }
      $('#new-table-modal').classList.remove('is-open');
      const t = tables[id];
      t.covers = newTableCovers;
      t.status = 'ka-yaklo';
      t.elapsed = 0;
      /* A physical table is reusable; its previous visit is not. Drop any
         canonical rows still cached on this phone before creating the next
         bill. The new visit has no order yet, so nothing legitimate is lost. */
      Array.from(serviceCanonicalOrders.entries()).forEach(([orderId, order]) => {
        if (String(order.table) === String(id)) serviceCanonicalOrders.delete(orderId);
      });
      tableOrders[id] = [];
      publishServiceTableState(id, t.status, t.covers, false);
      activeTableId = id;
      newTableId = null;
      if (confirm) confirm.disabled = false;
      renderTableDetail();
      showScreen('screen-table');
      lucide.createIcons();
    }
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

    function serviceTableKitchenLocked(id) {
      return Array.from(serviceCanonicalOrders.values()).some(order =>
        String(order.table) === String(id) && ['accepted', 'ready', 'served'].includes(order.status))
        || (tableOrders[id] || []).some(line => !line.sourceCanonical && Number(line.sentQty) > 0);
    }

    function openTransferTableModal(tableId) {
      trfFromId = tableId;
      trfSelectedToId = null;
      $('#trf-from-id').textContent = tableId;
      const btnText = $('#trf-btn-text');
      if (btnText) btnText.textContent = 'Déplacer';
      const confirmBtn = $('#trf-confirm');
      if (confirmBtn) confirmBtn.disabled = true;
      renderTransferTableGrid();
      $('#transfer-table-modal').classList.add('is-open');
      lucide.createIcons();
    }

    function renderTransferTableGrid() {
      const grid = $('#trf-target-grid');
      if (!grid) return;
      const freeTables = Object.keys(tables).filter(id => id !== trfFromId && tables[id] && tables[id].status === 'khawya');
      if (!freeTables.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:var(--ink-3);font-size:13px;">Aucune table libre disponible actuellement.</div>';
        return;
      }
      grid.innerHTML = freeTables.map(id => {
        const t = tables[id];
        const isSel = id === trfSelectedToId;
        return `
          <div class="trf-target-card ${isSel ? 'is-selected' : ''}" data-trf-to="${id}">
            <div class="trf-tname">${id}</div>
            <div class="trf-tmeta">${t.covers || 2} pl. · Libre</div>
          </div>
        `;
      }).join('');
    }

    async function confirmTransferTable() {
      if (!trfFromId || !trfSelectedToId) return;
      const from = trfFromId;
      const to = trfSelectedToId;
      const confirmBtn = $('#trf-confirm');
      if (confirmBtn) confirmBtn.disabled = true;

      const fromT = tables[from];
      const toT = tables[to];
      if (!fromT || !toT) return;

      if (!SV_DEMO) {
        try {
          const res = await fetch('/api/order/queue', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merchant: svSlug(),
              transferTable: { from, to, covers: fromT.covers, server: activeRole.fullName || activeRole.name || '',
                operationId: 'ui-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
                expectedSession: serviceTableSessions.get(from) || '',
                expectedRevision: serviceTableSessionRevisions.get(from) || 0 }
            })
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || 'transfer-failed');
          serviceTableSessionRevisions.set(to, Number(data.revision) || (serviceTableSessionRevisions.get(from) || 0));
        } catch (err) {
          if (confirmBtn) confirmBtn.disabled = false;
          toast(`Déplacement impossible : ${err.message === 'table-kitchen-locked' ? 'commande déjà envoyée en cuisine' : (err.message || 'erreur réseau')}`, 4800);
          return;
        }
      }

      // Local State Migration
      toT.status = fromT.status;
      toT.covers = fromT.covers;
      toT.elapsed = fromT.elapsed;
      toT.orderNo = fromT.orderNo;
      tableOrders[to] = tableOrders[from] || [];
      if (dirtyOrders.has(from)) {
        dirtyOrders.delete(from);
        dirtyOrders.add(to);
      }
      if (tableSplits.has(from)) {
        tableSplits.set(to, tableSplits.get(from));
        tableSplits.delete(from);
      }
      // L'acompte suit la visite déplacée, comme son partage.
      if (serviceVisitCredit.has(from)) serviceVisitCredit.set(to, serviceVisitCredit.get(from));
      else serviceVisitCredit.delete(to);
      serviceVisitCredit.delete(from);
      if (serviceTableSessions.has(from)) {
        const movedRevision = serviceTableSessionRevisions.get(to) || serviceTableSessionRevisions.get(from) || 0;
        serviceTableSessions.set(to, serviceTableSessions.get(from));
        serviceTableSessionRevisions.set(to, movedRevision);
        serviceTableSessions.delete(from);
        serviceTableSessionRevisions.delete(from);
      }

      // Reset Source Table
      fromT.status = 'khawya';
      fromT.covers = 0;
      fromT.elapsed = 0;
      delete fromT.orderNo;
      delete tableOrders[from];

      // Update Canonical Orders cached on this device
      Array.from(serviceCanonicalOrders.values()).forEach(order => {
        if (order && String(order.table) === String(from)) order.table = to;
      });

      publishServiceTableState(from, 'khawya', 0, false);
      publishServiceTableState(to, toT.status, toT.covers, false);

      $('#transfer-table-modal').classList.remove('is-open');
      activeTableId = to;
      toast(`Table ${from} déplacée vers Table ${to}`);
      renderTableDetail();
      if (currentTab === 'tables') renderTables();
    }

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

    function openMergeTableModal(tableId) {
      mrgSourceId = tableId;
      mrgSelectedTargetId = null;
      $('#mrg-source-id').textContent = tableId;
      const btnText = $('#mrg-btn-text');
      if (btnText) btnText.textContent = 'Fusionner';
      const confirmBtn = $('#mrg-confirm');
      if (confirmBtn) confirmBtn.disabled = true;
      renderMergeTableGrid();
      $('#merge-table-modal').classList.add('is-open');
      lucide.createIcons();
    }

    function renderMergeTableGrid() {
      const grid = $('#mrg-target-grid');
      if (!grid) return;
      // Other active tables
      const otherTables = Object.keys(tables).filter(id => id !== mrgSourceId && tables[id] && tables[id].status !== 'khawya' && tables[id].status !== 'khlass');
      if (!otherTables.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:var(--ink-3);font-size:13px;">Aucune autre table active à fusionner.</div>';
        return;
      }
      grid.innerHTML = otherTables.map(id => {
        const t = tables[id];
        const isSel = id === mrgSelectedTargetId;
        return `
          <div class="trf-target-card ${isSel ? 'is-selected' : ''}" data-mrg-target="${id}">
            <div class="trf-tname">${id}</div>
            <div class="trf-tmeta">${t.covers || 2} cvts · ${employeeTranslation(statusLabel[t.status] || t.status)}</div>
          </div>
        `;
      }).join('');
    }

    async function confirmMergeTable() {
      if (!mrgSourceId || !mrgSelectedTargetId) return;
      const source = mrgSourceId;
      const target = mrgSelectedTargetId;
      const confirmBtn = $('#mrg-confirm');
      if (confirmBtn) confirmBtn.disabled = true;

      const sourceT = tables[source];
      const targetT = tables[target];
      if (!sourceT || !targetT) return;

      let merged = null;
      if (!SV_DEMO) {
        try {
          const res = await fetch('/api/order/queue', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merchant: svSlug(),
              mergeTables: { targetTable: target, sourceTable: source, server: activeRole.fullName || activeRole.name || '',
                operationId: 'ui-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
                expectedSession: serviceTableSessions.get(source) || '',
                expectedRevision: serviceTableSessionRevisions.get(source) || 0 }
            })
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || 'merge-failed');
          merged = data;
        } catch (err) {
          if (confirmBtn) confirmBtn.disabled = false;
          toast(`Fusion impossible : ${err.message === 'table-kitchen-locked' ? 'commande déjà envoyée en cuisine' : (err.message || 'erreur réseau')}`, 4800);
          return;
        }
      }

      // Merge order lines
      const sourceLines = tableOrders[source] || [];
      const targetLines = tableOrders[target] || [];
      tableOrders[target] = targetLines.concat(sourceLines);
      targetT.covers = (targetT.covers || 0) + (sourceT.covers || 0);

      if (dirtyOrders.has(source)) {
        dirtyOrders.delete(source);
        dirtyOrders.add(target);
      }

      /* Ce qui a déjà été payé sur l'une ou l'autre table suit la visite
         fusionnée : on facture le reste que le serveur vient de calculer, et
         les partages en cours, bâtis sur l'ancienne addition de chaque table,
         n'ont plus de sens. Un partage repris rejouerait des parts déjà
         payées ; un nouveau partage se fait sur le reste. */
      if (merged && Number.isFinite(Number(merged.creditCents))) {
        if (Number(merged.creditCents) > 0) serviceVisitCredit.set(target, Math.round(Number(merged.creditCents)));
        else serviceVisitCredit.delete(target);
      }
      serviceVisitCredit.delete(source);
      [source, target].forEach((id) => {
        tableSplits.delete(id);
        const session = serviceTableSessions.get(id);
        if (!session || SV_DEMO) return;
        try {
          const refs = empPayRefsRead(), key = 'split:' + empPayRefKey('visit') + ':' + session;
          if (refs[key]) { delete refs[key]; localStorage.setItem(EMP_PAY_REFS_KEY, JSON.stringify(refs)); }
        } catch (_) {}
      });

      // Clear Source Table
      sourceT.status = 'khawya';
      sourceT.covers = 0;
      sourceT.elapsed = 0;
      delete sourceT.orderNo;
      delete tableOrders[source];
      serviceTableSessions.delete(source);
      serviceTableSessionRevisions.delete(source);

      // Update Canonical Orders cached on this device
      Array.from(serviceCanonicalOrders.values()).forEach(order => {
        if (order && String(order.table) === String(source)) order.table = target;
      });

      publishServiceTableState(source, 'khawya', 0, true);
      publishServiceTableState(target, targetT.status, targetT.covers, false);

      $('#merge-table-modal').classList.remove('is-open');
      activeTableId = target;
      toast(`Table ${source} fusionnée dans Table ${target}`);
      renderTableDetail();
      if (currentTab === 'tables') renderTables();
    }

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
    function renderMenuContext() {
      const block = $('#menu-context-block');
      if (menuContextId) {
        const t = tables[menuContextId];
        block.innerHTML = `
          <div class="menu-context">
            <div class="menu-context-icon">${menuContextId}</div>
            <div class="menu-context-text">
              <div class="menu-context-line1">Commande pour ${menuContextId}</div>
              <div class="menu-context-line2">${t.covers} couvert${t.covers > 1 ? 's' : ''} · ajoutez des articles ci-dessous</div>
            </div>
            <button class="menu-context-close" id="menu-context-close" aria-label="Fermer">
              <i data-lucide="x"></i>
            </button>
          </div>
        `;
      } else {
        block.innerHTML = `
          <div class="menu-banner">
            <i data-lucide="info"></i>
            <div class="menu-banner-text">Sélectionnez une table d'abord pour ajouter des articles. Vous pouvez parcourir le menu pour information.</div>
          </div>
        `;
      }
      lucide.createIcons();
    }

    /* ── Une carte vide n'est pas une carte pas encore arrivée ─────────────
       « Carte pas encore composée » s'affichait AVANT la première réponse,
       et aussi quand le serveur était injoignable : le serveur lisait qu'il
       n'y avait rien à vendre. Trois états désormais : en chargement,
       injoignable, et réellement vide (le serveur a répondu sans plat). */
    function svMenuEmptyHTML() {
      const state = SV_DEMO ? 'empty' : svCarteState;
      if (state === 'empty' || state === 'ok') {
        return '<div class="menu-banner"><div class="menu-banner-text">Carte pas encore composée. ' +
          'Ajoutez vos catégories et vos plats depuis le tableau de bord · <b>Menu</b>.</div></div>';
      }
      if (state === 'error' || svKnownOffline()) {
        return '<div class="menu-banner is-down" role="status">' + SV_ICON_OFFLINE
          + '<div class="menu-banner-text">' + esc(employeeTranslation("Impossible de charger la carte. Elle s'affichera au retour du réseau.")) + '</div></div>';
      }
      return '<div class="menu-banner" role="status">' + SV_ICON_SYNC
        + '<div class="menu-banner-text">' + esc(employeeTranslation('Chargement de la carte…')) + '</div></div>';
    }

    function renderCatPills() {
      const counts = { all: menuItems.length };
      menuItems.forEach(m => { counts[m.cat] = (counts[m.cat] || 0) + 1; });
      const cats = catOrder;
      $('#cat-pills').innerHTML = cats.map(c => `
        <button class="cat-pill ${c === activeCat ? 'is-active' : ''}" data-cat="${esc(c)}">
          ${esc(window.KiwiMenuI18n ? window.KiwiMenuI18n.t(catLabels[c] || c, employeeLanguage) : (catLabels[c] || c))}<span class="count">${counts[c] || 0}</span>
        </button>
      `).join('');
      let row=$('#subcat-pills');
      if(!row){row=document.createElement('div');row.id='subcat-pills';row.className='cat-pills';row.addEventListener('click',e=>{const b=e.target.closest('[data-subcat]');if(!b)return;activeSub=b.dataset.subcat||null;renderCatPills();renderMenu();});$('#cat-pills').insertAdjacentElement('afterend',row);}
      const parent=svCats.find(c=>c.id===activeCat), subs=parent?(parent.sub||[]):[];
      row.hidden=activeCat==='all'||!subs.length;
      row.innerHTML=row.hidden?'':`<button class="cat-pill ${!activeSub?'is-active':''}" data-subcat="">Tout</button>`+subs.map(s=>`<button class="cat-pill ${activeSub===s.id?'is-active':''}" data-subcat="${esc(s.id)}">${esc(window.KiwiMenuI18n ? window.KiwiMenuI18n.t(s.name, employeeLanguage) : s.name)}<span class="count">${menuItems.filter(m=>m.cat===activeCat&&m.subId===s.id).length}</span></button>`).join('');
    }

    function renderMenu() {
      if (!menuItems.length) {
        $('#menu-grid').innerHTML = svMenuEmptyHTML();
        return;
      }
      const rawItems = activeCat === 'all' ? menuItems : menuItems.filter(m => m.cat === activeCat && (!activeSub || m.subId === activeSub));
      const items = rawItems.map(it => Object.assign({}, it, {
        name: window.KiwiMenuI18n ? window.KiwiMenuI18n.name(it, employeeLanguage) : it.name,
        subLabel: it.subLabel && window.KiwiMenuI18n ? window.KiwiMenuI18n.t(it.subLabel, employeeLanguage) : it.subLabel,
      }));
      const localizedCats = {};
      Object.keys(catLabels).forEach(k => {
        localizedCats[k] = window.KiwiMenuI18n ? window.KiwiMenuI18n.t(catLabels[k], employeeLanguage) : catLabels[k];
      });
      const activeOrder = menuContextId ? (tableOrders[menuContextId] || []) : [];
      $('#menu-grid').innerHTML = items.map(m => {
        const catLabels = localizedCats;
        // qty badge = total across every line of this dish (noted + plain)
        const qty = activeOrder.filter(c => c.id === m.id).reduce((s, c) => s + c.qty, 0);
        const control = qty > 0
          ? `<span class="menu-item-stepper">
               <button class="step-btn step-minus" type="button" data-step="dec" aria-label="${esc(m.name)} −1">−</button>
               <span class="step-num">${qty}</span>
               <button class="step-btn step-plus" type="button" data-step="inc" aria-label="${esc(m.name)} +1">+</button>
             </span>`
          : `<span class="menu-item-add">+</span>`;
        const tag = itemHasFormula(m.id)
          ? `<span class="menu-item-optflag">Formule</span>`
          : (itemHasOptions(m.id) ? `<span class="menu-item-optflag">${SLIDERS_SVG}Options</span>` : '');
        return `
          <div class="menu-item ${qty > 0 ? 'is-in-cart' : ''}" data-menu-id="${esc(m.id)}" role="button" tabindex="0">
            ${tag}
            <span class="menu-item-cat">${esc(catLabels[m.cat] || '')}</span>
            ${m.subLabel ? `<span class="menu-item-cat">${esc(m.subLabel)}</span>` : ''}
            <span class="menu-item-name">${esc(m.name)}</span>
            <span class="menu-item-foot">
              <span class="menu-item-price">${m.price} MAD</span>
              ${control}
            </span>
          </div>
        `;
      }).join('');
    }

    function renderCartBar() {
      svTouchDrafts();
      const bar = $('#menu-cart-bar');
      if (!menuContextId || currentTab !== 'menu') {
        bar.classList.remove('is-visible');
        svRenderPair(null);
        return;
      }
      const order = tableOrders[menuContextId] || [];
      const count = order.reduce((s, l) => s + l.qty, 0);
      const total = order.reduce((s, l) => s + l.price * l.qty, 0);
      if (count === 0) {
        bar.classList.remove('is-visible');
        try { window.KiwiPairs && KiwiPairs.reset('table:' + menuContextId); } catch (_) {}
        svRenderPair(null);
        return;
      }
      $('#mcb-count').textContent = count;
      $('#mcb-total').textContent = fmtMAD(total);
      bar.classList.add('is-visible');
      svRenderPair(order);
    }

    /* « Souvent avec… » : l'article que les tickets de ce commerce associent
       le plus souvent au dernier plat pris pour cette table (calcul serveur
       sur 28 jours, functions/api/pairs.js). Jamais un article déjà pris pour
       la table, jamais un article qu'on ne peut pas vendre seul en ce moment.
       Le « + » passe par le même chemin qu'un toucher sur la carte du plat. */
    function svPairSellable(id) {
      const src = svFormulaItems.find(m => String(m.id) === String(id)) || menuItems.find(m => String(m.id) === String(id));
      if (!src || src.archived || src.formulaOnly || src.avail === false) return false;
      return !!menuItems.find(m => String(m.id) === String(id));
    }
    function svRenderPair(order) {
      const chip = $('#menu-pair-chip');
      if (!chip) return;
      let s = null;
      if (order && order.length && !SV_DEMO && window.KiwiPairs && KiwiPairs.suggest) {
        const ids = order.filter(l => l && l.kind !== 'formula-part' && l.id != null).map(l => String(l.id));
        try { s = KiwiPairs.suggest(ids, svPairSellable, 'table:' + menuContextId); } catch (_) { s = null; }
      }
      const m = s && menuItems.find(x => String(x.id) === s.id);
      const lead = s && menuItems.find(x => String(x.id) === s.lead);
      if (!m || !lead) { chip.hidden = true; chip.innerHTML = ''; return; }
      const pct = Math.round((Number(s.share) || 0) * 100);
      const name = (x) => esc(svLineName(x));
      /* Dans la langue de l'employé ; les noms de plats passent par
         KiwiMenuI18n comme les lignes de la commande (svLineName). */
      const t = KiwiPairs.say ? KiwiPairs.say(employeeLanguage) : null;
      if (!t) { chip.hidden = true; chip.innerHTML = ''; return; }
      chip.innerHTML = `
        <span class="menu-pair-txt">${t.lead(name(lead), name(m))}</span>
        <span class="menu-pair-why">${t.why(pct, name(lead))}</span>
        <button type="button" class="menu-pair-add" data-pair-add="${esc(m.id)}" aria-label="${t.add(name(m))}">+ ${fmtMAD(m.price)}</button>
        <button type="button" class="menu-pair-x" data-pair-dismiss="${esc(m.id)}" aria-label="${t.dismiss(name(m), 'table')}">×</button>`;
      chip.hidden = false;
    }

    function addToTableOrder(tableId, itemId) {
      if (!tableOrders[tableId]) tableOrders[tableId] = [];
      const source = svFormulaItems.find(m => String(m.id) === String(itemId)) || menuItems.find(m => String(m.id) === String(itemId));
      if (source && (source.archived || source.formulaOnly || source.avail === false)) { toast('Article non vendable individuellement'); return; }
      const item = menuItems.find(m => m.id === itemId);
      if (!item) return;
      // Stack onto the un-noted line; a noted line splits off so it keeps its note.
      /* Never increase a line hydrated from caisse/the order ledger. A later
         queue reconciliation replaces those rows, so the added quantity would
         disappear or be re-counted. New taps live in an explicit local draft
         until their own canonical ticket returns from /api/order/queue. */
      const priced = svPromoPrice(item, item.price);
      const line = tableOrders[tableId].find(l => l.sourceLocal === true && l.id === itemId && !(l.note || '').trim()
        && svPromoKey(l.promo) === svPromoKey(priced.promo));
      if (line) line.qty++;
      else tableOrders[tableId].push(Object.assign({ uid: newLineUid(), id: itemId, name: item.name, price: priced.price, basePrice: item.price, qty: 1, sentQty: 0, note: '', sourceLocal: true },
        priced.promo ? { promo: priced.promo } : null));
      markDirty(tableId);
      const card = document.querySelector(`.menu-item[data-menu-id="${itemId}"]`);
      if (card) { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
      renderMenu();
      renderCartBar();
    }

    /* ---------- Options sheet — forced before a dish with groups joins the order ---------- */
    let optDraft = null;  // { itemId, sel: { groupId: value | Set | bool } }

    function openOptionsSheet(itemId) {
      const item = menuItems.find(m => m.id === itemId);
      if (!item || !itemHasOptions(itemId)) return;
      optDraft = { itemId, sel: {} };
      itemOptions[itemId].forEach(g => {
        const kind = optionGroups[g].kind;
        optDraft.sel[g] = kind === 'multi' ? new Set() : (kind === 'toggle' ? false : null);
      });
      renderOptionsSheet(false);
      $('#opt-modal').classList.add('is-open');
    }

    function closeOptionsSheet() {
      $('#opt-modal').classList.remove('is-open');
      optDraft = null;
    }

    function renderOptionsSheet(showMissing) {
      if (!optDraft) return;
      const item = menuItems.find(m => m.id === optDraft.itemId);
      const groupsHTML = itemOptions[optDraft.itemId].map(g => {
        const def = optionGroups[g], sel = optDraft.sel[g], required = isReq(def);
        const unmet = showMissing && required && sel == null;
        const pills = def.vals.map(v => {
          const on = def.kind === 'multi' ? sel.has(v.n)
                   : def.kind === 'toggle' ? sel === true
                   : sel === v.n;
          const valLabel = window.KiwiMenuI18n ? window.KiwiMenuI18n.t(v.n, employeeLanguage) : v.n;
          return `<button class="opt-pill ${on ? 'on' : ''}" data-opt-group="${g}" data-opt-val="${esc(v.n)}">${v.emoji ? `${esc(v.emoji)} ` : ''}${esc(valLabel)}${v.p ? `<span class="opt-pr">+${v.p}</span>` : ''}</button>`;
        }).join('');
        const grpLabel = window.KiwiMenuI18n ? window.KiwiMenuI18n.t(def.name, employeeLanguage) : def.name;
        return `
          <div class="opt-group ${unmet ? 'missing' : ''}">
            <div class="opt-group-head">
              <span class="opt-group-name">${esc(grpLabel)}</span>
              <span class="opt-group-tag ${required ? 'req' : 'opt'}">${required ? (employeeLanguage === 'ar' ? 'إجباري' : (employeeLanguage === 'en' ? 'Required' : 'Obligatoire')) : (employeeLanguage === 'ar' ? 'اختياري' : (employeeLanguage === 'en' ? 'Optional' : 'Optionnel'))}</span>
            </div>
            <div class="opt-vals">${pills}</div>
          </div>`;
      }).join('');
      const extra = optsExtra(optsFromSel(optDraft.itemId, optDraft.sel));
      const total = item.price + extra;
      const itemLabel = window.KiwiMenuI18n ? window.KiwiMenuI18n.t(item.name, employeeLanguage) : item.name;
      $('#opt-modal-body').innerHTML = `
        <h3 class="modal-title">${esc(itemLabel)}</h3>
        <p class="modal-subtle">${item.price} MAD${extra ? ` · +${extra} MAD d'options` : ''} · personnalisez avant d'ajouter à la commande</p>
        ${groupsHTML}
        <div class="opt-foot">
          <button class="td-btn ghost" id="opt-cancel">${employeeLanguage === 'ar' ? 'إلغاء' : (employeeLanguage === 'en' ? 'Cancel' : 'Annuler')}</button>
          <button class="td-btn primary" id="opt-confirm">${employeeLanguage === 'ar' ? 'إضافة' : (employeeLanguage === 'en' ? 'Add' : 'Ajouter')} · ${fmtMAD(total)}</button>
        </div>`;
    }

    function confirmOptions() {
      if (!optDraft || !menuContextId) return;
      const missing = itemOptions[optDraft.itemId].some(g => isReq(optionGroups[g]) && optDraft.sel[g] == null);
      if (missing) { renderOptionsSheet(true); toast('Choisissez les options obligatoires'); return; }
      const item = menuItems.find(m => m.id === optDraft.itemId);
      const opts = optsFromSel(optDraft.itemId, optDraft.sel);
      addConfiguredLine(menuContextId, item, opts);
      closeOptionsSheet();
    }

    /* Push a configured line (stacking identical configs that have no manual note). */
    function addConfiguredLine(tableId, item, opts) {
      if (!tableOrders[tableId]) tableOrders[tableId] = [];
      const priced = svPromoPrice(item, item.price + optsExtra(opts));
      const price = priced.price;
      const sig = optsSig(opts);
      const line = tableOrders[tableId].find(l => l.sourceLocal === true && l.id === item.id && !(l.note || '').trim() && (l.optsSig || '') === sig
        && svPromoKey(l.promo) === svPromoKey(priced.promo));
      if (line) line.qty++;
      else tableOrders[tableId].push(Object.assign({ uid: newLineUid(), id: item.id, name: item.name, price, basePrice: item.price, qty: 1, sentQty: 0, note: '', opts, optsSig: sig, sourceLocal: true },
        priced.promo ? { promo: priced.promo } : null));
      markDirty(tableId);
      const card = Array.from(document.querySelectorAll('.menu-item'))
        .find((node) => node.dataset.menuId === String(item.id));
      if (card) { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
      renderMenu();
      renderCartBar();
      toast(`${item.name} ajouté${opts.length ? ' · ' + optsSummary(opts) : ''}`);
    }

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

    function itemHasFormula(itemId) {
      const it = menuItems.find(m => m.id === itemId);
      return !!(it && it.formula && Array.isArray(it.formula.slots) && it.formula.slots.length);
    }

    function isFmlSlotSatisfied(slot, selSet) {
      const count = selSet ? selSet.size : 0;
      const min = slot.min != null ? slot.min : 1;
      return count >= min;
    }

    function isFmlUnitSatisfied(slots, uSlots, uIdx) {
      return slots.every(s => isFmlSlotSatisfied(s, uSlots[s.id]))
        && (uIdx == null || !fmlChildMissing(slots, uSlots, uIdx));
    }

    /* ── LE CAFÉ INCLUS A AUSSI SA QUESTION ─────────────────────────────
       Browse, 2026-10-05 : l'Espresso d'une formule brunch porte, vendu seul,
       un choix obligatoire « Hot or Ice ». La feuille de formule ne le posait
       pas, donc le bar recevait « Espresso » sans savoir s'il était glacé (et
       le serveur refusait la commande avant 5fb4d383). La question est posée
       ici, sous le choix, pour chaque article inclus qui porte un choix unique
       obligatoire. Pas de prix affiché : un article inclus ne facture pas ses
       options (functions/api/order/_lib.js · formula-part à 0). */
    function fmlChildGroups(chosenId) {
      const pool = typeof svFormulaItems !== 'undefined' ? svFormulaItems : menuItems;
      const it = pool.find(x => x.id === chosenId);
      const groups = typeof optionGroups !== 'undefined' ? optionGroups : {};
      const ids = it && Array.isArray(it.opts) && it.opts.length ? it.opts
        : ((typeof itemOptions !== 'undefined' && itemOptions[chosenId]) || []);
      return ids.filter(g => groups[g] && groups[g].kind === 'radio' && isReq(groups[g]));
    }
    function fmlChildSel(uIdx, slotId, itemId) {
      const unit = (fmlDraft.childSel[uIdx] = fmlDraft.childSel[uIdx] || {});
      const key = slotId + '|' + itemId;
      return (unit[key] = unit[key] || {});
    }
    function fmlChildMissing(slots, uSlots, uIdx) {
      return slots.some(s => Array.from(uSlots[s.id] || []).some(itemId => {
        const chosen = fmlChildSel(uIdx, s.id, itemId);
        return fmlChildGroups(itemId).some(g => !chosen[g]);
      }));
    }
    function fmlChildOptsHTML(slot, sel, uIdx, showMissing) {
      const pool = typeof svFormulaItems !== 'undefined' ? svFormulaItems : menuItems;
      return Array.from(sel || []).map(itemId => {
        const groups = fmlChildGroups(itemId);
        if (!groups.length) return '';
        const chItem = pool.find(x => x.id === itemId);
        const chosen = fmlChildSel(uIdx, slot.id, itemId);
        return groups.map(g => {
          const def = optionGroups[g];
          const pills = def.vals.map(v => `<button type="button" class="opt-pill ${chosen[g] === v.n ? 'on' : ''}" data-fml-child="${esc(slot.id + '|' + itemId)}" data-fml-child-group="${esc(g)}" data-fml-child-val="${esc(v.n)}">${v.emoji ? `${esc(v.emoji)} ` : ''}${esc(v.n)}</button>`).join('');
          return `<div class="opt-group fml-child-opts ${showMissing && !chosen[g] ? 'missing' : ''}"><div class="opt-group-head"><span class="opt-group-name">${esc(chItem ? chItem.name : '')} · ${esc(def.name)}</span><span class="opt-group-tag req">Obligatoire</span></div><div class="opt-vals">${pills}</div></div>`;
        }).join('');
      }).join('');
    }

    function isFmlDraftSatisfied() {
      if (!fmlDraft) return false;
      const item = menuItems.find(m => m.id === fmlDraft.itemId);
      if (!item || !item.formula || !item.formula.slots) return false;
      const slots = item.formula.slots;
      return fmlDraft.units.every((uSlots, uIdx) => isFmlUnitSatisfied(slots, uSlots, uIdx));
    }

    function computeFmlUnitExtra(slots, uSlots) {
      let extra = 0;
      slots.forEach(s => {
        const sel = uSlots[s.id];
        if (sel) {
          (s.choices || []).forEach(ch => {
            if (sel.has(ch.itemId)) extra += (Number(ch.extra) || 0);
          });
        }
      });
      return extra;
    }

    function openFormulaSheet(itemId, qty = 1) {
      const item = menuItems.find(m => m.id === itemId);
      if (!item || !itemHasFormula(itemId)) return;
      const slots = item.formula.slots;
      const count = Math.max(1, qty || 1);
      const units = [];

      for (let u = 0; u < count; u++) {
        const uSlots = {};
        slots.forEach(s => {
          const sel = new Set();
          if (s.choices && s.choices.length === 1) {
            const ch = s.choices[0];
            const chItem = (typeof svFormulaItems !== 'undefined' ? svFormulaItems : menuItems).find(x => x.id === ch.itemId);
            if (chItem && chItem.avail !== false) {
              sel.add(ch.itemId);
            }
          }
          uSlots[s.id] = sel;
        });
        units.push(uSlots);
      }

      const firstIncomplete = slots.find(s => (units[0][s.id] ? units[0][s.id].size : 0) < (s.min != null ? s.min : 1));

      fmlDraft = {
        itemId,
        tableId: menuContextId,
        totalUnits: count,
        activeUnit: 0,
        activeSlotId: firstIncomplete ? firstIncomplete.id : (slots[0] && slots[0].id),
        collapsedSlots: {},
        units,
        childSel: units.map(() => ({})),
        optSel: {},
      };

      const formulaOptionIds = typeof itemOptions !== 'undefined' ? (itemOptions[itemId] || []) : [];
      formulaOptionIds.forEach(g => {
        const kind = optionGroups[g].kind;
        fmlDraft.optSel[g] = kind === 'multi' ? new Set() : (kind === 'toggle' ? false : null);
      });

      slots.forEach(s => {
        if (s.choices && s.choices.length === 1) {
          if (!fmlChildGroups(s.choices[0].itemId).length) fmlDraft.collapsedSlots[s.id] = true;
        }
      });

      renderFormulaSheet(false);
      $('#formula-modal').classList.add('is-open');
    }

    function closeFormulaSheet() {
      $('#formula-modal').classList.remove('is-open');
      fmlDraft = null;
    }

    function renderFormulaSheet(showMissing) {
      if (!fmlDraft) return;
      const item = menuItems.find(m => m.id === fmlDraft.itemId);
      if (!item || !item.formula) return;
      const slots = item.formula.slots;
      const curUnitSlots = fmlDraft.units[fmlDraft.activeUnit] || {};

      let unitsBarHTML = '';
      if (fmlDraft.totalUnits > 1) {
        const tabsHTML = Array.from({ length: fmlDraft.totalUnits }, (_, i) => {
          const satisfied = isFmlUnitSatisfied(slots, fmlDraft.units[i], i);
          return `<button type="button" class="fml-unit-tab ${i === fmlDraft.activeUnit ? 'active' : ''}" data-fml-unit="${i}">Portion ${i + 1}${satisfied ? ' ✓' : ''}</button>`;
        }).join('');
        unitsBarHTML = `
          <div class="fml-units-bar">
            <div class="fml-units-tabs">${tabsHTML}</div>
            ${fmlDraft.activeUnit === 0 ? `<button type="button" class="fml-same-btn" data-fml-same="1">Même chose pour tous</button>` : ''}
          </div>`;
      }

      const slotsHTML = slots.map((s, idx) => {
        const sel = curUnitSlots[s.id] || new Set();
        const min = s.min != null ? s.min : 1;
        const max = s.max != null ? s.max : 1;
        const satisfied = sel.size >= min;
        const unmet = showMissing && !satisfied;
        const isSingle = s.choices && s.choices.length === 1;
        const isCollapsed = fmlDraft.collapsedSlots[s.id] && isSingle && sel.size === 1;

        if (isCollapsed) {
          const ch = s.choices[0];
          const chItem = (typeof svFormulaItems !== 'undefined' ? svFormulaItems : menuItems).find(x => x.id === ch.itemId);
          const chName = chItem ? chItem.name : 'Option indisponible';
          const extraTxt = ch.extra ? `+${ch.extra} MAD` : 'inclus';
          return `
            <div class="fml-slot">
              <div class="fml-slot-head">
                <span class="fml-slot-title">${esc(s.label || `Étape ${idx + 1}`)}</span>
                <span class="fml-slot-badge req">Sélectionné</span>
              </div>
              <div class="fml-slot-collapsed" data-fml-expand="${s.id}">
                <span>${esc(chName)} · ${esc(extraTxt)}</span>
                <span style="font-size:11px;text-decoration:underline;">Modifier</span>
              </div>
            </div>`;
        }

        const chips = (s.choices || []).map(ch => {
          const chItem = (typeof svFormulaItems !== 'undefined' ? svFormulaItems : menuItems).find(x => x.id === ch.itemId);
          const chName = chItem ? chItem.name : 'Option indisponible';
          const avail = chItem ? (chItem.avail !== false) : false;
          const on = sel.has(ch.itemId);
          const extraTxt = ch.extra ? `+${ch.extra} MAD` : 'inclus';
          return `
            <button type="button" class="fml-chip ${on ? 'on' : ''} ${!avail ? 'disabled' : ''}"
              data-fml-slot="${s.id}" data-fml-item="${ch.itemId}" ${!avail ? 'disabled' : ''}>
              <span>${esc(chName)}</span>
              <span class="fml-extra">${esc(extraTxt)}</span>
            </button>`;
        }).join('');

        const badgeText = min === max ? (min === 1 ? '1 choix' : `${min} choix`) : `${min} à ${max} choix`;

        return `
          <div class="fml-slot ${s.id === fmlDraft.activeSlotId ? 'active' : ''} ${unmet ? 'missing' : ''}" data-fml-slot-box="${s.id}">
            <div class="fml-slot-head">
              <span class="fml-slot-title">${esc(s.label || `Étape ${idx + 1}`)}</span>
              <span class="fml-slot-badge ${satisfied ? 'req' : ''}">${esc(badgeText)}${satisfied ? ' · ✓' : ''}</span>
            </div>
            <div class="fml-chips">${chips}</div>
            ${fmlChildOptsHTML(s, sel, fmlDraft.activeUnit, showMissing)}
          </div>`;
      }).join('');

      let grandTotal = 0;
      fmlDraft.units.forEach(uSlots => {
        grandTotal += item.price + computeFmlUnitExtra(slots, uSlots);
      });

      const allSatisfied = isFmlDraftSatisfied();
      const optionIds = typeof itemOptions !== 'undefined' ? (itemOptions[fmlDraft.itemId] || []) : [];
      const optionsSatisfied = optionIds.every(g => {
        if (!isReq(optionGroups[g])) return true;
        const sel = fmlDraft.optSel[g];
        return sel instanceof Set ? sel.size > 0 : sel != null && sel !== false;
      });
      const optionsHTML = optionIds.map(g => {
        const def=optionGroups[g], sel=fmlDraft.optSel[g], required=isReq(def);
        const pills=def.vals.map(v=>{const on=def.kind==='multi'?sel.has(v.n):def.kind==='toggle'?sel===true:sel===v.n;return `<button class="opt-pill ${on?'on':''}" data-fml-opt-group="${g}" data-fml-opt-val="${esc(v.n)}">${v.emoji?`${esc(v.emoji)} `:''}${esc(v.n)}${v.p?`<span class="opt-pr">+${v.p}</span>`:''}</button>`;}).join('');
        return `<div class="opt-group ${showMissing&&required&&!optionsSatisfied?'missing':''}"><div class="opt-group-head"><span class="opt-group-name">${esc(def.name)}</span><span class="opt-group-tag ${required?'req':'opt'}">${required?'Obligatoire':'Optionnel'}</span></div><div class="opt-vals">${pills}</div></div>`;
      }).join('');
      const selectedOpts = optsFromSel(fmlDraft.itemId, fmlDraft.optSel);
      grandTotal += optsExtra(selectedOpts) * fmlDraft.totalUnits;

      $('#formula-modal-body').innerHTML = `
        <h3 class="modal-title">${esc(item.name)}</h3>
        <p class="modal-subtle">${item.price} MAD · Choisissez la formule et ses options</p>
        ${unitsBarHTML}
        ${slotsHTML}
        ${optionsHTML}
        <div class="fml-foot">
          <button type="button" class="td-btn ghost" id="fml-cancel">Annuler</button>
          <button type="button" class="td-btn primary" id="fml-confirm" ${allSatisfied && optionsSatisfied ? '' : 'disabled'}>
            Ajouter · ${fmtMAD(grandTotal)}
          </button>
        </div>`;
    }

    function confirmFormula() {
      if (!fmlDraft || !menuContextId) return;
      if (!isFmlDraftSatisfied()) {
        renderFormulaSheet(true);
        toast('Complétez tous les choix obligatoires');
        return;
      }
      const item = menuItems.find(m => m.id === fmlDraft.itemId);
      if (!item || !item.formula) return;
      const slots = item.formula.slots;
      const tableId = menuContextId;
      const opts = typeof optsFromSel === 'function' ? optsFromSel(fmlDraft.itemId, fmlDraft.optSel) : [];
      const formulaOptionIds = typeof itemOptions !== 'undefined' ? (itemOptions[fmlDraft.itemId] || []) : [];
      if (formulaOptionIds.some(g => isReq(optionGroups[g]) && (fmlDraft.optSel[g] instanceof Set ? !fmlDraft.optSel[g].size : fmlDraft.optSel[g] == null || fmlDraft.optSel[g] === false))) {
        renderFormulaSheet(true); toast('Choisissez les options obligatoires'); return;
      }

      if (!tableOrders[tableId]) tableOrders[tableId] = [];

      fmlDraft.units.forEach((uSlots, uIdx) => {
        const unitExtra = computeFmlUnitExtra(slots, uSlots);
        const rawUid = 'fml-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
        const formulaUid = fmlDraft.totalUnits > 1 ? `${rawUid}-${uIdx + 1}` : rawUid;

        // 1. Parent formula line
        const parentLine = {
          uid: newLineUid(),
          id: item.id,
          name: item.name,
          kind: 'formula',
          price: item.price + unitExtra + (typeof optsExtra === 'function' ? optsExtra(opts) : 0),
          basePrice: item.price,
          unitPrice: item.price + unitExtra + (typeof optsExtra === 'function' ? optsExtra(opts) : 0),
          qty: 1,
          sentQty: 0,
          formulaUid,
          formulaName: item.name,
          note: '',
          opts: opts.map(o => ({ ...o })),
          optsSig: typeof optsSig === 'function' ? optsSig(opts) : '',
          sourceLocal: true,
        };
        tableOrders[tableId].push(parentLine);

        // 2. Children lines (one per chosen item)
        slots.forEach(s => {
          const sel = uSlots[s.id];
          if (!sel) return;
          sel.forEach(chosenId => {
            const chItem = (typeof svFormulaItems !== 'undefined' ? svFormulaItems : menuItems).find(x => x.id === chosenId);
            const chName = chItem ? chItem.name : chosenId;
            const chStation = (chItem && chItem.station) || '';
            const chosen = fmlChildSel(uIdx, s.id, chosenId);
            const childOpts = fmlChildGroups(chosenId).filter(g => chosen[g])
              .map(g => ({ group: g, label: chosen[g], price: 0 }));
            const childLine = {
              uid: newLineUid(),
              id: chosenId,
              name: chName,
              kind: 'formula-part',
              price: 0,
              basePrice: 0,
              unitPrice: 0,
              qty: 1,
              sentQty: 0,
              station: chStation,
              formulaUid,
              formulaName: item.name,
              slotLabel: s.label || '',
              formulaSlotId: s.id,
              lineId: `${formulaUid}-${s.id}`,
              note: '',
              opts: childOpts,
              optsSig: typeof optsSig === 'function' ? optsSig(childOpts) : '',
              sourceLocal: true,
            };
            tableOrders[tableId].push(childLine);
          });
        });
      });

      markDirty(tableId);
      renderMenu();
      renderCartBar();
      toast(`${item.name} ajouté`);
      closeFormulaSheet();
    }

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
    function changeMenuQty(tableId, itemId, delta) {
      if (delta > 0) {
        if (itemHasFormula(itemId)) { openFormulaSheet(itemId); return; }
        if (itemHasOptions(itemId)) { openOptionsSheet(itemId); return; }
        addToTableOrder(tableId, itemId); return;
      }
      const lines = (tableOrders[tableId] || []).filter(l => l.id === itemId);
      const line = lines.find(l => !(l.note || '').trim()) || lines[lines.length - 1];
      if (!line) return;
      line.qty--;
      if (line.qty <= 0) tableOrders[tableId] = tableOrders[tableId].filter(l => l.uid !== line.uid && (!line.formulaUid || l.formulaUid !== line.formulaUid));
      markDirty(tableId);
      renderMenu();
      renderCartBar();
    }

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
      if (!serviceNotifications.length) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon"><i data-lucide="bell"></i></div>
            <h3>Aucune notification</h3>
            <p>Tables installées, commandes OrderPro, plats prêts et additions apparaîtront ici.</p>
          </div>`;
      } else {
        list.innerHTML = serviceNotifications.map((item) => `
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
          </button>`).join('');
        list.querySelectorAll('[data-notification-table]').forEach((button) => {
          button.addEventListener('click', () => {
            const id = serviceTableId(button.dataset.notificationTable);
            setTab('tables');
            if (id && tables[id]) { openTableDetail(id); }
          });
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
    function empPayRefsRead() {
      try {
        const raw = JSON.parse(localStorage.getItem(EMP_PAY_REFS_KEY) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
      } catch (_) { return {}; }
    }
    function empPayRefsWrite(map) {
      try { localStorage.setItem(EMP_PAY_REFS_KEY, JSON.stringify(map)); } catch (_) {}
    }
    /* Une clé par établissement : un serveur qui change de boutique ne doit pas
       rejouer l'identifiant d'une table portant le même numéro ailleurs. */
    function empPayRefKey(tableId) {
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug() || 'store';
      return merchant + '::' + String(tableId);
    }
    function employeePaymentId(tableId) {
      let id = employeePaymentRefs.get(tableId);
      if (!id) {
        const stored = empPayRefsRead();
        const saved = stored[empPayRefKey(tableId)];
        if (saved && typeof saved === 'string') {
          id = saved;
          employeePaymentRefs.set(tableId, id);
          return id;
        }
        const random = (window.crypto && window.crypto.randomUUID)
          ? window.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        /* The -emp suffix survives Live Link's bounded stable-id encoding and
           lets the caisse import employee settlements without replaying its own
           sales back into its local journal. */
        id = 'employee-' + String(random).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) + '-emp';
        employeePaymentRefs.set(tableId, id);
        stored[empPayRefKey(tableId)] = id;
        empPayRefsWrite(stored);
      }
      return id;
    }
    function employeePaymentRefForget(tableId) {
      employeePaymentRefs.delete(tableId);
      const stored = empPayRefsRead();
      if (stored[empPayRefKey(tableId)] == null) return;
      delete stored[empPayRefKey(tableId)];
      empPayRefsWrite(stored);
    }
    /* Le serveur a encaissé ce qui était dû au moment du paiement, mais une
       commande est arrivée entre-temps (un dessert entre deux parts d'un
       partage, une vente en file d'attente) : il solde les commandes payées et
       garde la table ouverte pour le reste. On ne libère donc rien : la table
       repasse en « addition demandée » avec le seul reste, et le prochain
       encaissement prend un identifiant neuf (rejouer l'ancien serait
       dédupliqué comme la même vente). */
    function keepServiceBillOpen(tableId, saved) {
      const t = tables[tableId];
      (Array.isArray(saved.settledOrders) ? saved.settledOrders : [])
        .forEach((orderId) => serviceCanonicalOrders.delete(String(orderId)));
      employeePaymentRefForget(tableId);
      employeePaymentsInFlight.delete(tableId);
      tableSplits.delete(tableId);
      const session = serviceTableSessions.get(tableId);
      if (session && !SV_DEMO) {
        try {
          const refs = empPayRefsRead(), key = 'split:' + empPayRefKey('visit') + ':' + session;
          if (refs[key]) { delete refs[key]; localStorage.setItem(EMP_PAY_REFS_KEY, JSON.stringify(refs)); }
        } catch (_) {}
      }
      if (t) t.status = 'bgha-ykhlass';
      try { reconcileCanonicalServiceBill(tableId); } catch (_) {}
      if (currentTab === 'tables') renderTables();
      if (activeTableId === tableId) renderTableDetail();
      const rest = Math.max(0, Number(saved.remainingCents) || 0) / 100;
      toast(`Table ${tableId} · reste ${fmtMADcents(rest)} : une commande est arrivée pendant l'encaissement`, 6500);
    }
    function employeePaymentRefsForgetAll() {
      employeePaymentRefs.clear();
      try { localStorage.removeItem(EMP_PAY_REFS_KEY); } catch (_) {}
    }
    let serviceClientRows = [];
    function renderPayClient() {
      const client = payTableId && tableClients.get(payTableId);
      $('#pc-client-label').textContent = client ? `${client.name} · ${Number(client.points) || 0} pts` : 'Client & fidélité';
    }
    function renderServiceClients() {
      const q = String($('#service-client-search').value || '').trim().toLowerCase();
      const rows = serviceClientRows.filter((c) => !q || String(c.name || '').toLowerCase().includes(q) || String(c.phone || '').includes(q));
      $('#service-client-list').innerHTML = rows.length ? rows.map((c) => `
        <button class="td-btn ghost sm" type="button" data-service-client="${esc(c.id)}" style="text-align:left;justify-content:space-between;">
          <span><strong>${esc(c.name || 'Client')}</strong><br><small>${esc(c.phone || '')}</small></span>
          <span class="mono">${Number(c.points) || 0} pts</span>
        </button>`).join('') : '<p class="modal-subtle">Aucun client trouvé.</p>';
    }
    function openServiceClients() {
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug();
      $('#service-client-modal').classList.add('is-open');
      $('#service-client-list').innerHTML = '<p class="modal-subtle">Chargement…</p>';
      fetch('/api/employee-clients?merchant=' + encodeURIComponent(merchant), {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
      }).then((r) => r.ok ? r.json() : null).then((data) => {
        serviceClientRows = data && Array.isArray(data.clients) ? data.clients : [];
        renderServiceClients();
      }).catch(() => { $('#service-client-list').innerHTML = '<p class="modal-subtle">Carnet indisponible.</p>'; });
    }
    function openPayChoice(tableId) {
      if (svBrowseGuard()) return;
      payTableId = tableId;
      $('#pc-table-id').textContent = tableId;
      $('#pc-total').textContent = fmtMAD(getTableTotal(tableId));
      renderPayClient();
      $('#pay-choice-modal').classList.add('is-open');
      lucide.createIcons();
    }
    function closePayChoice() {
      $('#pay-choice-modal').classList.remove('is-open');
    }
    $('#pay-choice-modal').addEventListener('click', (e) => {
      if (e.target.closest('#pc-client')) { openServiceClients(); return; }
      const choice = e.target.closest('[data-pay]');
      if (choice) {
        const method = choice.dataset.pay;
        closePayChoice();
        if (method === 'card')  openCardModal(payTableId);
        if (method === 'cash')  openCashModal(payTableId);
        if (method === 'split') openSplitModal(payTableId);
        return;
      }
      if (e.target.closest('#pc-cancel') || e.target === $('#pay-choice-modal')) {
        closePayChoice();
      }
    });
    $('#service-client-search').addEventListener('input', renderServiceClients);
    $('#service-client-modal').addEventListener('click', (e) => {
      const choice = e.target.closest('[data-service-client]');
      if (choice && payTableId) {
        const client = serviceClientRows.find((c) => String(c.id) === choice.dataset.serviceClient);
        if (client) tableClients.set(payTableId, client);
        $('#service-client-modal').classList.remove('is-open');
        renderPayClient();
        return;
      }
      if (e.target.closest('#service-client-none')) {
        if (payTableId) tableClients.delete(payTableId);
        $('#service-client-modal').classList.remove('is-open'); renderPayClient(); return;
      }
      if (e.target.closest('#service-client-close') || e.target === $('#service-client-modal')) {
        $('#service-client-modal').classList.remove('is-open');
      }
    });

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
    function cardReaderArm(tableId) {
      cardApproved = false;
      if (cardConfirmBtn) cardConfirmBtn.hidden = true;
      if (SV_DEMO) { cardSuccessTimer = setTimeout(() => triggerCardSuccess(tableId), 2000); return; }
      reader.disc.classList.remove('is-pulsing');
      reader.status.textContent = 'Encaissez sur le terminal carte, puis confirmez';
      reader.method.style.display = 'none';
      if (cardConfirmBtn) cardConfirmBtn.hidden = false;
    }
    if (cardConfirmBtn) cardConfirmBtn.addEventListener('click', () => triggerCardSuccess(payTableId));
    function openCardModal(tableId) {
      if (svBrowseGuard()) return;
      // Initial setup
      $$('[data-bind="table"]').forEach(el => el.textContent = tableId);
      const amount = currentPayAmount(tableId);
      $('#card-amount').textContent = fmtMADcents(amount);

      // Reset reader state
      reader.disc.classList.remove('is-success', 'flash');
      reader.disc.classList.add('is-pulsing');
      reader.disc.innerHTML = '<i data-lucide="credit-card"></i>';
      reader.status.classList.remove('is-success');
      reader.status.innerHTML = 'Approchez la carte ou le téléphone<span class="ellipsis"></span>';
      reader.method.style.display = '';
      reader.txn.hidden = true;
      reader.actions.classList.remove('is-visible');
      reader.foot.classList.remove('is-visible');

      // Mark table ka-tkhdam during payment (if it was bgha-ykhlass or ka-yaklo)
      if (tableId && !splitPayCallback && tables[tableId]) {
        const t = tables[tableId];
        if (t.status === 'bgha-ykhlass' || t.status === 'ka-yaklo') {
          t.status = 'ka-tkhdam';
          if (currentTab === 'tables') renderTables();
          if (activeTableId === tableId) renderTableDetail();
        }
      }

      cardModal.classList.add('is-open');
      lucide.createIcons();
      cardReaderArm(tableId);
    }

    function triggerCardSuccess(tableId) {
      reader.disc.classList.remove('is-pulsing');
      reader.disc.classList.add('flash', 'is-success');
      reader.disc.innerHTML = '<i data-lucide="check"></i>';
      reader.status.classList.add('is-success');
      cardApproved = true;
      if (cardConfirmBtn) cardConfirmBtn.hidden = true;
      reader.method.style.display = 'none';
      if (SV_DEMO) {
        reader.status.textContent = 'Carte approuvée';
        reader.txn.textContent = 'TXN #KW-' + (28000 + Math.floor(Math.random()*999));
        reader.txn.hidden = false;
      } else {
        reader.status.textContent = 'Paiement carte confirmé';
      }
      lucide.createIcons();
      setTimeout(() => reader.disc.classList.remove('flash'), 600);
      cardFootTimer = setTimeout(() => reader.foot.classList.add('is-visible'), 1000);
    }

    function closeCardModal({ paid = false, tableId = null } = {}) {
      paid = paid && cardApproved; // Fermer ne vaut jamais confirmation du terminal.
      cardModal.classList.remove('is-open');
      clearTimeout(cardSuccessTimer);
      clearTimeout(cardFootTimer);
      // Cancelled mid-split flow → restore split modal
      if (!paid && splitPayCallback) {
        splitPayCallback = null;
        $('#split-modal').classList.add('is-open');
        return;
      }
      if (!paid) {
        if (tableId && tables[tableId]?.status === 'ka-tkhdam') {
          tables[tableId].status = 'bgha-ykhlass';
          if (currentTab === 'tables') renderTables();
        }
        /* Toujours relire la fiche : le sondage peut avoir ramené la table à
           « en cours » pendant que la feuille était ouverte, et la fiche
           restait alors bloquée sur « Paiement en cours… » sans bouton. */
        if (tableId && activeTableId === tableId) renderTableDetail();
        return;
      }
      if (splitPayCallback) {
        const cb = splitPayCallback;
        splitPayCallback = null;
        cb();
        return;
      }
      if (tableId) markTablePaid(tableId, 'card');
    }

    cardModal.addEventListener('click', (e) => {
      const action = e.target.closest('[data-modal-action]')?.dataset.modalAction;
      const tableId = payTableId;
      if (e.target === cardModal && !splitPayCallback) closeCardModal({ paid: cardApproved, tableId });
      if (action === 'close') closeCardModal({ paid: true, tableId });
    });

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

    function currentPayAmount(tableId) {
      if (cashAmountOverride !== null) return cashAmountOverride;
      if (!tableId) return 0;
      return getTableTotal(tableId);
    }
    function updateRendu() {
      const total = currentPayAmount(payTableId);
      const got = parseFloat(cashInput.value) || 0;
      const diff = got - total;
      cashRendu.classList.remove('is-positive', 'is-short');
      if (got >= total) {
        cashRendu.classList.toggle('is-positive', diff > 0);
        cashRenduVal.textContent = fmtMADcents(diff);
        cashConfirm.disabled = false;
      } else {
        cashRendu.classList.add('is-short');
        cashRenduVal.textContent = 'Manque ' + fmtMAD(total - got);
        cashConfirm.disabled = true;
      }
    }
    function openCashModal(tableId) {
      if (svBrowseGuard()) return;
      $$('[data-bind="table"]').forEach(el => el.textContent = tableId);
      cashSettled = false;
      if (!splitPayCallback) cashPay = null;
      cashStepInput.hidden = false;
      cashStepSuccess.hidden = true;
      const total = currentPayAmount(tableId);
      cashInput.value = total;
      $('#cash-amount').textContent = fmtMADcents(total);
      updateRendu();
      // mark ka-tkhdam if applicable
      if (tableId && !splitPayCallback && tables[tableId]) {
        const t = tables[tableId];
        if (t.status === 'bgha-ykhlass' || t.status === 'ka-yaklo') {
          t.status = 'ka-tkhdam';
          if (currentTab === 'tables') renderTables();
          if (activeTableId === tableId) renderTableDetail();
        }
      }
      cashModal.classList.add('is-open');
      lucide.createIcons();
      setTimeout(() => cashInput.focus(), 60);
    }
    function closeCashModal({ paid = false, tableId = null } = {}) {
      cashAmountOverride = null;
      if (!paid) { cashSettled = false; cashPay = null; }
      cashModal.classList.remove('is-open');
      // Cancelled mid-split flow → restore split modal
      if (!paid && splitPayCallback) {
        splitPayCallback = null;
        $('#split-modal').classList.add('is-open');
        return;
      }
      if (!paid) {
        if (tableId && tables[tableId]?.status === 'ka-tkhdam') {
          tables[tableId].status = 'bgha-ykhlass';
          if (currentTab === 'tables') renderTables();
        }
        /* Toujours relire la fiche : le sondage peut avoir ramené la table à
           « en cours » pendant que la feuille était ouverte, et la fiche
           restait alors bloquée sur « Paiement en cours… » sans bouton. */
        if (tableId && activeTableId === tableId) renderTableDetail();
        return;
      }
      cashSettled = false;
      cashPay = null;
      if (splitPayCallback) {
        const cb = splitPayCallback;
        splitPayCallback = null;
        cb();
        return;
      }
      /* La vente est déjà enregistrée par « Confirmer ». */
    }

    cashInput.addEventListener('input', updateRendu);
    $$('.cash-preset').forEach(b => b.addEventListener('click', () => {
      cashInput.value = (parseFloat(cashInput.value) || 0) + parseFloat(b.dataset.add);
      updateRendu();
    }));
    /* « Confirmer » ENREGISTRE la vente ; « Fermer » ne fait que fermer.
       Avant, l'écran disait « Espèces confirmées » dès « Confirmer », et la
       vente ne partait qu'au « Fermer » suivant : une app fermée, un
       téléphone verrouillé ou un appel entre les deux, et l'argent encaissé
       n'existait nulle part. Le succès ne s'affiche qu'une fois le serveur
       d'accord ; un refus laisse la feuille ouverte, montant intact. */
    let cashSettled = false;
    let cashPay = null;                      // paiement d'une part (addition partagée)
    cashConfirm.addEventListener('click', async () => {
      if (cashConfirm.dataset.busy === '1' || cashSettled) return;
      const tableId = payTableId;
      const total = currentPayAmount(tableId);
      const got = parseFloat(cashInput.value) || 0;
      cashConfirm.dataset.busy = '1';
      cashConfirm.disabled = true;
      let ok = false;
      try { ok = cashPay ? await cashPay() : (tableId ? await markTablePaid(tableId, 'cash') : false); }
      catch (_) { ok = false; }
      cashConfirm.dataset.busy = '';
      if (!ok) { updateRendu(); return; }
      cashSettled = true;
      cashStepInput.hidden = true;
      cashStepSuccess.hidden = false;
      cashSuccessRendu.textContent = fmtMADcents(got - total);
      lucide.createIcons();
    });
    cashModal.addEventListener('click', (e) => {
      const action = e.target.closest('[data-modal-action]')?.dataset.modalAction;
      const tableId = payTableId;
      if (e.target === cashModal) closeCashModal({ paid: cashSettled, tableId });
      if (action === 'close') closeCashModal({ paid: cashSettled, tableId });
    });

    /* ---------- Mark paid ---------- */
    const employeePaymentsInFlight = new Set();
    async function markTablePaid(id, method) {
      if (svBrowseGuard()) return false;
      const t = tables[id];
      if (!t || employeePaymentsInFlight.has(id)) return false;
      const hasUnsent = (tableOrders[id] || []).some((line) =>
        Math.max(0, Number(line.qty) || 0) > Math.max(0, Number(line.sentQty) || 0));
      if (hasUnsent || dirtyOrders.has(id)) {
        toast(`Table ${id} · envoyez d'abord la commande en cuisine`, 4800);
        return false;
      }
      const paidAmount = getTableTotal(id);
      const paidClient = tableClients.get(id);
      const paidLines = (tableOrders[id] || []).map((line) => {
        const item = ((typeof svFormulaItems !== 'undefined' && svFormulaItems.length) ? svFormulaItems : menuItems).find((candidate) => String(candidate.id) === String(line.id)) || menuItems.find((candidate) => String(candidate.id) === String(line.id));
        return {
          name: String(line.name || 'Article'), qty: Math.max(1, Number(line.qty) || 1),
          total: Math.max(0, Number(line.price) || 0) * Math.max(1, Number(line.qty) || 1),
          cat: item && item.cat ? String(catLabels[item.cat] || item.cat) : '',
        };
      });
      const paymentId = employeePaymentId(id);
      const orderRef = serviceTableOrderRef(id);
      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug();
      const canonical = Array.from(serviceCanonicalOrders.values()).find((order) => order && !order.paid
        && String(order.table) === String(id) && order.session);
      const session = serviceTableSessions.get(id) || (canonical && String(canonical.session)) || '';
      if (!merchant || !session || paidAmount <= 0) {
        toast(`Table ${id} · paiement impossible`, 4200);
        return false;
      }
      /* Hors ligne connu : échec immédiat, la table revient à « addition
         demandée », rien n'est écrit. */
      if (svKnownOffline()) {
        if (t.status === 'ka-tkhdam') t.status = 'bgha-ykhlass';
        if (currentTab === 'tables') renderTables();
        if (activeTableId === id) renderTableDetail();
        toast(SV_PAY_OFFLINE_MSG, 6000);
        return false;
      }
      employeePaymentsInFlight.add(id);
      const previousStatus = t.status;
      t.status = 'ka-tkhdam';
      if (currentTab === 'tables') renderTables();
      if (activeTableId === id) renderTableDetail();

      /* One server-confirmed settlement boundary. Previously postSale(), the
         floor close and the OrderPro-session close were three fire-and-forget
         calls; the phone showed “paid” even when D1 never received the sale.
         `/api/sale` now returns success only after the ledger and table are in
         agreement. Never free a table locally before that acknowledgement. */
      let saved = null;
      /* Délai réel (SV_PAY_TIMEOUT_MS). L'identifiant de paiement est stable :
         relancer après un délai rejoue la MÊME vente, jamais une seconde. */
      const payCtl = (typeof AbortController === 'function') ? new AbortController() : null;
      const payTimer = payCtl ? setTimeout(() => payCtl.abort(), SV_PAY_TIMEOUT_MS) : null;
      try {
        const response = await fetch('/api/sale', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          signal: payCtl ? payCtl.signal : undefined,
          body: JSON.stringify({
            id: paymentId, merchant, table: id, session, amount: paidAmount,
            amountCents: Math.round(paidAmount * 100),
            method: method || 'card', ts: Date.now(),
            label: orderRef,
            ref: orderRef, lines: paidLines,
          }),
        });
        saved = await response.json().catch(() => null);
        if (!response.ok || !saved || !saved.ok) throw Object.assign(new Error((saved && saved.error) || ('http-' + response.status)), { refused: true });
      } catch (err) {
        t.status = previousStatus === 'ka-tkhdam' ? 'bgha-ykhlass' : previousStatus;
        employeePaymentsInFlight.delete(id);
        if (currentTab === 'tables') renderTables();
        if (activeTableId === id) renderTableDetail();
        /* Refus du serveur, pas de réponse à temps (la vente a PU passer :
           on ne dit pas « non enregistré »), ou réseau tombé avant l'envoi. */
        /* Une carte a peut-être déjà été débitée au terminal : la relance rejoue
           la même vente (identifiant stable), repasser la carte la débiterait deux fois. */
        if (payCtl && payCtl.signal.aborted) toast((method || 'card') === 'card'
          ? `Table ${id} · paiement non confirmé, ne repassez pas la carte, réessayez`
          : `Table ${id} · paiement non confirmé, réessayez`, 6000);
        else if (err && !err.refused) toast(SV_PAY_OFFLINE_MSG, 6000);
        else toast(`Table ${id} · paiement non enregistré, réessayez`, 5200);
        return false;
      } finally {
        if (payTimer) clearTimeout(payTimer);
      }
      if (paidClient && !SV_DEMO) {
        fetch('/api/employee-clients', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          /* La fidélité se tire de LA vente que le serveur vient d'enregistrer
             (son montant vient de la base) : `saleId` lie les points à
             l'encaissement, et deux envois pour la même vente créditent une fois. */
          body: JSON.stringify({ merchant, clientId: paidClient.id, amount: paidAmount,
            saleId: String((saved && saved.id) || paymentId),
            ref: 'employee-payment:' + id + ':' + Date.now() }),
        }).then((r) => r.ok ? r.json() : null).then((data) => {
          if (data && data.ok && !data.replayed) toast(`${paidClient.name} · fidélité mise à jour`);
        }).catch(() => {});
      }
      if (saved && saved.billOpen) {
        keepServiceBillOpen(id, saved);
        return true;
      }
      tableClients.delete(id);
      t.status = 'khawya';
      t.covers = 0;
      t.elapsed = 0;
      delete t.orderNo;
      serviceTableSessions.delete(id);
      delete tableOrders[id];
      dirtyOrders.delete(id);
      tableSplits.delete(id);
      /* La vente est enregistrée mais l'état du plan de salle n'a pas pu
         s'écrire (verrou optimiste perdu sous charge). L'argent est en sécurité
         — c'est pour ça que le serveur répond désormais 200 — et il ne reste
         qu'à rattraper l'affichage : on repousse l'état libre de la table, ce
         que le document partagé accepte comme n'importe quel autre battement. */
      if (saved && saved.settlementPending) {
        publishServiceTableState(id, 'khawya', 0, true);
      }
      employeePaymentRefForget(id);
      employeePaymentsInFlight.delete(id);
      tablesPaid++;
      // Update views
      if (activeTableId === id) {
        returnToFloor();  // land on the floor, not a stale tab panel
      }
      if (currentTab === 'tables')   renderTables();
      if (currentTab === 'notifications') renderNotifications();
      if (currentTab === 'profil')   renderProfil();
      toast(`Table ${id} · réglée ✓`);
      return true;
    }

    /* ---------- SPLIT BILL ---------- */
    /* Regroupe l'addition par plat pour le partage. Deux plats du même nom à
       des prix différents (une formule avec ou sans supplément) se fondaient
       au prix du premier : chacun payait la moyenne et les lignes mentaient.
       Un autre prix garde sa propre carte et son nom de base. */
    function splitItemTotals(order) {
      const itemTotals = {};
      (order || []).forEach(l => {
        const unitPrice = Number(l.price) || 0;
        let key = l.name;
        if (itemTotals[key] && Math.round(itemTotals[key].unitPrice * 100) !== Math.round(unitPrice * 100)) key = `${l.name} · ${fmtMADcents(unitPrice)}`;
        if (!itemTotals[key]) itemTotals[key] = { totalQty: 0, unitPrice, ...(key !== l.name ? { baseName: l.name } : {}) };
        itemTotals[key].totalQty += l.qty;
      });
      return itemTotals;
    }
    const splitState = {
      tableId: null,
      total: 0,
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

    function saveSplitFlow(state = splitState) {
      if (!state.tableId || !state.flow) return;
      const saved = {
        mode: state.splitMode,
        total: state.total,
        parts: state.flow.parts,
        paidCount: state.flow.paidCount,
        id: state.flow.id,
      };
      tableSplits.set(state.tableId, saved);
      if (SV_DEMO) return true;
      const session = serviceTableSessions.get(state.tableId);
      if (!session) return false;
      // Avant tout envoi : le flux et ses parts survivent au recyclage iOS.
      try {
        const refs = empPayRefsRead(), key = 'split:' + empPayRefKey('visit') + ':' + session;
        for (const old of Object.keys(refs)) {
          if (old !== key && old.startsWith('split:' + empPayRefKey('visit') + ':')
            && Array.isArray(refs[old]?.parts) && refs[old].parts.every(p => p.paid)) delete refs[old];
        }
        refs[key] = saved;
        localStorage.setItem(EMP_PAY_REFS_KEY, JSON.stringify(refs));
        return true;
      } catch (_) { return false; }
    }

    function loadSplitFlow(tableId) {
      let saved = tableSplits.get(tableId);
      if (!saved && !SV_DEMO) {
        const session = serviceTableSessions.get(tableId);
        saved = session && empPayRefsRead()['split:' + empPayRefKey('visit') + ':' + session];
        if (saved && (!Array.isArray(saved.parts) || !saved.id || !saved.parts.length
          || saved.parts.some(p => !p || !Number.isFinite(p.amount) || p.amount < 0))) saved = null;
        if (saved) tableSplits.set(tableId, saved);
      }
      if (!saved) return false;
      splitState.tableId  = tableId;
      splitState.total    = saved.total;
      splitState.splitMode = saved.mode;
      splitState.flow = {
        parts: saved.parts,
        paidCount: saved.paidCount,
        id: saved.id,
      };
      return true;
    }
    function effectiveTipPct() {
      if (splitState.tipMode === 'autre') return splitState.customTipPct;
      return parseFloat(splitState.tipMode) || 0;
    }
    function openSplitModal(tableId) {
      const t = tables[tableId];

      // If a split is already in progress for this table, resume it
      // directly on the payment-flow screen (skip setup).
      if (tableSplits.has(tableId) || loadSplitFlow(tableId)) {
        loadSplitFlow(tableId);
        $('#split-table-label').textContent = tableId;
        $('#split-setup').hidden = true;
        $('#split-flow').hidden  = false;
        $('#split-all-done').hidden = true;
        $('#split-parts-list').style.opacity = '';
        // Keep ka-tkhdam status (it's already ka-tkhdam from when split was launched)
        renderSplitFlow();
        $('#split-modal').classList.add('is-open');
        lucide.createIcons();
        return;
      }

      const order = ensureTableOrder(tableId);
      // Aggregate per unique item name (so the pool shows one row per
      // dish with its remaining count, not one card per unit)
      const itemTotals = splitItemTotals(order);
      // Le reste dû : un acompte déjà encaissé sur la visite n'est pas repartagé.
      const total = getTableTotal(tableId);
      Object.assign(splitState, {
        tableId, total, itemTotals,
        splitMode: 'egal',
        numParts: Math.max(2, t.covers || 2),
        tipMode: '0', customTipPct: 0,
        numConvives: Math.max(2, t.covers || 2),
        perConvive: {}, activeConvive: 1, flow: null,
      });
      $('#split-table-label').textContent = tableId;
      $('#split-setup').hidden = false;
      $('#split-flow').hidden = true;
      $('#split-all-done').hidden = true;
      // mark ka-tkhdam
      if (t.status === 'bgha-ykhlass' || t.status === 'ka-yaklo') {
        t.status = 'ka-tkhdam';
        if (currentTab === 'tables') renderTables();
      }
      renderSplitSetup();
      $('#split-modal').classList.add('is-open');
      lucide.createIcons();
    }
    function closeSplitModal({ skipRevert = false } = {}) {
      // If a flow exists and isn't fully paid, persist it so the server
      // can resume later. Table stays ka-tkhdam during the suspended split.
      const hasUnfinishedFlow = splitState.flow && splitState.tableId
        && splitState.flow.paidCount < splitState.flow.parts.length;
      if (hasUnfinishedFlow) {
        saveSplitFlow();
      } else if (!skipRevert && splitState.tableId && !tableSplits.has(splitState.tableId)) {
        // Setup phase only (no flow launched) — revert ka-tkhdam to bgha-ykhlass
        const t = tables[splitState.tableId];
        if (t?.status === 'ka-tkhdam') t.status = 'bgha-ykhlass';
      }

      $('#split-modal').classList.remove('is-open');
      splitPayCallback = null;
      cashAmountOverride = null;

      // Refresh views so list/detail reflect the new state
      if (currentTab === 'tables') renderTables();
      if (currentTab === 'notifications') renderNotifications();
      if (activeTableId && $('#screen-table').classList.contains('is-active')) {
        renderTableDetail();
      }
    }
    function renderSplitSetup() {
      $$('[data-split-tab]').forEach(t => t.classList.toggle('is-active', t.dataset.splitTab === splitState.splitMode));
      $('#split-egal-content').hidden = splitState.splitMode !== 'egal';
      $('#split-article-content').hidden = splitState.splitMode !== 'article';
      if (splitState.splitMode === 'egal') {
        $('#split-launch').disabled = false;
        $('#split-launch').textContent = 'Lancer le split';
        $('#split-launch').title = '';
        renderPartsChips(); renderTipChips(); updateSplitSummary();
      } else {
        renderArticleMode();
      }
      lucide.createIcons();
    }

    /* ---- Par article helpers ---- */
    function remainingQty(itemName) {
      const total = splitState.itemTotals[itemName]?.totalQty || 0;
      let assigned = 0;
      for (const c in splitState.perConvive) {
        assigned += splitState.perConvive[c][itemName] || 0;
      }
      return total - assigned;
    }
    function conviveTotal(c) {
      const map = splitState.perConvive[c] || {};
      let sum = 0;
      for (const name in map) {
        sum += map[name] * (splitState.itemTotals[name]?.unitPrice || 0);
      }
      return sum;
    }
    function assignUnit(itemName) {
      if (!Number.isInteger(remainingQty(itemName)) || remainingQty(itemName) <= 0) return;
      const c = splitState.activeConvive;
      if (!splitState.perConvive[c]) splitState.perConvive[c] = {};
      splitState.perConvive[c][itemName] = (splitState.perConvive[c][itemName] || 0) + 1;
    }
    function unassignUnit(itemName) {
      const c = splitState.activeConvive;
      const map = splitState.perConvive[c];
      if (!map || !map[itemName]) return;
      map[itemName]--;
      if (map[itemName] <= 0) delete map[itemName];
    }

    /* ---- Par article renderers ---- */
    function renderArticleMode() {
      renderConvivesChips();
      renderConvivesTabs();
      renderPool();
      renderConviveCart();
      const allocation = splitArticleAllocation();
      $('#split-launch').disabled = !allocation.ok;
      $('#split-launch').textContent = allocation.ok ? 'Encaisser les articles attribués' : allocation.message;
      $('#split-launch').title = allocation.message || '';
      lucide.createIcons();
    }

    function splitArticleAllocation() {
      const items = Object.entries(splitState.itemTotals || {});
      const n = Number(splitState.numConvives);
      const invalid = () => ({ ok: false, message: 'Attribution invalide : vérifiez les articles' });
      if (!items.length || !Number.isInteger(n) || n < 1) return invalid();
      const totals = new Map(items.map(([name, info]) => [name, info.totalQty]));
      const assigned = new Map();
      for (const [convive, cart] of Object.entries(splitState.perConvive || {})) {
        if (!Number.isInteger(Number(convive)) || Number(convive) < 1 || Number(convive) > n || !cart || typeof cart !== 'object') return invalid();
        for (const [name, qty] of Object.entries(cart)) {
          if (!totals.has(name) || !Number.isInteger(qty) || qty < 0) return invalid();
          assigned.set(name, (assigned.get(name) || 0) + qty);
        }
      }
      let remaining = 0;
      for (const [name, qty] of totals) {
        if (!Number.isInteger(qty) || qty < 0 || (assigned.get(name) || 0) > qty) return invalid();
        remaining += qty - (assigned.get(name) || 0);
      }
      return remaining ? { ok: false, message: `${remaining} article${remaining > 1 ? 's' : ''} à attribuer` } : { ok: true, message: '' };
    }

    function renderConvivesTabs() {
      const n = splitState.numConvives;
      $('#split-convives-tabs').innerHTML = Array.from({ length: n }, (_, i) => {
        const c = i + 1;
        const isActive = c === splitState.activeConvive;
        return `
          <button class="split-conv-tab ${isActive ? 'is-active' : ''}" data-conv-tab="${c}">
            <span class="split-conv-tab-label">Conv ${c}</span>
            <span class="split-conv-tab-total">${fmtMAD(conviveTotal(c))}</span>
          </button>`;
      }).join('');
    }

    function renderPool() {
      const items = Object.entries(splitState.itemTotals);
      $('#split-pool').innerHTML = items.map(([name, info]) => {
        const rem = remainingQty(name);
        const isEmpty = rem <= 0;
        return `
          <button class="split-pool-item ${isEmpty ? 'is-empty' : ''}" data-pool-item="${name}">
            <div class="split-pool-item-info">
              <div class="split-pool-item-name">${name}</div>
              <div class="split-pool-item-meta">
                <span class="remaining">${rem}</span> / ${info.totalQty} restant${info.totalQty > 1 ? 's' : ''} · ${info.unitPrice} MAD chacun
              </div>
            </div>
            <div class="split-pool-item-add">+</div>
          </button>`;
      }).join('');
    }

    function renderConviveCart() {
      const c = splitState.activeConvive;
      const cart = splitState.perConvive[c] || {};
      const entries = Object.entries(cart);
      const wrap = $('#split-convive-cart');

      if (entries.length === 0) {
        wrap.innerHTML = `<div class="split-convive-cart-empty-state">Convive ${c} n'a encore rien · tapez un article ci-dessus</div>`;
        return;
      }
      const total = conviveTotal(c);
      const rowsHTML = entries.map(([name, qty]) => {
        const unitPrice = splitState.itemTotals[name].unitPrice;
        const lineTotal = qty * unitPrice;
        const qtyPrefix = qty > 1 ? `${qty}× ` : '';
        return `
          <div class="split-convive-cart-row">
            <span class="split-convive-cart-name">${qtyPrefix}${name}</span>
            <div class="split-convive-cart-actions">
              <span class="split-convive-cart-price">${fmtMAD(lineTotal)}</span>
              <button class="split-convive-cart-remove" data-remove-item="${name}" aria-label="Retirer">×</button>
            </div>
          </div>`;
      }).join('');
      wrap.innerHTML = `
        <div class="split-convive-cart">
          <div class="split-convive-cart-title">
            <span>Articles de Convive ${c}</span>
            <span class="split-convive-cart-total">${fmtMAD(total)}</span>
          </div>
          ${rowsHTML}
        </div>`;
    }

    /* Backward-compat stubs (legacy callers no-op) */
    function renderArticleItems() { renderArticleMode(); }
    function updateArticleTotals() { /* totals are now baked into convive tabs */ }
    function renderPartsChips() {
      $('#split-parts-chips').innerHTML = [2,3,4,5,6,8].map(n =>
        `<button class="split-chip ${n === splitState.numParts ? 'is-active' : ''}" data-parts="${n}">${n}</button>`
      ).join('');
    }
    function renderTipChips() {
      const opts = [{l:'0%',v:'0'},{l:'5%',v:'5'},{l:'10%',v:'10'},{l:'15%',v:'15'},{l:'autre',v:'autre'}];
      $('#split-tip-chips').innerHTML = opts.map(o =>
        `<button class="split-chip ${o.v === splitState.tipMode ? 'is-active' : ''}" data-tip="${o.v}">${o.l}</button>`
      ).join('');
      $('#split-tip-custom').classList.toggle('is-visible', splitState.tipMode === 'autre');
      if (splitState.tipMode === 'autre') {
        const inp = $('#split-tip-input');
        inp.value = splitState.customTipPct || '';
        setTimeout(() => inp.focus(), 60);
      }
    }
    function updateSplitSummary() {
      const tipPct = effectiveTipPct();
      const tipAmt = splitState.total * tipPct / 100;
      const withTip = splitState.total + tipAmt;
      const perPerson = withTip / splitState.numParts;
      $('#split-total-display').textContent = fmtMADcents(splitState.total);
      const tipRow = $('#split-tip-row');
      if (tipPct > 0) {
        tipRow.style.display = '';
        $('#split-tip-label').textContent = `+ pourboire ${tipPct}%`;
        $('#split-tip-display').textContent = `+ ${fmtMADcents(tipAmt)}`;
      } else tipRow.style.display = 'none';
      $('#split-per-person').textContent = fmtMADcents(perPerson);
      $('#split-egal-desc').textContent = `${splitState.numParts} parts · ${fmtMADcents(perPerson)} chacun`;
    }
    function renderConvivesChips() {
      $('#split-convives-chips').innerHTML = [2,3,4,5,6,8].map(n =>
        `<button class="split-chip ${n === splitState.numConvives ? 'is-active' : ''}" data-convives="${n}">${n}</button>`
      ).join('');
    }
    function renderArticleItems() {
      const n = splitState.numConvives;
      $('#split-items-list').innerHTML = splitState.lines.map((l, idx) => {
        const assigned = splitState.assignments[idx] || 0;
        const isAssigned = assigned > 0;
        const chips = Array.from({length: n}, (_, i) => {
          const c = i + 1;
          return `<button class="split-convive-pick ${assigned === c ? 'is-assigned' : ''}" data-item="${idx}" data-convive="${c}" aria-label="Convive ${c}">${c}</button>`;
        }).join('');
        return `
          <div class="split-item-card ${isAssigned ? 'is-assigned' : ''}">
            <div class="split-item-card-head">
              <div class="split-item-card-name">${l.qty > 1 ? `${l.qty}× ` : ''}${esc(l.name)}</div>
              <div class="split-item-card-price">${fmtMAD(l.total)}</div>
            </div>
            <div class="split-item-card-body">
              <span class="split-item-card-prompt">Pour qui?</span>
              <div class="split-convive-chips-row">${chips}</div>
            </div>
          </div>`;
      }).join('');
    }
    function updateArticleTotals() {
      const n = splitState.numConvives;
      const totals = {};
      for (let c = 1; c <= n; c++) totals[c] = 0;
      splitState.lines.forEach((l, idx) => {
        const c = splitState.assignments[idx] || 0;
        if (c >= 1 && c <= n) totals[c] += l.total;
      });
      const unassigned = splitState.lines.reduce((s, l, idx) =>
        (splitState.assignments[idx] || 0) === 0 ? s + l.total : s, 0);
      $('#split-article-totals').innerHTML =
        Array.from({length: n}, (_, i) => {
          const c = i + 1;
          return `<div class="split-convive-total">
            <div class="lbl">Conv. ${c}</div>
            <div class="val">${fmtMAD(totals[c])}</div>
          </div>`;
        }).join('') +
        (unassigned > 0 ? `<div class="split-convive-total is-unassigned">
            <div class="lbl">Non assigné</div>
            <div class="val">${fmtMAD(unassigned)}</div>
          </div>` : '');
    }
    function launchSplitFlow() {
      /* Le partage par article attribue des plats entiers : avec un acompte
         déjà encaissé sur la visite, il ferait payer ces plats une seconde
         fois. Le reste se partage à parts égales. */
      if (splitState.splitMode !== 'egal' && Number(serviceVisitCredit.get(splitState.tableId)) > 0) {
        toast('Un acompte est déjà réglé sur cette table · partagez le reste à parts égales');
        return;
      }
      if (splitState.splitMode !== 'egal') {
        const allocation = splitArticleAllocation();
        if (!allocation.ok) { toast(allocation.message); return; }
      }
      const parts = [];
      if (splitState.splitMode === 'egal') {
        const cents = Math.round(splitState.total * 100), n = splitState.numParts;
        if (!Number.isInteger(n) || n < 1 || cents < n) { toast('Montant insuffisant pour ces parts'); return; }
        // Le dernier convive reçoit le reliquat, le pourboire reste hors recette.
        const pct = effectiveTipPct();
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast('Pourboire invalide (0 à 100 %)'); return; }
        const tips = Math.round(cents * pct / 100 + 1e-9);
        const items = Object.entries(splitState.itemTotals);
        const allocate = (total, weights) => {
          const sum = weights.reduce((a, b) => a + b, 0);
          const values = weights.map(w => sum ? Math.floor(total * w / sum) : 0);
          let left = total - values.reduce((a, b) => a + b, 0);
          for (let j = 0; left > 0; j = (j + 1) % values.length) {
            if (weights[j] > 0) { values[j]++; left--; }
          }
          return values;
        };
        const weights = items.map(([, info]) => Math.round(info.totalQty * info.unitPrice * 100));
        if (!weights.length || !weights.some(w => w > 0)) { toast('Addition sans article'); return; }
        let remaining = allocate(cents, weights);
        const bases = Array.from({ length: n }, (_, i) => i === n - 1 ? cents - Math.floor(cents / n) * (n - 1) : Math.floor(cents / n));
        const tipShares = allocate(tips, bases);
        for (let i = 0; i < n; i++) {
          const base = bases[i], tipCents = tipShares[i];
          const shares = allocate(base, remaining);
          const lines = items.map(([name, info], j) => {
            remaining[j] -= shares[j];
            return { name: `${name} · 1/${n}`, qty: info.totalQty, unit: shares[j] / 100 / info.totalQty,
              price: shares[j] / 100 / info.totalQty, total: shares[j] / 100 };
          });
          parts.push({ amount: base / 100, tipCents, label: tips ? 'Part égale · pourboire inclus' : 'Part égale', lines, paid: false, payMethod: null });
        }
      } else {
        const n = splitState.numConvives;

        for (let c = 1; c <= n; c++) {
          const cart = splitState.perConvive[c] || {};
          const amt = Object.entries(cart).reduce((s, [name, qty]) => {
            return s + qty * (splitState.itemTotals[name]?.unitPrice || 0);
          }, 0);

          if (amt < 0.01) continue; // skip empty convives

          const items = Object.entries(cart)
            .map(([name, qty]) => qty > 1 ? `${qty}× ${name}` : name)
            .join(', ');
          const assignedLines = Object.entries(cart).map(([name, qty]) => {
            const unitPrice = splitState.itemTotals[name]?.unitPrice || 0;
            const baseName = splitState.itemTotals[name]?.baseName;
            return {
              name, ...(baseName ? { baseName } : {}),
              qty,
              unit: unitPrice,
              price: unitPrice,
              total: Math.round(qty * unitPrice * 100) / 100,
            };
          });
          const partLines = assignedLines;
          parts.push({
            amount: amt,
            label: items || 'Part équilibrée',
            lines: partLines,
            paid: false, payMethod: null,
          });
        }
      }
      splitState.flow = { parts, paidCount: 0, id: 'split-' + (window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)) };
      $('#split-setup').hidden = true;
      $('#split-flow').hidden = false;
      renderSplitFlow();
      lucide.createIcons();
    }
    function renderSplitFlow() {
      const { parts, paidCount } = splitState.flow;
      $('#split-flow-progress').textContent = `${paidCount} / ${parts.length} réglées`;
      $('#split-parts-list').innerHTML = parts.map((p, idx) => {
        if (p.paid) {
          return `<div class="split-part-card is-paid">
            <div class="split-part-num"><i data-lucide="check"></i></div>
            <div class="split-part-info">
              <div class="split-part-amount">${fmtMADcents(p.amount + (p.tipCents || 0) / 100)}</div>
              <div class="split-part-paid-label">Réglé · ${p.payMethod === 'carte' ? 'Carte' : 'Espèces'}</div>
            </div>
          </div>`;
        }
        return `<div class="split-part-card">
          <div class="split-part-num">${idx + 1}</div>
          <div class="split-part-info">
            <div class="split-part-amount">${fmtMADcents(p.amount + (p.tipCents || 0) / 100)}</div>
            <div class="split-part-label">${esc(p.label)}</div>
          </div>
          <div class="split-part-btns">
            <button class="split-part-btn carte" data-pay-part="${idx}" data-pay-method="carte">
              <i data-lucide="credit-card"></i> Carte
            </button>
            <button class="split-part-btn cash-dark" data-pay-part="${idx}" data-pay-method="cash">
              <i data-lucide="banknote"></i> Cash
            </button>
          </div>
        </div>`;
      }).join('');
      lucide.createIcons();
    }
    function paySplitPart(partIdx, method) {
      const part = splitState.flow.parts[partIdx];
      if (!part || part.paid) return;
      payTableId = splitState.tableId;

      // Hide the split modal while the sub-modal (card/cash) is active.
      // The close handlers will re-open it.
      $('#split-modal').classList.remove('is-open');

      if (method === 'carte') {
        $('#card-amount').textContent = fmtMADcents(part.amount + (part.tipCents || 0) / 100);
        $$('[data-bind="table"]').forEach(el => el.textContent = `Part ${partIdx + 1} · ${splitState.tableId}`);
        splitPayCallback = () => {
          markSplitPartPaid(partIdx, 'carte');
          $('#split-modal').classList.add('is-open');
        };
        reader.disc.classList.remove('is-success', 'flash');
        reader.disc.classList.add('is-pulsing');
        reader.disc.innerHTML = '<i data-lucide="credit-card"></i>';
        reader.status.classList.remove('is-success');
        reader.status.innerHTML = 'Approchez la carte<span class="ellipsis"></span>';
        reader.method.style.display = '';
        reader.txn.hidden = true;
        reader.actions.classList.remove('is-visible');
        reader.foot.classList.remove('is-visible');
        cardModal.classList.add('is-open');
        lucide.createIcons();
        cardReaderArm(payTableId);
      } else {
        cashAmountOverride = part.amount + (part.tipCents || 0) / 100;
        $$('[data-bind="table"]').forEach(el => el.textContent = `Part ${partIdx + 1} · ${splitState.tableId}`);
        cashPay = () => markSplitPartPaid(partIdx, 'cash');
        cashSettled = false;
        splitPayCallback = () => {
          $('#split-modal').classList.add('is-open');
        };
        cashStepInput.hidden = false;
        cashStepSuccess.hidden = true;
        cashInput.value = cashAmountOverride;
        $('#cash-amount').textContent = fmtMADcents(part.amount + (part.tipCents || 0) / 100);
        updateRendu();
        cashModal.classList.add('is-open');
        lucide.createIcons();
        setTimeout(() => cashInput.focus(), 60);
      }
    }
    async function markSplitPartPaid(partIdx, method) {
      if (svBrowseGuard()) return false;
      const state = { ...splitState };
      const flow = state.flow;
      const p = flow && flow.parts && flow.parts[partIdx];
      if (!p || p.paid) return false;

      const tableId = state.tableId;
      const t = tableId && tables[tableId];
      const payMethod = (method === 'carte' || method === 'card') ? 'card' : 'cash';

      const partFlightKey = tableId ? (tableId + ':split:' + partIdx) : ('split:' + partIdx);
      if (employeePaymentsInFlight.has(partFlightKey)) return false;

      const merchant = (liveEmployeeState && liveEmployeeState.merchant) || svSlug();
      const canonical = Array.from(serviceCanonicalOrders.values()).find((order) => order && !order.paid
        && String(order.table) === String(tableId) && order.session);
      const session = (tableId && serviceTableSessions.get(tableId)) || (canonical && String(canonical.session)) || '';
      if (!SV_DEMO && (!merchant || !session)) {
        toast('Session de service expirée · reconnectez-vous', 5200);
        return false;
      }
      const orderRef = tableId ? serviceTableOrderRef(tableId) : '';
      const partPaymentId = p.saleId || (tableId ? employeePaymentId(tableId + ':split:' + partIdx) : '');

      /* Hors ligne connu : échec immédiat, la part reste due, la feuille
         reste ouverte avec son montant. (navigator absent hors navigateur.) */
      if (!SV_DEMO && typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
        toast("Pas de réseau. Le paiement n'est pas enregistré, réessayez au retour du réseau.", 6000);
        return false;
      }

      let saved = null;
      let payTimer = null;
      const payCtl = (typeof AbortController === 'function' && typeof setTimeout === 'function') ? new AbortController() : null;
      if (!SV_DEMO && saveSplitFlow(state) === false) {
        toast('Stockage indisponible : paiement non envoyé, gardez cette addition ouverte', 6000);
        return false;
      }
      employeePaymentsInFlight.add(partFlightKey);
      try {
        if (!SV_DEMO) {
          /* Délai réel (15 s) : l'identifiant de la part est stable, une
             relance après délai rejoue la même vente, jamais une seconde. */
          if (payCtl) payTimer = setTimeout(() => payCtl.abort(), 15000);
          const response = await fetch('/api/sale', {
            ...(payCtl ? { signal: payCtl.signal } : {}),
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: partPaymentId,
              merchant,
              table: tableId,
              session,
              split: { index: partIdx, count: flow.parts.length, flowId: flow.id },
              amount: Math.round(p.amount * 100) / 100,
              amountCents: Math.round(p.amount * 100),
              tipCents: p.tipCents || 0,
              method: payMethod,
              ts: Date.now(),
              label: (orderRef ? (orderRef + ' · ') : '') + `Part ${partIdx + 1}`,
              ref: (orderRef ? (orderRef + ' · ') : '') + `Part ${partIdx + 1}`,
              lines: (Array.isArray(p.lines) && p.lines.length) ? p.lines : [{
                name: (tableId ? `Table ${tableId}` : 'Table') + ` · part ${partIdx + 1}`,
                qty: 1,
                total: Math.round(p.amount * 100) / 100,
                cat: '',
              }],
            }),
          });
          saved = await response.json().catch(() => null);
          if (!response.ok || !saved || !saved.ok) {
            const refused = new Error((saved && saved.error) || ('http-' + response.status));
            refused.refused = true;
            throw refused;
          }
        }
      } catch (err) {
        if (payCtl && payCtl.signal.aborted) toast(payMethod === 'card'
          ? `Table ${tableId || ''} · part ${partIdx + 1} non confirmée, ne repassez pas la carte, réessayez`
          : `Table ${tableId || ''} · part ${partIdx + 1} non confirmée, réessayez`, 6000);
        else if (err && !err.refused) toast("Pas de réseau. Le paiement n'est pas enregistré, réessayez au retour du réseau.", 6000);
        else toast(`Table ${tableId || ''} · part ${partIdx + 1} non enregistrée, réessayez`, 5200);
        return false;
      } finally {
        if (payTimer) clearTimeout(payTimer);
        employeePaymentsInFlight.delete(partFlightKey);
      }

      p.paid = true;
      p.payMethod = method;
      if (partPaymentId) p.saleId = (saved && saved.id) || partPaymentId;
      flow.paidCount = flow.parts.filter(part => part.paid).length;
      const completesTable = Boolean(tableId && flow.parts.every(part => part.paid));
      try { servicePaymentTally(p.amount, completesTable ? (t && t.elapsed) || 0 : 0); } catch (_) {}
      const visibleFlow = splitState.flow && splitState.flow.parts === flow.parts;
      if (visibleFlow) splitState.flow.paidCount = flow.paidCount;

      // Persist progress so it survives a modal dismissal
      saveSplitFlow(state);
      if (visibleFlow) renderSplitFlow();

      // Live-update the underlying table card if visible
      if (currentTab === 'tables') renderTables();
      if (currentTab === 'notifications') renderNotifications();

      if (completesTable && saved && saved.billOpen) {
        for (let i = 0; i < flow.parts.length; i++) employeePaymentRefForget(tableId + ':split:' + i);
        if (visibleFlow) splitState.flow = null;
        keepServiceBillOpen(tableId, saved);
        if (visibleFlow) closeSplitModal({ skipRevert: true });
        return true;
      }
      if (completesTable) {
        if (visibleFlow) {
          $('#split-parts-list').style.opacity = '0.45';
          $('#split-all-done').hidden = false;
        }

        const paidClient = tableId && tableClients.get(tableId);
        if (paidClient && !SV_DEMO) {
          fetch('/api/employee-clients', {
            method: 'POST', credentials: 'same-origin', cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              merchant, clientId: paidClient.id, amount: state.total,
              ref: 'employee-payment:' + tableId + ':' + Date.now(),
            }),
          }).then((r) => r.ok ? r.json() : null).then((data) => {
            if (data && data.ok && !data.replayed) toast(`${paidClient.name} · fidélité mise à jour`);
          }).catch(() => {});
        }

        if (tableId) {
          tableClients.delete(tableId);
          if (t) {
            t.status = 'khawya';
            t.covers = 0;
            t.elapsed = 0;
            delete t.orderNo;
          }
          serviceTableSessions.delete(tableId);
          delete tableOrders[tableId];
          dirtyOrders.delete(tableId);
          tableSplits.delete(tableId);
          if (saved && saved.settlementPending) {
            publishServiceTableState(tableId, 'khawya', 0, true);
          }
          for (let i = 0; i < flow.parts.length; i++) {
            employeePaymentRefForget(tableId + ':split:' + i);
          }
          employeePaymentRefForget(tableId);
          employeePaymentsInFlight.delete(tableId);
          tablesPaid++;
          try { servicePaymentTally(0); } catch (_) {} // Sauver aussi le nombre de tables réglées.

          if (activeTableId === tableId) {
            returnToFloor();
          }
          if (currentTab === 'tables') renderTables();
          if (currentTab === 'notifications') renderNotifications();
          if (currentTab === 'profil') renderProfil();
          toast(`Table ${tableId} · réglée ✓`);
        }
        lucide.createIcons();
      }
      return true;
    }
    $('#split-modal').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-split-tab]');
      if (tab) { splitState.splitMode = tab.dataset.splitTab; renderSplitSetup(); return; }
      const partsChip = e.target.closest('[data-parts]');
      if (partsChip) { splitState.numParts = parseInt(partsChip.dataset.parts); renderPartsChips(); updateSplitSummary(); return; }
      const tipChip = e.target.closest('[data-tip]');
      if (tipChip) { splitState.tipMode = tipChip.dataset.tip; renderTipChips(); updateSplitSummary(); return; }
      // 1 · Number of convives → reset assignments
      const convivesChip = e.target.closest('[data-convives]');
      if (convivesChip) {
        splitState.numConvives = parseInt(convivesChip.dataset.convives);
        splitState.perConvive = {};
        splitState.activeConvive = 1;
        renderArticleMode();
        return;
      }
      // 2 · Switch the active convive (tab)
      const convTab = e.target.closest('[data-conv-tab]');
      if (convTab) {
        splitState.activeConvive = parseInt(convTab.dataset.convTab);
        renderArticleMode();
        return;
      }
      // 3 · Tap an item in the pool → assign one unit to active convive
      const poolItem = e.target.closest('[data-pool-item]');
      if (poolItem) {
        assignUnit(poolItem.dataset.poolItem);
        renderArticleMode();
        return;
      }
      // × on an assigned item → remove one unit from active convive
      const removeBtn = e.target.closest('[data-remove-item]');
      if (removeBtn) {
        unassignUnit(removeBtn.dataset.removeItem);
        renderArticleMode();
        return;
      }
      if (e.target.closest('#split-launch')) { launchSplitFlow(); return; }
      if (e.target.closest('#split-cancel')) { closeSplitModal(); return; }
      if (e.target.closest('#split-done-close')) { closeSplitModal({ skipRevert: true }); return; }
      // "Plus tard" — close the flow without losing progress
      if (e.target.closest('#split-flow-close')) { closeSplitModal(); return; }
      const payBtn = e.target.closest('[data-pay-part]');
      if (payBtn) { paySplitPart(parseInt(payBtn.dataset.payPart), payBtn.dataset.payMethod); return; }
      // Tap on backdrop — always allowed now (progress persists per-table)
      if (e.target === $('#split-modal')) closeSplitModal();
    });
    document.addEventListener('input', (e) => {
      if (e.target.id === 'split-tip-input') {
        splitState.customTipPct = parseFloat(e.target.value) || 0;
        updateSplitSummary();
      }
    });

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
    (function () {
      /* --- ranks (serif names in the UI) --- */
      const KG_RANKS = [
        { name: 'Apprenti',         xp: 100  },
        { name: 'Garçon',           xp: 700  },
        { name: 'Serveur',          xp: 1700 },
        { name: 'Serveur Confirmé', xp: 2750 },
        { name: 'Maître',           xp: 4400 },
        { name: "Maître d'Hôtel",   xp: 6800 },
      ];

      /* Fourteen distinct challenges in a fixed shuffled order. A calendar day
         advances exactly one slot, so nothing repeats inside a two-week window. */
      const KG_DEFIS = [
        { text: 'Réglez 3 tables pendant ce service', target: 3,    metric: 'tables'  },
        { text: 'Atteignez 1 000 MAD ce service',     target: 1000, metric: 'revenue' },
        { text: 'Accompagnez 5 tables jusqu’au règlement', target: 5, metric: 'tables' },
        { text: 'Encaissez 500 MAD ce service',       target: 500,  metric: 'revenue' },
        { text: 'Réglez 8 tables avant la fermeture', target: 8,    metric: 'tables'  },
        { text: 'Atteignez 1 500 MAD ce service',     target: 1500, metric: 'revenue' },
        { text: 'Terminez 2 tables ce service',       target: 2,    metric: 'tables'  },
        { text: 'Encaissez 750 MAD ce service',       target: 750,  metric: 'revenue' },
        { text: 'Réglez 6 tables pendant ce service', target: 6,    metric: 'tables'  },
        { text: 'Atteignez 2 000 MAD ce service',     target: 2000, metric: 'revenue' },
        { text: 'Accompagnez 4 tables jusqu’au règlement', target: 4, metric: 'tables' },
        { text: 'Encaissez 300 MAD ce service',       target: 300,  metric: 'revenue' },
        { text: 'Réglez 7 tables avant la fermeture', target: 7,    metric: 'tables'  },
        { text: 'Atteignez 1 250 MAD ce service',     target: 1250, metric: 'revenue' },
      ];
      function kgDefi() {
        const dayNumber = Math.floor(Date.parse(employeeDayKey() + 'T12:00:00Z') / 86400000);
        return KG_DEFIS[((dayNumber % KG_DEFIS.length) + KG_DEFIS.length) % KG_DEFIS.length];
      }

      /* --- persistence (keyed by server initials) --- */
      const KG_KEY = 'kiwi-serveur-progress';
      const kgInitials  = (servers[currentUser] && servers[currentUser].initials) || 'YK';
      const kgFirstName = (((servers[currentUser] && servers[currentUser].name) || 'Yassir')).split(' ')[0];

      function kgDefaults() {
        return { lifetimeXP: 0, records: { bestNight: 0, streak: 0, bestSpeed: null }, updatedTs: 0 };
      }
      function kgLoad() {
        let all = {};
        try { all = JSON.parse(localStorage.getItem(KG_KEY)) || {}; } catch (e) {}
        const s = all[currentUser] || all[kgInitials] || kgDefaults();
        const r = (s && s.records) || {};
        return {
          lifetimeXP: Number.isFinite(s.lifetimeXP) ? s.lifetimeXP : 0,
          records: {
            bestNight: Number.isFinite(r.bestNight) ? r.bestNight : 0,
            streak:    Number.isFinite(r.streak)    ? r.streak    : 0,
            bestSpeed: Number(r.bestSpeed) > 0 ? Number(r.bestSpeed) : null,
          },
          updatedTs: Number(s.updatedTs) || 0,
        };
      }
      function kgSave() {
        let all = {};
        try { all = JSON.parse(localStorage.getItem(KG_KEY)) || {}; } catch (e) {}
        all[currentUser || kgInitials] = kgState;
        try { localStorage.setItem(KG_KEY, JSON.stringify(all)); } catch (e) {}
      }

      /* --- shift-local state (resets each shift / page reload) --- */
      let kgState        = kgLoad();
      let kgShiftRevenue = 0;  // MAD encaissé this shift (tallied via markTablePaid)
      let kgShiftTurnMin = 0;  // sum of occupancy minutes of paid tables
      let kgShareLine    = 'Service bouclé';
      const kgBroke      = { bestNight: false, bestSpeed: false };

      /* ── LE DÉCOMPTE DU SERVICE SURVIT AU RECHARGEMENT ─────────────────────
         « Tables réglées », « Défi du soir » (40 / 500 MAD) et l'XP versée à la
         fin du service ne vivaient qu'en mémoire : un rechargement, un onglet
         recyclé par iOS, et un serveur qui avait encaissé cinq tables lisait
         « 0 / 500 MAD » puis perdait ses points. On écrit le décompte, par
         commerce et par employé, avec l'heure de début du service ; il n'est
         relu que pour LE MÊME service (un nouveau pointage ne l'hérite pas). */
      let kgTallyFor = 0, kgTallyLast = '';
      function kgTallyKey() { return 'kiwi:service-shift-tally-v1:' + (svSlug() || 'store') + ':' + (currentUser || kgInitials); }
      function kgTallySync() {
        if (!shiftStart || SV_DEMO) return;
        const start = shiftStart.getTime();
        if (kgTallyFor !== start) {
          kgTallyFor = start;
          try {
            const d = JSON.parse(localStorage.getItem(kgTallyKey()) || 'null');
            if (d && d.start === start) {
              tablesPaid = Math.max(tablesPaid, Number(d.paid) || 0);
              kgShiftRevenue = Math.max(kgShiftRevenue, Number(d.rev) || 0);
              kgShiftTurnMin = Math.max(kgShiftTurnMin, Number(d.turn) || 0);
            }
          } catch (_) {}
        }
        const now = JSON.stringify({ start: start, paid: tablesPaid, rev: kgShiftRevenue, turn: kgShiftTurnMin });
        if (now !== kgTallyLast) {
          kgTallyLast = now;
          try { localStorage.setItem(kgTallyKey(), now); } catch (_) {}
        }
      }

      // Chaque part acquittée compte tout de suite, jamais le pourboire.
      function kgRecordPayment(amount, minutes = 0) {
        kgTallySync(); // Relire le cumul avant le premier ajout après rechargement.
        kgShiftRevenue = (Math.round(kgShiftRevenue * 100) + Math.round(amount * 100)) / 100;
        kgShiftTurnMin += minutes;
        kgTallySync();
        if (shiftStart) kgRenderProfil();
        kgUpdateRankChip();
      }
      servicePaymentTally = kgRecordPayment;

      /* --- helpers --- */
      const kgNum = n => new Intl.NumberFormat(employeeLocale(), { useGrouping: true }).format(Math.round(n || 0));
      function kgFmtDur(min) {
        const h = Math.floor(min / 60), m = min % 60;
        if (employeeLanguage === 'ar') return h > 0 ? (h + ' س ' + String(m).padStart(2, '0') + ' د') : (m + ' د');
        if (employeeLanguage === 'en') return h > 0 ? (h + 'h ' + String(m).padStart(2, '0') + 'm') : (m + ' min');
        return h > 0 ? (h + 'h ' + String(m).padStart(2, '0')) : (m + ' mn');
      }
      function kgRankName(rank) {
        if (!rank) return employeeTranslation('Aucun grade');
        const names = {
          en: { 'Apprenti': 'Apprentice', 'Garçon': 'Waiter', 'Serveur': 'Server', 'Serveur Confirmé': 'Senior server', 'Maître': 'Head waiter', "Maître d'Hôtel": "Maître d'" },
          ar: { 'Apprenti': 'متدرّب', 'Garçon': 'نادل', 'Serveur': 'مقدّم خدمة', 'Serveur Confirmé': 'مقدّم خدمة متمرس', 'Maître': 'رئيس القاعة', "Maître d'Hôtel": 'مدير القاعة' }
        };
        return ((names[employeeLanguage] || {})[rank.name]) || rank.name;
      }
      function kgChallengeText(defi) {
        if (employeeLanguage === 'ar') return defi.metric === 'tables'
          ? `سدّد ${defi.target} طاولات خلال هذه الوردية`
          : `حصّل ${kgNum(defi.target)} MAD خلال هذه الوردية`;
        if (employeeLanguage === 'en') return defi.metric === 'tables'
          ? `Settle ${defi.target} tables during this shift`
          : `Collect ${kgNum(defi.target)} MAD during this shift`;
        return defi.text;
      }
      function kgRankIdxFor(xp) {
        let idx = -1;
        for (let i = 0; i < KG_RANKS.length; i++) if (xp >= KG_RANKS[i].xp) idx = i;
        return idx;
      }
      function kgSyncCloud() {
        const cloud = liveEmployeeState && liveEmployeeState.progress;
        if (!cloud || Number(cloud.updatedTs) < Number(kgState.updatedTs || 0)) return;
        kgState = {
          lifetimeXP: Math.max(0, Number(cloud.lifetimeXP) || 0),
          records: {
            bestNight: Math.max(0, Number(cloud.records && cloud.records.bestNight) || 0),
            streak: Math.max(0, Number(cloud.records && cloud.records.streak) || 0),
            bestSpeed: Number(cloud.records && cloud.records.bestSpeed) > 0 ? Number(cloud.records.bestSpeed) : null,
          },
          updatedTs: Math.max(0, Number(cloud.updatedTs) || 0),
        };
        kgSave();
      }

      /* --- live shift snapshot (computed; never mutates app state) --- */
      function kgSnapshot() {
        kgTallySync();
        const durMin = shiftStart ? Math.max(0, Math.floor((Date.now() - shiftStart.getTime()) / 60000)) : 0;
        const paid = tablesPaid;
        const occupied = Object.values(tables).filter(t =>
          t.status === 'ka-yaklo' || t.status === 'bgha-ykhlass' || t.status === 'ka-tkhdam'
        ).length;
        const speed = paid > 0 ? Math.round(kgShiftTurnMin / paid) : null;
        const shiftXP = Math.round(paid * 10 + kgShiftRevenue * 0.01);
        const totalXP = kgState.lifetimeXP + shiftXP;
        const rankIdx = kgRankIdxFor(totalXP);
        const rank = rankIdx >= 0 ? KG_RANKS[rankIdx] : null;
        const next = KG_RANKS[rankIdx + 1] || null;
        const floorXP = rank ? rank.xp : 0;
        const progress = next ? (totalXP - floorXP) / (next.xp - floorXP) : 1;
        return {
          durMin: durMin, paid: paid, served: paid + occupied, occupied: occupied,
          speed: speed, shiftXP: shiftXP, totalXP: totalXP,
          rankIdx: rankIdx, rank: rank, next: next, progress: progress,
          revenue: kgShiftRevenue, ticket: paid > 0 ? kgShiftRevenue / paid : 0,
        };
      }
      function kgDefiProgress() {
        const snap = kgSnapshot();
        const challenge = kgDefi();
        const val = challenge.metric === 'tables' ? snap.paid : snap.revenue;
        return { val: val, target: challenge.target, frac: Math.min(1, val / challenge.target), done: val >= challenge.target };
      }

      /* --- profil card rendering --- */
      function kgSetRecTile(key, value, unit, isRecord) {
        const tile = document.getElementById('kg-rec-' + key);
        const num  = document.getElementById('kg-rec-' + key + '-num');
        if (!tile || !num) return;
        num.innerHTML = value == null
          ? '<span class="kg-rec-pending">' + employeeTranslation('À établir') + '</span>'
          : (unit ? (value + '<small>' + unit + '</small>') : String(value));
        const flagKey = key === 'night' ? 'bestNight' : (key === 'speed' ? 'bestSpeed' : null);
        if (isRecord) {
          tile.classList.add('is-record');
          if (flagKey && !kgBroke[flagKey]) {
            kgBroke[flagKey] = true;
            tile.classList.add('kg-just-broke');
            setTimeout(function () { tile.classList.remove('kg-just-broke'); }, 1500);
          }
        } else {
          tile.classList.remove('is-record');
        }
      }
      function kgRenderProfil() {
        kgSyncCloud();
        const snap = kgSnapshot();

        /* a) Niveau / Grade */
        const nameEl = document.getElementById('kg-rank-name');
        if (nameEl) nameEl.textContent = kgRankName(snap.rank);
        const xpEl = document.getElementById('kg-rank-xp');
        if (xpEl) xpEl.textContent = kgNum(snap.totalXP);
        const fillEl = document.getElementById('kg-rank-fill');
        if (fillEl) fillEl.style.width = Math.round(snap.progress * 100) + '%';
        const nextEl = document.getElementById('kg-rank-next');
        const gapEl  = document.getElementById('kg-rank-gap');
        if (snap.next) {
          if (nextEl) nextEl.innerHTML = (employeeLanguage === 'ar' ? 'التالي · ' : employeeLanguage === 'en' ? 'Next · ' : 'Prochain · ') + '<em>' + kgRankName(snap.next) + '</em>';
          if (gapEl)  gapEl.textContent = '+' + kgNum(snap.next.xp - snap.totalXP) + ' XP';
        } else {
          if (nextEl) nextEl.innerHTML = '<em>' + (employeeLanguage === 'ar' ? 'بلغت أعلى مستوى' : employeeLanguage === 'en' ? 'Highest rank reached' : 'Grade maximal atteint') + '</em>';
          if (gapEl)  gapEl.textContent = '';
        }

        /* b) Records personnels */
        const hasRecords = snap.paid > 0
          || kgState.records.bestNight > 0
          || kgState.records.streak > 0
          || kgState.records.bestSpeed != null;
        const recGrid = document.getElementById('kg-rec-grid');
        const recEmpty = document.getElementById('kg-rec-empty');
        if (recGrid) recGrid.hidden = !hasRecords;
        if (recEmpty) recEmpty.hidden = hasRecords;
        const nightBeat = snap.paid > kgState.records.bestNight;
        const speedBeat = snap.speed != null && snap.speed > 0 && (kgState.records.bestSpeed == null || snap.speed < kgState.records.bestSpeed);
        kgSetRecTile('night',  Math.max(kgState.records.bestNight, snap.paid) || null, '', nightBeat);
        kgSetRecTile('streak', kgState.records.streak || null, '', false);
        kgSetRecTile('speed',  snap.speed != null ? snap.speed : kgState.records.bestSpeed, ' mn', speedBeat);

        /* c) Défi du soir */
        const dp = kgDefiProgress();
        const defiText = document.getElementById('kg-defi-text');
        if (defiText) defiText.textContent = dp.done
          ? (employeeLanguage === 'ar' ? 'اكتمل التحدي' : employeeLanguage === 'en' ? 'Challenge complete' : 'Défi accompli')
          : kgChallengeText(kgDefi());
        const defiFill = document.getElementById('kg-defi-fill');
        if (defiFill) defiFill.style.width = Math.round(dp.frac * 100) + '%';
        const defiMeta = document.getElementById('kg-defi-meta');
        if (defiMeta) {
          const tableUnit = employeeLanguage === 'ar' ? 'طاولات' : employeeLanguage === 'en' ? 'tables' : 'tables';
          defiMeta.textContent = kgDefi().metric === 'tables'
            ? (kgNum(dp.val) + ' / ' + kgNum(dp.target) + ' ' + tableUnit)
            : (kgNum(dp.val) + ' / ' + kgNum(dp.target) + ' MAD');
        }
        const defiCard = document.getElementById('kg-defi-card');
        if (defiCard) defiCard.classList.toggle('is-done', dp.done);

        if (window.lucide) lucide.createIcons();
      }

      /* --- rank chip on the card payment screen --- */
      function kgUpdateRankChip() {
        const roleEl = document.getElementById('kg-card-rank-role');
        const rank = kgSnapshot().rank;
        if (roleEl) roleEl.textContent = kgRankName(rank).toLocaleLowerCase(employeeLocale());
      }

      /* --- Carte du soir : pick the best thing about tonight --- */
      function kgBestHighlight(snap) {
        /* La carte du soir compose ses phrases (un chiffre au milieu, un grade
           en italique) : elles se choisissent ici dans la langue de l'app, le
           traducteur du DOM ne sait pas recoller des morceaux. */
        const P = employeePick;
        const startIdx = kgRankIdxFor(kgState.lifetimeXP);
        if (snap.rank && snap.rankIdx > startIdx) {
          const r = kgRankName(snap.rank);
          return { label: P('Niveau débloqué', 'Level unlocked', 'مستوى جديد'), icon: 'trending-up',
                   text: P('Tu passes <em>' + r + '</em> ce soir.', 'You move up to <em>' + r + '</em> tonight.', 'ترتقي إلى <em>' + r + '</em> هذا المساء.'),
                   share: P('Niveau ' + r + ' débloqué', 'Level ' + r + ' unlocked', 'مستوى ' + r + ' مفتوح') };
        }
        if (snap.paid > kgState.records.bestNight) {
          return { label: P('Nouveau record', 'New record', 'رقم قياسي جديد'), icon: 'trophy',
                   text: P('<em>' + snap.paid + ' tables</em> réglées, ton meilleur soir.', '<em>' + snap.paid + ' tables</em> paid, your best night.', '<em>' + snap.paid + ' طاولات</em> مدفوعة، أفضل مساء لك.'),
                   share: P('Nouveau record · ' + snap.paid + ' tables réglées', 'New record · ' + snap.paid + ' tables paid', 'رقم قياسي جديد · ' + snap.paid + ' طاولات مدفوعة') };
        }
        if (snap.speed != null && snap.speed > 0 && (kgState.records.bestSpeed == null || snap.speed < kgState.records.bestSpeed)) {
          return { label: P('Nouveau record', 'New record', 'رقم قياسي جديد'), icon: 'zap',
                   text: P('<em>' + snap.speed + ' mn</em> par table, jamais aussi rapide.', '<em>' + snap.speed + ' min</em> per table, your fastest yet.', '<em>' + snap.speed + ' د</em> لكل طاولة، الأسرع حتى الآن.'),
                   share: P('Record de vitesse · ' + snap.speed + ' mn par table', 'Speed record · ' + snap.speed + ' min per table', 'رقم قياسي في السرعة · ' + snap.speed + ' د لكل طاولة') };
        }
        if (kgDefiProgress().done) {
          const d = kgChallengeText(kgDefi()).toLocaleLowerCase(employeeLocale());
          return { label: P('Défi accompli', 'Challenge done', 'تم التحدي'), icon: 'flag',
                   text: P('Défi du soir relevé, <em>' + d + '</em>.', "Tonight's challenge done, <em>" + d + '</em>.', 'أُنجز تحدي المساء، <em>' + d + '</em>.'),
                   share: P('Défi du soir accompli', "Tonight's challenge done", 'أُنجز تحدي المساء') };
        }
        const lines = P([
          'Service propre, du début à la fin.',
          'Chaque table comptée, beau travail.',
          'Un service de plus, bien mené.',
          'Régulier et solide, c\'est ça le métier.',
        ], [
          'A clean service, start to finish.',
          'Every table counted, nice work.',
          'One more service, well run.',
          "Steady and solid, that's the job.",
        ], [
          'خدمة نظيفة من البداية إلى النهاية.',
          'كل طاولة محسوبة، عمل جميل.',
          'خدمة أخرى أُديرت جيداً.',
          'منتظم وثابت، هذه هي المهنة.',
        ]);
        return { label: P('Ce soir', 'Tonight', 'هذا المساء'), icon: 'sparkles',
                 text: lines[(snap.paid + employeeCivilDate().getDate()) % lines.length],
                 share: P('Service bouclé', 'Shift wrapped', 'انتهت الخدمة') };
      }

      /* --- Carte du soir : open the shift report --- */
      function kgOpenShiftCard() {
        const veil = document.getElementById('kg-shiftcard');
        if (!veil) { clockOut(); return; }
        const snap = kgSnapshot();

        const now = employeeCivilDate();
        const metaEl = document.getElementById('kg-sc-meta');
        const dayLine = now.toLocaleDateString(employeeLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
        if (metaEl) metaEl.textContent = (svName('Café Atlas') ? svName('Café Atlas') + ' · ' : '') +
          dayLine.charAt(0).toLocaleUpperCase(employeeLocale()) + dayLine.slice(1);

        const rows = [
          ['Tables servies',          String(snap.served),                            false],
          ['Tables réglées',          String(snap.paid),                              false],
          ['Revenu encaissé',         kgNum(snap.revenue) + ' MAD',                   true ],
          ['Ticket moyen',            kgNum(snap.ticket) + ' MAD',                    true ],
          ['Durée du service',        kgFmtDur(snap.durMin),                          false],
          ['Vitesse moyenne / table', (snap.speed != null ? snap.speed + employeePick(' mn', ' min', ' د') : '·'), false],
        ];
        const rowsEl = document.getElementById('kg-sc-rows');
        if (rowsEl) rowsEl.innerHTML = rows.map(function (r, i) {
          return '<div class="kg-sc-row" style="animation-delay:' + (i * 80) + 'ms">' +
                   '<span class="kg-sc-row-label">' + r[0] + '</span>' +
                   '<span class="kg-sc-row-value' + (r[2] ? ' kg-mono' : '') + '">' + r[1] + '</span>' +
                 '</div>';
        }).join('');

        const hl = kgBestHighlight(snap);
        kgShareLine = hl.share;
        const hlEl    = document.getElementById('kg-sc-highlight');
        const hlIcon  = veil.querySelector('.kg-sc-hl-icon');
        const hlLabel = document.getElementById('kg-sc-hl-label');
        const hlText  = document.getElementById('kg-sc-hl-text');
        if (hlIcon)  hlIcon.innerHTML = '<i data-lucide="' + hl.icon + '"></i>';
        if (hlLabel) hlLabel.textContent = hl.label;
        if (hlText)  hlText.innerHTML = hl.text;
        if (hlEl) {
          hlEl.style.display = 'flex';
          hlEl.style.animation = 'none';
          void hlEl.offsetWidth;                      // restart the entrance animation
          hlEl.style.animation = '';
          hlEl.style.animationDelay = (rows.length * 80 + 60) + 'ms';
        }

        veil.classList.add('is-open');
        if (window.lucide) lucide.createIcons();
      }

      /* --- bank the shift into lifetime progress at clock-out --- */
      function kgBankShift() {
        const snap = kgSnapshot();
        window.__kiwiShiftProgress = { paid: snap.paid, revenue: snap.revenue, turnMinutes: kgShiftTurnMin };
        kgState.lifetimeXP += snap.shiftXP;
        if (snap.paid > kgState.records.bestNight) kgState.records.bestNight = snap.paid;
        if (snap.speed != null && snap.speed > 0 && (kgState.records.bestSpeed == null || snap.speed < kgState.records.bestSpeed))
          kgState.records.bestSpeed = snap.speed;
        if (snap.paid >= 8) kgState.records.streak += 1;
        else if (snap.paid > 0) kgState.records.streak = 1;
        kgState.updatedTs = Date.now(); kgSave();
        /* reset shift-local accumulators for the next shift */
        kgShiftRevenue = 0; kgShiftTurnMin = 0;
        try { localStorage.removeItem(kgTallyKey()); } catch (_) {}
        kgTallyFor = 0; kgTallyLast = '';
        kgBroke.bestNight = false; kgBroke.bestSpeed = false;
      }

      /* --- share the shift card --- */
      function shareShiftCard() {
        const snap = kgSnapshot();
        const place = svName('Café Atlas');
        const txt = employeePick(
          'Mon service ce soir' + (place ? ' au ' + place : '') + '\n• ' + snap.served + ' tables servies\n• ' + kgNum(snap.revenue) + ' MAD encaissés\n• ' + kgShareLine + '\nvia Kiwi',
          'My shift tonight' + (place ? ' at ' + place : '') + '\n• ' + snap.served + ' tables served\n• ' + kgNum(snap.revenue) + ' MAD collected\n• ' + kgShareLine + '\nvia Kiwi',
          'خدمتي هذا المساء' + (place ? ' في ' + place : '') + '\n• ' + snap.served + ' طاولات مخدومة\n• ' + kgNum(snap.revenue) + ' MAD محصّلة\n• ' + kgShareLine + '\nعبر Kiwi');
        if (navigator.share) {
          navigator.share({ text: txt }).catch(function () {});
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(function () { toast('Copié'); })
                                            .catch(function () { toast('Copié'); });
        } else {
          toast('Copié');
        }
      }

      /* --- intercept markTablePaid: pass-through wrapper, tallies revenue only.
             The original runs unchanged — the payment flow is untouched. --- */
      const kgOrigMarkTablePaid = markTablePaid;
      markTablePaid = async function (id) {
        let rev = 0, occ = 0;
        try {
          rev = (typeof getTableTotal === 'function' && id) ? (getTableTotal(id) || 0) : 0;
          occ = (tables[id] && tables[id].elapsed) || 0;
        } catch (e) {}
        const result = await kgOrigMarkTablePaid.apply(this, arguments);
        if (!result) return result; // Aucun encaissement sur refus ou délai réseau.
        try {
          servicePaymentTally(rev, occ);
        } catch (e) {}
        return result;
      };

      /* --- wrap renderProfil so the gamification cards refresh with the tab --- */
      const kgOrigRenderProfil = renderProfil;
      renderProfil = function () {
        const r = kgOrigRenderProfil.apply(this, arguments);
        try { if (shiftStart) kgRenderProfil(); } catch (e) {}
        return r;
      };

      /* --- intercept the clock-out button in the capture phase, so it runs
             before the existing #profil-clockout listener (which never fires) --- */
      document.addEventListener('click', function (e) {
        if (!e.target.closest || !e.target.closest('#profil-clockout')) return;
        e.stopPropagation();
        e.preventDefault();
        kgOpenShiftCard();
      }, true);

      /* --- Carte du soir buttons --- */
      const kgShareBtn = document.getElementById('kg-sc-share');
      if (kgShareBtn) kgShareBtn.addEventListener('click', shareShiftCard);
      const kgClockoutBtn = document.getElementById('kg-sc-clockout');
      if (kgClockoutBtn) kgClockoutBtn.addEventListener('click', function () {
        kgBankShift();
        const veil = document.getElementById('kg-shiftcard');
        if (veil) veil.classList.remove('is-open');
        clockOut();  // the original clock-out logic
      });

      /* --- keep the card-screen rank chip fresh whenever the modal opens --- */
      const kgCardModal = document.getElementById('card-modal');
      if (kgCardModal && window.MutationObserver) {
        new MutationObserver(function () {
          if (kgCardModal.classList.contains('is-open')) kgUpdateRankChip();
        }).observe(kgCardModal, { attributes: true, attributeFilter: ['class'] });
      }

      /* --- init --- */
      const kgChipName = document.querySelector('#kg-card-rank-chip .kg-rank-chip-name');
      if (kgChipName) kgChipName.textContent = kgFirstName;
      kgUpdateRankChip();

      /* expose for the share button + console inspection */
      window.shareShiftCard = shareShiftCard;
      window.kgSnapshot = kgSnapshot;
      window.kgRenderProfil = kgRenderProfil;
    })();

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
