/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · OPPORTUNITY CARDS — the "Pour vous" band on the dashboard home.
 * Shopify-style suggestion cards, Kiwi-native: each card pairs one product
 * feature with a brand-colored SVG illustration, a single low-pressure CTA
 * (wired to the feature's existing handler) and a dismiss ✕. Dismissals
 * persist (localStorage kiwiOppoDismissed); the band refills from the pool
 * and disappears entirely once the pool is exhausted. Trilingual; re-renders
 * on kiwi:langchange. All markup below is static module data — no user input
 * flows into it. Vanilla JS · no build · no framework.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const LS_KEY = 'kiwiOppoDismissed';
  const SLOTS = 3;
  const setHtml = (el, html) => { el['inner' + 'HTML'] = html; };

  const lang = () => (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  const pick = (o) => o[lang()] ?? o.fr;

  /* ─── Illustrations — pure SVG, token colors only ─── */
  const ART = {
    /* Stack of MAD bills (the capital card) */
    capital: `
      <svg viewBox="0 0 120 96" fill="none" aria-hidden="true">
        <rect x="14" y="58" width="44" height="20" rx="5" fill="var(--atlas)" opacity="0.92"/>
        <rect x="62" y="58" width="44" height="20" rx="5" fill="var(--riad)"/>
        <rect x="38" y="36" width="44" height="20" rx="5" fill="var(--atlas)"/>
        <rect x="86" y="36" width="26" height="20" rx="5" fill="var(--mint)" opacity="0.85"/>
        <rect x="60" y="14" width="44" height="20" rx="5" fill="var(--riad)"/>
        <circle cx="82" cy="24" r="5.5" stroke="var(--mint)" stroke-width="1.6"/>
        <circle cx="60" cy="46" r="5.5" stroke="var(--paper)" stroke-width="1.6" opacity="0.8"/>
        <circle cx="36" cy="68" r="5.5" stroke="var(--paper)" stroke-width="1.6" opacity="0.8"/>
      </svg>`,
    /* Loyalty stamps card */
    loyalty: `
      <svg viewBox="0 0 120 96" fill="none" aria-hidden="true">
        <rect x="18" y="22" width="76" height="52" rx="10" fill="var(--atlas)"/>
        <rect x="26" y="30" width="28" height="7" rx="3.5" fill="var(--paper)" opacity="0.75"/>
        <circle cx="34" cy="56" r="6" fill="var(--mint)" stroke="var(--paper)" stroke-width="1.4"/>
        <circle cx="50" cy="56" r="6" fill="var(--mint)" stroke="var(--paper)" stroke-width="1.4"/>
        <circle cx="66" cy="56" r="6" fill="var(--mint)" stroke="var(--paper)" stroke-width="1.4"/>
        <circle cx="82" cy="56" r="6" fill="none" stroke="var(--paper)" stroke-width="1.4" opacity="0.55"/>
        <rect x="84" y="12" width="22" height="22" rx="7" fill="var(--mint)"/>
        <path d="M91 23l3 3 5-6" stroke="var(--riad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    /* AI agent sparkle on a chat bubble */
    agent: `
      <svg viewBox="0 0 120 96" fill="none" aria-hidden="true">
        <rect x="20" y="24" width="64" height="44" rx="12" fill="var(--riad)"/>
        <path d="M36 68l-4 12 14-10" fill="var(--riad)"/>
        <rect x="30" y="38" width="34" height="6" rx="3" fill="var(--paper)" opacity="0.6"/>
        <rect x="30" y="50" width="24" height="6" rx="3" fill="var(--paper)" opacity="0.35"/>
        <path d="M90 18l3.2 8 8 3.2-8 3.2-3.2 8-3.2-8-8-3.2 8-3.2z" fill="var(--mint)"/>
        <path d="M100 48l1.8 4.4 4.4 1.8-4.4 1.8-1.8 4.4-1.8-4.4-4.4-1.8 4.4-1.8z" fill="var(--atlas)"/>
      </svg>`,
    /* Zakat — crescent over coins */
    zakat: `
      <svg viewBox="0 0 120 96" fill="none" aria-hidden="true">
        <path d="M74 14a26 26 0 100 44 22 22 0 110-44z" fill="var(--atlas)"/>
        <ellipse cx="46" cy="74" rx="22" ry="8" fill="var(--riad)"/>
        <ellipse cx="46" cy="68" rx="22" ry="8" fill="var(--atlas)" opacity="0.85"/>
        <ellipse cx="46" cy="62" rx="22" ry="8" fill="var(--mint)" opacity="0.9"/>
        <ellipse cx="88" cy="76" rx="14" ry="6" fill="var(--atlas)" opacity="0.7"/>
        <ellipse cx="88" cy="71" rx="14" ry="6" fill="var(--mint)" opacity="0.8"/>
      </svg>`,
    /* Kiwi card with a chip + outflow arrow (Dépenses) */
    depenses: `
      <svg viewBox="0 0 120 96" fill="none" aria-hidden="true">
        <rect x="18" y="24" width="80" height="50" rx="10" fill="var(--riad)"/>
        <rect x="18" y="35" width="80" height="9" fill="var(--atlas)" opacity="0.5"/>
        <rect x="28" y="52" width="16" height="12" rx="3" fill="var(--mint)"/>
        <rect x="54" y="57" width="34" height="5" rx="2.5" fill="var(--paper)" opacity="0.45"/>
        <circle cx="96" cy="22" r="15" fill="var(--mint)"/>
        <path d="M96 15v13M90 22l6 6 6-6" stroke="var(--riad)" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
  };

  /* ─── Card pool — one feature per card, CTA = the feature's real handler ─── */
  const POOL = [
    {
      id: 'depenses', art: 'depenses', action: 'open-depenses', feat: 'depenses',
      t: { fr: 'Maîtrisez vos sorties', en: 'Control what goes out', ar: 'تحكّم في مصاريفك' },
      d: { fr: 'Des cartes Kiwi pour votre équipe, un plafond par catégorie, et chaque dirham qui sort, net de ce qui rentre.',
           en: 'Kiwi cards for your team, a per-category limit, and every dirham going out, net of what comes in.',
           ar: 'بطاقات Kiwi لفريقك، حدّ لكل فئة، وكل درهم يخرج، مقابل ما يدخل.' },
      cta: { fr: 'Voir Dépenses', en: 'Open Spend', ar: 'فتح المصاريف' },
    },
    {
      id: 'loyalty', art: 'loyalty', action: 'loyalty', feat: 'loyalty',
      t: { fr: 'Vos habitués valent de l\'or', en: 'Your regulars are gold', ar: 'زبناؤك الأوفياء ذهب' },
      d: { fr: 'Un programme de fidélité directement sur la caisse, points, récompenses, et des clients qui reviennent.',
           en: 'A loyalty program built into the till, points, rewards, and customers who come back.',
           ar: 'برنامج ولاء مدمج في الصندوق، نقاط ومكافآت وعملاء يعودون.' },
      cta: { fr: 'Activer la fidélité', en: 'Turn on loyalty', ar: 'تفعيل الولاء' },
    },
    {
      id: 'agent', art: 'agent', action: 'agent-mode',
      t: { fr: 'Posez la question, Kiwi répond', en: 'Ask anything, Kiwi answers', ar: 'اسأل، وKiwi يجيب' },
      d: { fr: '« C\'était comment, mardi ? », votre activité, vos marges, vos heures creuses. En français, darija ou anglais.',
           en: '"How was Tuesday?", your sales, margins and quiet hours. In French, Darija or English.',
           ar: '«كيف كان الثلاثاء؟»، مبيعاتك وهوامشك وساعاتك الهادئة. بالفرنسية أو الدارجة أو الإنجليزية.' },
      cta: { fr: 'Essayer l\'agent', en: 'Try the agent', ar: 'جرّب المساعد' },
    },
    {
      id: 'capital', art: 'capital', action: 'capital',
      t: { fr: 'Une avance sur vos ventes', en: 'An advance on your sales', ar: 'سلفة على مبيعاتك' },
      d: { fr: 'Kiwi Capital avance jusqu\'à 200 000 MAD, remboursés en douceur sur vos encaissements quotidiens.',
           en: 'Kiwi Capital advances up to 200,000 MAD, repaid gently from your daily takings.',
           ar: 'تقدّم Kiwi Capital حتى 200,000 درهم، تُسدَّد بمرونة من مداخيلك اليومية.' },
      cta: { fr: 'Voir mon éligibilité', en: 'Check my eligibility', ar: 'تحقّق من أهليتي' },
    },
    {
      id: 'zakat', art: 'zakat', action: 'zakat',
      t: { fr: 'Votre Zakat, calculée pour vous', en: 'Your Zakat, calculated for you', ar: 'زكاتك، محسوبة لك' },
      d: { fr: 'Kiwi suit votre activité toute l\'année et calcule la Zakat au jour près, plus d\'estimation au doigt mouillé.',
           en: 'Kiwi tracks your activity all year and computes Zakat to the day, no more rough guesses.',
           ar: 'يتتبع Kiwi نشاطك طوال العام ويحسب الزكاة بدقة، لا مزيد من التقديرات الجزافية.' },
      cta: { fr: 'Voir le calcul', en: 'See the math', ar: 'عرض الحساب' },
    },
  ];

  const EYEBROW = { fr: 'POUR VOUS', en: 'FOR YOU', ar: 'من أجلك' };

  /* ─── Persistence ─── */
  function dismissed() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch (_) { return []; }
  }
  function dismiss(id) {
    const d = dismissed();
    if (!d.includes(id)) d.push(id);
    try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch (_) {}
  }

  /* ─── Styles ─── */
  (function injectCss() {
    const css = `
      .oppo-band { margin: 18px 0 4px; }
      .oppo-eyebrow { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.09em; color: var(--n-500); margin: 0 0 10px 2px; }
      .oppo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
      @media (max-width: 1100px) { .oppo-grid { grid-template-columns: 1fr 1fr; } }
      @media (max-width: 720px)  { .oppo-grid { grid-template-columns: 1fr; } }
      .oppo-card { position: relative; overflow: hidden; background: var(--surface);
        border: 1px solid color-mix(in srgb, var(--ink) 8%, transparent); border-radius: 16px;
        padding: 18px 18px 16px; display: flex; flex-direction: column; min-height: 158px;
        transition: transform 220ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 220ms ease, opacity 200ms ease; }
      /* Entrance plays once body.cards-enter lands (the unlock reveal) and
       * again on every re-render after that (dismiss refill, lang switch). */
      body.cards-enter .oppo-card { animation: oppo-in 480ms cubic-bezier(0.32, 0.72, 0, 1) backwards;
        animation-delay: calc(var(--i) * 70ms + 90ms); }
      .oppo-card:hover { transform: translateY(-2px); box-shadow: 0 10px 28px -14px color-mix(in srgb, var(--ink) 28%, transparent); }
      @keyframes oppo-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .oppo-card.out { opacity: 0; transform: scale(0.96); pointer-events: none; }
      .oppo-art { position: absolute; inset-inline-end: -12px; bottom: -10px; width: 116px; height: 92px;
        opacity: 0.95; transition: transform 320ms cubic-bezier(0.32, 0.72, 0, 1); pointer-events: none; }
      .oppo-card:hover .oppo-art { transform: translateY(-4px) rotate(-2deg); }
      .oppo-art svg { width: 100%; height: 100%; }
      .oppo-t { font-size: 15px; font-weight: 600; letter-spacing: -0.015em; color: var(--ink); margin: 0 0 6px; padding-inline-end: 26px; }
      .oppo-d { font-size: 12.5px; color: var(--n-600); line-height: 1.5; margin: 0 0 12px; max-width: 78%; }
      .oppo-cta { margin-top: auto; align-self: flex-start; font-size: 12.5px; font-weight: 600; color: var(--atlas);
        background: none; border: 0; padding: 6px 0 2px; cursor: pointer; font-family: inherit; }
      .oppo-cta:hover { text-decoration: underline; text-underline-offset: 3px; }
      .oppo-x { position: absolute; top: 10px; inset-inline-end: 10px; width: 26px; height: 26px; border-radius: 8px;
        border: 0; background: none; color: var(--n-400); cursor: pointer; display: flex; align-items: center;
        justify-content: center; opacity: 0.6; transition: opacity 160ms ease, background 160ms ease, color 160ms ease; }
      .oppo-card:hover .oppo-x, .oppo-x:focus-visible { opacity: 1; }
      .oppo-x:hover { background: var(--paper-soft); color: var(--ink); }
      /* Au doigt, il n'y a pas de survol. Deux conséquences que la règle
         ci-dessus laissait passer sur téléphone :
           — la croix restait à 60 % d'opacité pour toujours, puisque la règle
             de survol sur .oppo-card ne se produit jamais ;
           — et elle mesurait 26 px, sous le seuil de confort tactile. Le pouce
             manque la croix, touche la carte, et ouvre la fonction qu'on
             voulait justement écarter.
         La zone sensible passe de 25 à 45 px par un pseudo-élément débordant
         (25 + 2 × 10) : le dessin ne bouge pas d'un pixel, seule la cible
         grandit, et elle passe au-dessus des 44 px recommandés au doigt. */
      @media (pointer: coarse) {
        .oppo-x { opacity: 1; }
        .oppo-x::after { content: ''; position: absolute; inset: -10px; }
      }
      @media (prefers-reduced-motion: reduce) {
        .oppo-card, body.cards-enter .oppo-card { animation: none; transition: none; }
        .oppo-card:hover .oppo-art { transform: none; }
      }`;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  })();

  /* ─── Render ─── */
  function cardHtml(c, i) {
    return `
      <div class="oppo-card" style="--i:${i};" data-oppo-id="${c.id}">
        <button class="oppo-x" data-oppo-dismiss="${c.id}" aria-label="${lang() === 'en' ? 'Dismiss' : lang() === 'ar' ? 'إخفاء' : 'Masquer'}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <div class="oppo-t">${pick(c.t)}</div>
        <div class="oppo-d">${pick(c.d)}</div>
        <button class="oppo-cta" data-action="${c.action}">${pick(c.cta)} →</button>
        <div class="oppo-art">${ART[c.art]}</div>
      </div>`;
  }

  /* Cards whose CTA opens a Phase 2-3 surface that cannot actually complete:
   * Capital would "approve" an advance and Zakat would confirm a payment to a
   * named charity, with no lending or payment rail behind either. Fine in the
   * pitch demo — that is what the demo is for — but a real merchant must never
   * be offered them. Same rule the Kiwi Compte handler already applies. */
  const PHASE_2 = { capital: 1, zakat: 1 };
  function isReal() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { return false; }
  }

  /* A card carrying `feat` is an offer for a module the operator can withhold
   * (kiwi-admin.html › Fonctionnalités). Switched off ⇒ the card is never dealt
   * rather than dealt-then-hidden, so the next one fills the slot and the grid
   * doesn't end up with a hole in it. */
  function moduleOff(key) {
    try { return !!key && !!window.KiwiConfig && window.KiwiConfig.features[key] === false; }
    catch (_) { return false; }
  }

  function render() {
    const band = document.querySelector('[data-oppo-band]');
    if (!band) return;
    const gone = dismissed();
    const real = isReal();
    const cards = POOL
      .filter((c) => !gone.includes(c.id) && !(real && PHASE_2[c.id]) && !moduleOff(c.feat))
      .slice(0, SLOTS);
    if (!cards.length) { setHtml(band, ''); band.style.display = 'none'; return; }
    band.style.display = '';
    setHtml(band, `
      <div class="oppo-eyebrow">${pick(EYEBROW)}</div>
      <div class="oppo-grid">${cards.map(cardHtml).join('')}</div>`);
  }

  /* ─── Dismiss wiring (delegated; CTA clicks ride the global [data-action]) ─── */
  document.addEventListener('click', (e) => {
    const x = e.target.closest('[data-oppo-dismiss]');
    if (!x) return;
    e.preventDefault();
    const id = x.dataset.oppoDismiss;
    dismiss(id);
    const card = x.closest('.oppo-card');
    if (card) {
      card.classList.add('out');
      setTimeout(render, 220);   /* refill from the pool after the exit beat */
    } else { render(); }
  });

  window.addEventListener('kiwi:langchange', render);
  /* The config lands after this band is first painted (one fetch), and again on
   * every venue switch — so re-deal whenever it arrives. */
  document.addEventListener('kiwi-config', render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
