/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ACCOUNT — the profile-menu destinations as real full .app pages.
 *
 * "Mon profil", "Facturation" and "Centre d'aide" used to be toast stubs. They
 * now open as full pages via Kiwi.appPage() (same format as every sidebar
 * destination), each with genuinely useful, data-driven content. Trilingual.
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  const Kiwi = window.Kiwi;
  if (!Kiwi) return;
  const handlers = Kiwi.handlers;
  const lang = () => (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pick = (o) => (o && (o[lang()] != null ? o[lang()] : o.fr)) || '';

  /* Account owner (demo). A real build would hydrate these from the session. */
  const OWNER = { name: 'Rachid Benhima', initials: 'RB', email: 'rachid@cafeatlas.ma', phone: '+212 6 61 24 88 03' };
  const PLAN = { name: 'Kiwi Pro', price: '399 MAD', cycle: pick({ fr: '/mois', en: '/mo', ar: '/شهر' }) };

  /* ── one-time styles (token-based → light/dark correct) ─────────────────── */
  (function injectCss() {
    const css = `
      .acc-hero { display:flex; align-items:center; gap:16px; padding:20px; border-radius:16px; background:linear-gradient(150deg,#0c4a35,#08311f); color:#fff; margin-bottom:18px; }
      .acc-avatar { width:60px; height:60px; border-radius:50%; background:var(--mint); color:#06371f; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:22px; flex-shrink:0; }
      .acc-hero-name { font-size:20px; font-weight:600; letter-spacing:-0.02em; }
      .acc-hero-role { font-size:12.5px; color:rgba(255,255,255,0.72); margin-top:3px; }
      .acc-hero .acc-cta { margin-inline-start:auto; }
      .acc-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; }
      @media (max-width:820px){ .acc-grid { grid-template-columns:1fr; } }
      .acc-card { border:1px solid var(--n-200); border-radius:14px; padding:16px 18px; background:var(--surface); }
      .acc-card.span2 { grid-column:1 / -1; }
      .acc-eyebrow { font-family:var(--mono); font-size:10.5px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); margin-bottom:12px; }
      .acc-row { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:8px 0; border-bottom:1px solid var(--n-100); font-size:13.5px; }
      .acc-row:last-child { border-bottom:0; }
      .acc-row > span { color:var(--n-500); }
      .acc-row > b { font-weight:600; color:var(--ink); }
      .acc-row .ok { color:var(--success); }
      .acc-row a { color:var(--atlas); font-weight:600; cursor:pointer; }
      .acc-chips { display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
      .acc-chip { font-size:11px; font-weight:600; padding:4px 10px; border-radius:999px; background:var(--mint-soft); color:var(--atlas); }
      .acc-venue { display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom:1px solid var(--n-100); font-size:13.5px; }
      .acc-venue:last-child { border-bottom:0; }
      .acc-venue b { font-weight:600; } .acc-venue span { color:var(--n-500); font-size:12px; }
      .acc-cta { background:var(--atlas); color:#fff; border:0; border-radius:9px; padding:9px 16px; font-size:12.5px; font-weight:600; font-family:var(--sans); cursor:pointer; transition:transform 120ms var(--spring), filter 140ms ease, background 140ms ease, border-color 140ms ease; }
      .acc-cta.ghost { background:transparent; color:var(--ink); border:1px solid var(--n-300); }
      .acc-cta.light { background:var(--surface); color:#08311f; }
      .acc-cta:hover { filter:brightness(1.06); }
      .acc-cta:active { transform:scale(0.97); }
      .acc-cta:focus-visible { outline:2px solid var(--atlas); outline-offset:2px; }
      .acc-add-biz:active { transform:scale(0.98); }
      .acc-add-biz:focus-visible { outline:2px solid var(--atlas); outline-offset:2px; }
      .acc-contact-card:active, .acc-topic:active { transform:scale(0.98); }
      .acc-contact-card:focus-visible, .acc-topic:focus-visible { outline:2px solid var(--atlas); outline-offset:2px; }
      .acc-plan { display:flex; align-items:center; gap:18px; padding:22px; border-radius:16px; background:linear-gradient(150deg,#0c4a35,#08311f); color:#fff; margin-bottom:16px; flex-wrap:wrap; }
      .acc-plan-price { font-size:30px; font-weight:600; letter-spacing:-0.02em; }
      .acc-plan-price small { font-size:14px; font-weight:400; opacity:0.7; }
      .acc-plan-name { font-family:var(--mono); font-size:11px; letter-spacing:0.1em; color:rgba(255,255,255,0.7); }
      .acc-plan-meta { font-size:12.5px; color:rgba(255,255,255,0.8); margin-top:4px; }
      .acc-plan-acts { margin-inline-start:auto; display:flex; gap:10px; flex-wrap:wrap; }
      .acc-tbl { width:100%; border-collapse:collapse; font-size:13px; }
      .acc-tbl th { text-align:start; font-family:var(--mono); font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:var(--n-500); padding:8px 6px; border-bottom:1px solid var(--n-200); font-weight:500; }
      .acc-tbl td { padding:11px 6px; border-bottom:1px solid var(--n-100); }
      .acc-tbl tr:last-child td { border-bottom:0; }
      .acc-paid { font-size:11px; font-weight:600; color:var(--success); }
      .acc-dl { color:var(--atlas); font-weight:600; cursor:pointer; }
      .acc-search { width:100%; padding:13px 16px; border:1px solid var(--n-200); border-radius:12px; background:var(--surface); color:var(--ink); font-family:var(--sans); font-size:14px; outline:none; box-sizing:border-box; margin-bottom:18px; }
      .acc-search:focus { border-color:var(--atlas); }
      .acc-contact { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px; }
      @media (max-width:820px){ .acc-contact { grid-template-columns:1fr; } }
      .acc-contact-card { border:1px solid var(--n-200); border-radius:14px; padding:16px; background:var(--surface); cursor:pointer; transition:border-color 130ms; }
      .acc-contact-card:hover { border-color:var(--atlas); }
      .acc-contact-card .t { font-weight:600; font-size:14px; margin-bottom:3px; }
      .acc-contact-card .d { font-size:12px; color:var(--n-500); }
      .acc-topics { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
      @media (max-width:820px){ .acc-topics { grid-template-columns:1fr; } }
      .acc-topic { display:flex; justify-content:space-between; align-items:center; border:1px solid var(--n-200); border-radius:12px; padding:14px 16px; background:var(--surface); cursor:pointer; transition:border-color 130ms; }
      .acc-topic:hover { border-color:var(--atlas); }
      .acc-topic b { font-weight:600; font-size:13.5px; } .acc-topic span { color:var(--n-500); font-size:12px; }
      .acc-status { display:flex; align-items:center; gap:9px; margin-top:18px; padding:13px 16px; border-radius:12px; background:var(--mint-soft); font-size:13px; color:var(--ink); }
      .acc-status .dot { width:8px; height:8px; border-radius:50%; background:var(--success); flex-shrink:0; }
      .acc-sec-title { font-size:14px; font-weight:600; margin:22px 0 12px; }
      .acc-section-head { display:flex; align-items:center; justify-content:space-between; margin:26px 0 14px; }
      .acc-section-head h3 { font-size:15px; font-weight:600; margin:0; letter-spacing:-0.01em; }
      .acc-section-head .ct { font-size:12px; color:var(--n-500); font-family:var(--mono); }
      .acc-biz { border:1px solid var(--n-200); border-radius:16px; background:var(--surface); padding:18px 20px; margin-bottom:14px; transition:border-color 140ms, box-shadow 140ms; }
      .acc-biz:hover { border-color:var(--n-300); box-shadow:0 8px 26px -18px rgba(11,110,79,0.30); }
      .acc-biz-head { display:flex; align-items:flex-start; gap:13px; }
      .acc-biz-logo { width:44px; height:44px; border-radius:13px; background:var(--mint-soft); color:var(--atlas); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:15px; flex-shrink:0; overflow:hidden; }
      .acc-biz-logo img { width:100%; height:100%; object-fit:contain; background:#fff; }
      .acc-biz-name { font-size:15.5px; font-weight:600; letter-spacing:-0.01em; }
      .acc-biz-meta { font-size:12px; color:var(--n-500); margin-top:2px; }
      .acc-biz-badge { font-size:9.5px; font-weight:700; padding:3px 8px; border-radius:999px; background:var(--atlas); color:#fff; letter-spacing:0.06em; }
      .acc-stat-row { display:flex; gap:10px; margin:15px 0; flex-wrap:wrap; }
      .acc-stat { flex:1; min-width:120px; background:var(--paper-soft); border-radius:12px; padding:11px 14px; }
      .acc-stat .v { font-size:18px; font-weight:600; font-family:var(--mono); letter-spacing:-0.02em; color:var(--ink); }
      .acc-stat .l { font-size:10px; color:var(--n-500); font-family:var(--mono); text-transform:uppercase; letter-spacing:0.06em; margin-top:3px; }
      .acc-legal { display:grid; grid-template-columns:repeat(3,1fr); gap:12px 18px; border-top:1px solid var(--n-100); padding-top:14px; }
      @media (max-width:820px){ .acc-legal { grid-template-columns:repeat(2,1fr); } }
      .acc-legal .k { font-size:9.5px; color:var(--n-500); font-family:var(--mono); text-transform:uppercase; letter-spacing:0.05em; }
      .acc-legal .v { font-size:13px; font-weight:500; margin-top:2px; font-variant-numeric:tabular-nums; }
      .acc-add-biz { width:100%; border:1.5px dashed var(--n-300); border-radius:14px; padding:14px; background:transparent; color:var(--atlas); font-weight:600; font-size:13.5px; font-family:var(--sans); cursor:pointer; transition:border-color 140ms, background 140ms; }
      .acc-add-biz:hover { border-color:var(--atlas); background:var(--mint-soft); }
      /* Les RÉGLAGES d'un établissement — horaires, reçu. Ce sont des écrans à
         ouvrir, pas des mentions à lire : ils ne peuvent pas ressembler aux
         lignes légales juste au-dessus. Un bouton, une icône, un chevron. */
      .acc-acts { display:grid; gap:9px; margin-top:15px; padding-top:15px; border-top:1px solid var(--n-100); }
      @media (min-width:760px){ .acc-acts { grid-template-columns:1fr 1fr; } }
      .acc-act { display:flex; align-items:center; gap:12px; width:100%; text-align:start; border:1px solid var(--n-200); border-radius:13px; background:var(--paper-soft); padding:12px 14px; cursor:pointer; font-family:var(--sans); color:var(--ink); transition:border-color 140ms, background 140ms, box-shadow 140ms; }
      .acc-act:hover { border-color:var(--atlas); background:var(--surface); box-shadow:0 8px 22px -18px rgba(11,110,79,0.45); }
      .acc-act:focus-visible { outline:2px solid var(--atlas); outline-offset:2px; }
      .acc-act[disabled] { cursor:default; opacity:0.7; }
      .acc-act[disabled]:hover { border-color:var(--n-200); background:var(--paper-soft); box-shadow:none; }
      .acc-act-ico { width:34px; height:34px; border-radius:11px; flex-shrink:0; display:grid; place-items:center; background:var(--mint-soft); font-size:15px; }
      .acc-act-txt { flex:1; min-width:0; }
      .acc-act-t { font-size:13.5px; font-weight:600; letter-spacing:-0.01em; }
      .acc-act-v { font-size:12px; color:var(--n-600); margin-top:3px; display:flex; align-items:center; gap:6px; }
      .acc-act-v .dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
      .acc-act-sub { font-size:11px; color:var(--n-500); margin-top:3px; line-height:1.45; }
      .acc-act-go { flex-shrink:0; color: var(--n-500); display:grid; place-items:center; }
      .acc-act:hover .acc-act-go { color:var(--atlas); }
      [dir="rtl"] .acc-act-go { transform:scaleX(-1); }
      /* Le formulaire établissement. Un seul ascenseur : la fenêtre elle-même
         défile déjà (.kiwi-modal), un second à l'intérieur coupait le dernier
         champ et donnait deux barres de défilement imbriquées. */
      .acc-form { display:grid; grid-template-columns:1fr 1fr; gap:0 14px; }
      @media (max-width:560px){ .acc-form { grid-template-columns:1fr; } }
      .acc-form-sec { grid-column:1/-1; font-family:var(--mono); font-size:10px; letter-spacing:0.1em; text-transform:uppercase; color:var(--n-500); margin:20px 0 2px; padding-top:14px; border-top:1px solid var(--n-100); }
      .acc-form-sec:first-child { margin-top:4px; padding-top:0; border-top:0; }
      .acc-form-sec .why { display:block; font-family:var(--sans); font-size:11.5px; letter-spacing:0; text-transform:none; color:var(--n-500); margin-top:5px; line-height:1.5; }
      .acc-f, .acc-sel { width:100%; padding:11px 13px; border:1px solid var(--n-200); border-radius:10px; font-family:var(--sans); font-size:14px; color:var(--ink); background:var(--surface); outline:none; box-sizing:border-box; }
      .acc-f:focus, .acc-sel:focus { border-color:var(--atlas); }
      .acc-lbl { display:block; font-size:11.5px; font-weight:500; color:var(--n-600); margin:13px 0 6px; }
      .acc-hint { font-size:11px; color:var(--n-500); margin:5px 0 0; line-height:1.45; }
      .acc-logo-picker { display:flex; align-items:center; gap:12px; padding:10px; border:1px solid var(--n-200); border-radius:11px; }
      .acc-logo-preview { width:54px; height:54px; border-radius:12px; display:grid; place-items:center; overflow:hidden; background:var(--mint-soft); color:var(--atlas); font-weight:700; flex-shrink:0; }
      .acc-logo-preview img { width:100%; height:100%; object-fit:contain; background:#fff; }
      .acc-kpi-band { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:18px; }
      @media (max-width:900px){ .acc-kpi-band { grid-template-columns:repeat(2,1fr); } }
      @media (max-width:520px){ .acc-kpi-band { grid-template-columns:1fr; } }
      .acc-kpi-box { border:1px solid var(--n-200); border-radius:16px; padding:16px 18px; background:var(--surface); }
      .acc-kpi-box .val { font-size:22px; font-weight:700; font-family:var(--mono); color:var(--ink); letter-spacing:-0.03em; }
      .acc-kpi-box .lbl { font-size:12.5px; font-weight:600; color:var(--ink); margin-top:3px; }
      .acc-kpi-box .sub { font-size:11px; color:var(--n-500); margin-top:2px; }
      
      .acc-hero-card { border:1px solid var(--n-200); border-radius:18px; padding:22px 24px; background:var(--surface); margin-bottom:18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px; }
      .acc-hero-left { display:flex; align-items:center; gap:16px; }
      .acc-hero-avatar { width:52px; height:52px; border-radius:16px; background:linear-gradient(135deg,#0C6B4E,#04241A); color:var(--mint); font-weight:700; font-size:19px; display:grid; place-items:center; box-shadow:0 8px 24px -8px rgba(0,255,174,0.35); flex-shrink:0; }
      .acc-hero-biz { font-size:19px; font-weight:700; color:var(--ink); letter-spacing:-0.02em; }
      .acc-hero-meta { font-size:12.5px; color:var(--n-500); margin-top:3px; display:flex; align-items:center; gap:8px; }
      
      .acc-meter-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      @media (max-width:760px){ .acc-meter-grid { grid-template-columns:1fr; } }
      .acc-meter-item { border:1px solid var(--n-200); border-radius:14px; padding:14px 16px; background:var(--surface); }
      .acc-meter-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
      .acc-meter-t { font-size:13.5px; font-weight:600; color:var(--ink); display:flex; align-items:center; gap:8px; }
      .acc-meter-pct { font-size:12px; font-weight:700; font-family:var(--mono); color:var(--atlas); background:var(--mint-soft); padding:2px 7px; border-radius:6px; }
      .acc-meter-desc { font-size:11.5px; color:var(--n-500); margin-bottom:10px; }
      .acc-meter-track { width:100%; height:6px; border-radius:999px; background:var(--n-200); overflow:hidden; }
      .acc-meter-fill { height:100%; border-radius:999px; background:linear-gradient(90deg,var(--atlas),var(--mint)); }
      
      .acc-fleet-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      @media (max-width:760px){ .acc-fleet-grid { grid-template-columns:1fr; } }
      .acc-fleet-card { border:1px solid var(--n-200); border-radius:14px; padding:14px 16px; background:var(--surface); display:flex; align-items:flex-start; gap:12px; }
      .acc-fleet-ico { width:38px; height:38px; border-radius:11px; background:var(--paper-soft); border:1px solid var(--n-200); display:grid; place-items:center; font-size:16px; flex-shrink:0; }
      .acc-fleet-info { flex:1; min-width:0; }
      .acc-fleet-name { font-size:13.5px; font-weight:600; color:var(--ink); }
      .acc-fleet-role { font-size:11.5px; color:var(--n-500); margin-top:2px; }
      .acc-fleet-status { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600; color:var(--success); margin-top:6px; background:rgba(0,255,174,0.1); padding:2px 7px; border-radius:6px; }
      .acc-fleet-status .dot { width:6px; height:6px; border-radius:50%; background:var(--success); }

      /* RTL alignment polish */
      [dir="rtl"] .acc-kpi-box,
      [dir="rtl"] .acc-hero-left,
      [dir="rtl"] .acc-fleet-card { text-align: start; }
      [dir="rtl"] .acc-hero-avatar { margin-left: 0; margin-right: 0; }
      [dir="rtl"] .acc-meter-track { direction: ltr; }

      .acc-danger { color:var(--danger); cursor:pointer; font-weight:600; font-size:12.5px; background:transparent; border:1px solid color-mix(in srgb,var(--danger) 38%,transparent); border-radius:9px; padding:9px 16px; font-family:var(--sans); transition:background 140ms; }
      .acc-danger:hover { background:color-mix(in srgb,var(--danger) 10%,transparent); }
      /* Dark mode explicit harmony with crisp borders */
      html[data-theme="dark"] .acc-card,
      html[data-theme="dark"] .acc-biz,
      html[data-theme="dark"] .acc-contact-card,
      html[data-theme="dark"] .acc-topic,
      html[data-theme="dark"] .acc-hero-card,
      html[data-theme="dark"] .acc-kpi-box,
      html[data-theme="dark"] .acc-meter-item,
      html[data-theme="dark"] .acc-fleet-card {
        background: rgba(255, 255, 255, 0.045);
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.03), 0 8px 30px -12px rgba(0, 0, 0, 0.7);
      }
      html[data-theme="dark"] .acc-row { border-bottom-color: rgba(255, 255, 255, 0.07); }
      html[data-theme="dark"] .acc-stat { background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); }
      html[data-theme="dark"] .acc-act { background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.12); color: var(--ink); }
      html[data-theme="dark"] .acc-act:hover { background: rgba(255, 255, 255, 0.07); border-color: rgba(0, 255, 174, 0.4); box-shadow: 0 8px 24px -14px rgba(0, 255, 174, 0.3); }
      html[data-theme="dark"] .acc-cta.ghost { border: 1px solid rgba(255, 255, 255, 0.22); color: var(--ink); }
      html[data-theme="dark"] .acc-cta.ghost:hover { border-color: rgba(255, 255, 255, 0.4); background: rgba(255, 255, 255, 0.06); }
      html[data-theme="dark"] .acc-cta.light { background: rgba(255, 255, 255, 0.14); color: #fff; border: 1px solid rgba(255, 255, 255, 0.18); }
      html[data-theme="dark"] .acc-meter-track { background: rgba(255, 255, 255, 0.08); }
      html[data-theme="dark"] .acc-fleet-ico { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.1); }
      html[data-theme="dark"] .acc-f,
      html[data-theme="dark"] .acc-sel,
      html[data-theme="dark"] .acc-search { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.16); color: #fff; }`;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  })();

  const getSet = (k, def) => { try { return localStorage.getItem('kiwiSet:' + k) || def; } catch (_) { return def; } };
  // A REAL session = a signed-in merchant (or the operator scoped into one), both
  // of which set window.KiwiMe, OR any hosted domain (never a demo). In a real
  // session the demo owner "Rachid Benhima" / "Café Atlas" and its fabricated
  // legal registration must NEVER appear — the account shows itself, with legal
  // fields blank ("à compléter") because the client hasn't entered them.
  const meVal = (k) => { try { return (window.KiwiMe && window.KiwiMe[k]) || ''; } catch (_) { return ''; } };
  const pairedVenue = () => {
    try {
      if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedVenue === 'function') {
        const pv = window.KiwiPlatform.pairedVenue();
        if (window.KiwiPlatform.isPaired() && pv?.merchant) return pv;
      }
      const P = window.KiwiCaissePairing;
      const pv = P?.pairedVenue?.();
      if (P?.isPaired?.() && pv?.merchant) return pv;
    } catch (_) {}
    try {
      if (localStorage.getItem('kiwiPaired') !== '1') return null;
      const pv = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      return pv?.merchant ? pv : null;
    } catch (_) { return null; }
  };
  const isReal = () => !!(window.KiwiEnv?.isReal?.() || window.KiwiMe || window.KiwiVenue?.isCustom?.() || pairedVenue());
  const ownSetting = (k, demo) => {
    const v = getSet(k, '');
    return isReal() && v === demo ? '' : v;
  };
  const ownerName = () => meVal('name') || ownSetting('ownerName', OWNER.name) || (isReal() ? '' : OWNER.name);
  const ownerEmail = () => meVal('email') || ownSetting('ownerEmail', OWNER.email) || (isReal() ? '' : OWNER.email);
  const ownerPhone = () => ownSetting('ownerPhone', OWNER.phone) || (isReal() ? '' : OWNER.phone);
  const ownerLang = () => pick({ fr: 'Français', en: 'English', ar: 'العربية' });
  const fmtMAD = (n) => Number(n).toLocaleString('fr-FR').replace(/[  ,]/g, ' ');

  /* ── Subscription ladder (mirrors the 4-tier model) ── */
  const PLAN_LADDER = ['basic', 'pro', 'ultra', 'ultimate'];
  const PLAN_INFO = {
    basic: { name: 'Kiwi Basic', price: '199 MAD' },
    pro: { name: 'Kiwi Pro', price: '399 MAD' },
    ultra: { name: 'Kiwi Ultra', price: '1 499 MAD' },
    ultimate: { name: 'Kiwi Ultimate', price: '—' },
  };
  const curPlan = () => getSet('plan', 'pro');

  /* ── Businesses (multi-établissement). Defaults + per-field localStorage
   *    overrides (kiwiSet:biz:<id>:<field>) + user-added extras (kiwiBizExtra). ── */
  const BIZ_FIELDS = [
    { k: 'name', label: { fr: "Nom commercial", en: 'Trading name', ar: 'الاسم التجاري' }, sec: 'id', span: true, max: 40 },
    { k: 'logo', kind: 'logo', label: { fr: "Logo de l’établissement", en: 'Business logo', ar: 'شعار المؤسسة' }, span: true },
    { k: 'slogan', label: { fr: 'Slogan', en: 'Slogan', ar: 'الشعار النصي' }, span: true, max: 120 },
    /* La raison sociale. Distincte du nom commercial exprès : « Amira Boutique »
     * est ce que lit le client, « SARL AMIRA DISTRIBUTION » est ce que réclame
     * une pièce comptable. Le reçu imprime la seconde SOUS la première, et
     * seulement si elle en diffère — l'imprimer deux fois fait douter du ticket. */
    { k: 'legalName', label: { fr: 'Raison sociale', en: 'Legal name', ar: 'الاسم القانوني' }, span: true, max: 60,
      hint: { fr: "Le nom déposé, s'il diffère de l'enseigne. Il s'imprime sous le nom commercial.", en: 'The registered name, if it differs from the shopfront. Printed under the trading name.', ar: 'الاسم المسجّل إن اختلف عن اسم المحل.' } },
    /* Le MÉTIER, choisi et non écrit. Ce champ était libre : on pouvait taper
     * « boutique de fleurs », « resto », n'importe quoi — et rien ne se
     * passait, parce que le produit ne comprend que les métiers de la liste
     * (assets/trades.js), les mêmes qu'à l'inscription. Un réglage qui accepte
     * tout et n'applique rien fait croire au commerçant qu'il a configuré son
     * établissement. Il décide vraiment de quelque chose : les écrans. */
    { k: 'type', kind: 'trade', label: { fr: "Type d'activité", en: 'Activity type', ar: 'نوع النشاط' }, span: true,
      hint: { fr: 'Détermine les écrans de ce commerce — carte et tables, catalogue et codes-barres, prestations, chambres.', en: 'Decides this business’s screens — menu and tables, catalogue and barcodes, treatments, rooms.', ar: 'يحدّد شاشات هذا النشاط.' } },
    { k: 'address', label: { fr: 'Adresse', en: 'Address', ar: 'العنوان' }, span: true, max: 90 },
    { k: 'city', label: { fr: 'Ville', en: 'City', ar: 'المدينة' }, max: 30 },
    { k: 'phone', label: { fr: 'Téléphone', en: 'Phone', ar: 'الهاتف' }, max: 22, attr: 'type="tel" inputmode="tel" autocomplete="tel"' },
    /* Pas de champ `hours` ici. Les horaires d'ouverture ne sont plus une ligne
     * de texte parmi les mentions légales : ils ont un écran structuré unique
     * (Réglages → Heures d'ouverture, assets/hours-ui.js) et une fiche par
     * établissement que tout le produit interroge. Ce formulaire en tenait une
     * SECONDE copie, libre, que rien ne lisait — deux réglages pour une même
     * réalité, dont un faux dès que l'autre changeait. */
    { k: 'ice', sec: 'legal', label: { fr: 'ICE', en: 'ICE', ar: 'ICE' }, max: 15, attr: 'inputmode="numeric" autocomplete="off"',
      hint: { fr: '15 chiffres', en: '15 digits', ar: '15 رقماً' } },
    { k: 'fiscal', label: { fr: 'Identifiant Fiscal (IF)', en: 'Tax ID (IF)', ar: 'الرقم الضريبي' }, max: 15, attr: 'inputmode="numeric" autocomplete="off"' },
    { k: 'rc', label: { fr: 'Registre de Commerce (RC)', en: 'Trade Register (RC)', ar: 'السجل التجاري' }, max: 30, attr: 'autocomplete="off"' },
    { k: 'patente', label: { fr: 'Patente', en: 'Patente', ar: 'الباتنتا' }, max: 15, attr: 'inputmode="numeric" autocomplete="off"' },
    { k: 'cnss', label: { fr: 'CNSS', en: 'CNSS', ar: 'CNSS' }, max: 15, attr: 'inputmode="numeric" autocomplete="off"' },
  ];
  /* Les deux intertitres du formulaire. Onze champs à la file, sans hiérarchie
   * ni explication, se lisaient comme une formalité administrative ; ils se
   * lisent maintenant comme deux questions distinctes. */
  const BIZ_SECTIONS = {
    id: { label: { fr: 'Identité', en: 'Identity', ar: 'الهوية' } },
    legal: { label: { fr: 'Mentions légales', en: 'Legal details', ar: 'البيانات القانونية' },
      why: { fr: "S'impriment sur chaque reçu et chaque facture. Une mention laissée vide n'est pas imprimée du tout — un tiret à la place d'un ICE ressemble à un ICE illisible.", en: 'Printed on every receipt and invoice. A detail left blank is not printed at all — a dash in place of an ICE reads as an unreadable ICE.', ar: 'تُطبع على كل وصل وفاتورة. البيان الفارغ لا يُطبع إطلاقاً.' } },
  };
  const BIZ_DEFAULTS = [
    { id: 'cafeAtlas', name: 'Café Atlas · Maarif', type: 'Café · Restaurant', city: 'Casablanca', address: '12 Rue Allal Ben Abdellah, Maarif', primary: true, ice: '002593840000047', fiscal: '40512893', rc: 'Casablanca 458921', patente: '31204567', cnss: '8842157', phone: '+212 5 22 39 11 84', hours: '07:00 – 23:00', revenue: 825000, orders: 3240, team: 15 },
    { id: 'maisonMansour', name: 'Maison Mansour', type: 'Restaurant · Traiteur', city: 'Casablanca', address: "45 Boulevard d'Anfa", primary: false, ice: '002593840000128', fiscal: '40698215', rc: 'Casablanca 472310', patente: '31288901', cnss: '8847720', phone: '+212 5 22 48 60 03', hours: '12:00 – 00:00', revenue: 358000, orders: 1180, team: 9 },
    { id: 'spaBahia', name: 'Spa Bahia', type: 'Spa · Hammam', city: 'Marrakech', address: '8 Rue de la Liberté, Guéliz', primary: false, ice: '002593840000206', fiscal: '50231764', rc: 'Marrakech 119045', patente: '47120338', cnss: '5521090', phone: '+212 5 24 43 77 21', hours: '10:00 – 21:00', revenue: 269000, orders: 640, team: 6 },
  ];
  const extraBiz = () => { try { return JSON.parse(localStorage.getItem('kiwiBizExtra') || '[]'); } catch (_) { return []; } };
  const setExtraBiz = (a) => { try { localStorage.setItem('kiwiBizExtra', JSON.stringify(a)); } catch (_) {} };

  /* ── OÙ VIVENT LES MENTIONS LÉGALES ────────────────────────────────────────
   * Elles vivaient dans `kiwiSet:biz:<carte>:<champ>` — un localStorage, donc
   * UN navigateur, rangé sous l'identifiant d'une carte d'écran et pas d'un
   * établissement. Le commerçant saisissait son ICE au bureau et son ticket
   * sortait sans mention légale au comptoir ; il changeait d'appareil et tout
   * était à ressaisir.
   *
   * Une carte adossée à un ÉTABLISSEMENT (une venue) lit et écrit maintenant
   * `KiwiReceipt.business(venueId)` : per-établissement, mirroré serveur, et
   * c'est la source que le reçu, la caisse et le détail d'une transaction
   * interrogent. L'ancien stockage est repris une fois (migrateBusiness), puis
   * plus jamais relu.
   *
   * Une carte SANS établissement — une fiche ajoutée à la main dans cet écran,
   * qui ne correspond à aucun magasin du sélecteur — garde exactement l'ancien
   * comportement. Lui inventer une venue rangerait ses mentions sous une clé
   * que rien d'autre ne résout. */
  const bizVenueId = (b) => {
    if (b && b.venueId) return b.venueId;
    try {
      const KV = window.KiwiVenue;
      if (!KV) return null;
      if (KV.VENUES && b && KV.VENUES[b.id]) return b.id;
      if (b && b.primary) return (KV.getVenue && KV.getVenue()) || null;
    } catch (_) {}
    return null;
  };
  const KR = () => window.KiwiReceipt;
  const KT = () => window.KiwiTrades;
  /* ── LE MÉTIER D'UNE FICHE ──────────────────────────────────────────────
   * En identifiant (assets/trades.js), jamais en texte. Pour une fiche
   * adossée à un établissement, la vérité est l'établissement : c'est son
   * `subtype` qui décide des écrans que le propriétaire a réellement sous les
   * yeux. L'ancien texte libre (kiwiSet:biz:<carte>:type) n'a jamais rien
   * piloté ; on le reconnaît encore pour les fiches sans établissement, on ne
   * lui laisse plus contredire le magasin. */
  const bizTrade = (b) => {
    const T = KT();
    if (!T) return '';
    const written = T.resolve(getSet('biz:' + b.id + ':type', '') || b.trade || b.type || '');
    const vid = bizVenueId(b);
    if (vid) {
      try {
        const v = (window.KiwiVenue.VENUES || {})[vid] || {};
        const real = T.resolve(v.subtype || v.type);
        if (real) {
          /* Le texte porté par la fiche ne l'emporte que s'il DIT LA MÊME CHOSE
           * que l'établissement : « Café · Restaurant » sur une venue
           * restaurant est plus précis, on le garde. « Restaurant · Traiteur »
           * sur une venue boutique était un mensonge de la fiche de démo —
           * l'établissement gagne, parce que c'est lui qui décide des écrans. */
          if (written && T.base(written) === T.base(real)) return written;
          return real;
        }
      } catch (_) {}
    }
    return written;
  };
  const bizField = (b, f) => {
    if (f === 'type') {
      const T = KT();
      const id = bizTrade(b);
      if (T && id) return T.label(id);
      return getSet('biz:' + b.id + ':type', b.type != null ? b.type : '');
    }
    const vid = bizVenueId(b);
    if (vid && KR()) {
      try {
        KR().migrateBusiness(vid, b.id);
        const doc = KR().business(vid);
        if (f === 'name') return doc.name || b.name || '';
        if (f === 'logo' || f === 'slogan') return doc[f] || b[f] || '';
        const v = doc.legal[f];
        if (v) return v;
        /* Rien dans la fiche : on retombe sur ce que porte la venue (une démo
         * pré-remplie), jamais sur une valeur inventée. */
        return b[f] != null ? b[f] : '';
      } catch (_) { /* fiche indisponible → ancien chemin */ }
    }
    return getSet('biz:' + b.id + ':' + f, b[f] != null ? b[f] : '');
  };
  const saveBizFields = (b, v) => {
    const vid = bizVenueId(b);
    if (vid && KR()) {
      const legal = {};
      BIZ_FIELDS.forEach((f) => { if (!['name', 'type', 'logo', 'slogan'].includes(f.k)) legal[f.k] = v[f.k] || ''; });
      KR().saveBusiness({ name: v.name, logo: v.logo || '', slogan: v.slogan || '', legal }, vid);
      return true;
    }
    return false;
  };
  /* Le métier ne se range pas avec les mentions légales : il ne s'imprime pas,
   * il CHANGE le produit. Pour un vrai établissement il va dans l'établissement
   * (venue.subtype), d'où le tableau de bord et la caisse le relisent ; une
   * fiche ajoutée à la main, qui ne correspond à aucun magasin, garde l'ancien
   * rangement. Un métier inconnu n'écrase rien : mieux vaut l'ancien métier
   * juste qu'un nouveau que personne ne sait interpréter. */
  const saveTrade = (b, val) => {
    const T = KT();
    const trade = T ? T.resolve(val) : '';
    if (!trade) return false;
    if (trade === bizTrade(b)) return false;
    const vid = bizVenueId(b);
    if (vid && window.KiwiVenue && window.KiwiVenue.updateVenue) {
      try {
        if (window.KiwiVenue.updateVenue(vid, { subtype: trade })) {
          /* L'ancien texte libre est périmé à la seconde où l'établissement
           * porte le métier. Le laisser derrière, c'est laisser un « Épicerie »
           * d'autrefois annuler le « Boutique » que le propriétaire vient de
           * choisir, au prochain affichage de la carte. */
          try { localStorage.removeItem('kiwiSet:biz:' + b.id + ':type'); } catch (_) {}
          return true;
        }
      } catch (_) {
        if (typeof Kiwi !== 'undefined' && Kiwi.toast) {
          Kiwi.toast(pick({ fr: 'Impossible de modifier l’activité', en: 'Failed to update activity type', ar: 'تعذّر تعديل نوع النشاط' }), { type: 'warn', force: true });
        }
      }
    }
    try { localStorage.setItem('kiwiSet:biz:' + b.id + ':type', trade); } catch (_) {}
    return true;
  };
  const bizTypeLabel = (t) => {
    const T = KT();
    const l = T ? T.label(t) : (t ? String(t) : '');
    return l || pick({ fr: 'Établissement', en: 'Business', ar: 'مؤسسة' });
  };
  // A real account's single establishment: its own name + business type, and
  // BLANK legal fields (the client hasn't entered ICE/RC/etc). Never the demo's.
  const primaryRealBiz = () => ({
    id: 'primary', primary: true,
    name: (meVal('business') || getSet('bizName', '') || (pairedVenue() && pairedVenue().name) || '').trim() || pick({ fr: 'Mon établissement', en: 'My business', ar: 'مؤسستي' }),
    trade: meVal('type') || '', type: bizTypeLabel(meVal('type')), city: '', address: '',
    ice: '', fiscal: '', rc: '', patente: '', cnss: '', phone: '', hours: '',
    /* no revenue/orders/team → the stat row is omitted (no fabricated numbers). */
  });
  /* Les VRAIS établissements du compte, un par magasin du sélecteur.
   * Cet écran n'en montrait qu'un : `primaryRealBiz()`, bâti sur
   * `KiwiMe.business` — c'est UN nom par LOGIN. Un propriétaire qui tient une
   * boutique ET un restaurant voyait donc une seule fiche, et n'avait aucun
   * moyen de donner à chacun son ICE, son adresse et son reçu. Le sélectionneur
   * d'établissement, lui, les connaissait tous les deux depuis le début. */
  const realVenueBiz = () => {
    try {
      const KV = window.KiwiVenue;
      if (!KV || !KV.VENUES || !KV.isCustom) return [];
      const active = (KV.getVenue && KV.getVenue()) || '';
      return Object.keys(KV.VENUES)
        .filter((id) => id !== 'own' && id !== 'scoped' && KV.isCustom(id))
        .map((id) => {
          const v = KV.VENUES[id] || {};
          return {
            id, venueId: id, primary: id === active,
            name: v.name || '', trade: v.subtype || v.type || '', type: bizTypeLabel(v.subtype || v.type),
            city: v.location || '', address: '',
            legalName: '', ice: '', fiscal: '', rc: '', patente: '', cnss: '', phone: '',
          };
        });
    } catch (_) { return []; }
  };
  const allBiz = () => {
    let base;
    if (isReal()) {
      const real = realVenueBiz();
      /* Aucun établissement encore créé (compte tout neuf, ou moteur de venues
       * pas encore chargé) : la fiche unique d'avant, inchangée. */
      base = (real.length ? real : [primaryRealBiz()]).concat(extraBiz());
    } else {
      base = [...BIZ_DEFAULTS, ...extraBiz()];
    }
    return base.map((b) => { const o = { ...b }; BIZ_FIELDS.forEach((f) => { o[f.k] = bizField(b, f.k); }); return o; });
  };
  const initialsOf = (s) => (String(s).replace(/\s*·.*$/, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || 'K').toUpperCase();

  /* ── Horaires d'ouverture, sur la fiche établissement ──
   * En lecture seule ici : la saisie a un seul écran (assets/hours-ui.js), et
   * c'est lui qu'on ouvre. La fiche montre l'état du jour parce que c'est ce
   * qu'un propriétaire vient vérifier — « suis-je censé être ouvert là ? » —
   * pas la grille des sept jours.
   *
   * Quel établissement ? Les horaires sont classés par identifiant
   * d'ÉTABLISSEMENT (venue), celui que le sélecteur du tableau de bord change
   * et que la caisse résout pareil. Les fiches de cet écran ne sont pas toutes
   * des établissements : la principale est l'établissement actif, les fiches de
   * démonstration portent déjà un identifiant de venue, et une fiche ajoutée à
   * la main ici n'en a aucun. Dans ce dernier cas on ne fabrique pas un
   * classement bidon — on renvoie vers le sélecteur. */
  /* ── Le reçu de caisse, sur la fiche établissement ──
   * Même logique que les horaires : la ligne AFFICHE l'état et ouvre l'unique
   * écran de réglage. Chaque établissement a son reçu — régler celui d'Amira
   * Boutique ne touche pas celui du restaurant d'à côté, parce que la fiche est
   * rangée par venue et pas par compte.
   *
   * Ce que la ligne dit, c'est ce qu'un propriétaire vient vérifier : mon
   * ticket est-il en règle ? D'où le décompte des mentions manquantes plutôt
   * qu'un « configuré / non configuré » qui ne lui apprend rien. */
  /* L'identité EFFECTIVE de la carte affichée. `bizField()` a déjà résolu chaque
   * champ (fiche partagée d'abord, valeur portée par la fiche ensuite), donc
   * `b.*` EST ce que le propriétaire a sous les yeux. C'est cette liste-là qu'il
   * faut mesurer : calculer les manques ailleurs donnait une carte qui affiche
   * un ICE et, deux lignes plus bas, annonce que l'ICE manque. */
  const bizIdentity = (b) => {
    const legal = {};
    (window.KiwiReceipt ? window.KiwiReceipt.LEGAL_FIELDS : []).forEach((f) => {
      if (b[f.k]) legal[f.k] = b[f.k];
    });
    return { name: b.name || '', legal };
  };
  const bizMissing = (b) => {
    const id = bizIdentity(b);
    return (window.KiwiReceipt ? window.KiwiReceipt.LEGAL_FIELDS : [])
      .filter((f) => f.important && !id.legal[f.k])
      .map((f) => ({ key: f.k, label: pick(f.label) }));
  };

  /* Un réglage à ouvrir. Il ressemblait à une mention légale — même ligne,
   * même graisse, sur le même fond — alors qu'il fallait cliquer dessus.
   * Il est maintenant ce qu'il est : un bouton, avec son icône, son état et
   * son chevron. Sans établissement (une fiche ajoutée à la main), il reste
   * affiché mais inactif : mentir sur l'existence d'un écran est pire que de
   * dire pourquoi il n'y en a pas. */
  const DOT = { ok: 'var(--success,#16a34a)', warn: 'var(--warning,#d97706)', bad: 'var(--danger,#dc2626)', off: 'var(--n-400)' };
  const CHEV = '<svg class="acc-act-go" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  function actionBtn(o) {
    const dead = !o.action;
    return `
      <button type="button" class="acc-act"${dead ? ' disabled' : ` data-action="${esc(o.action)}" data-arg="${esc(o.arg || '')}"`}>
        <span class="acc-act-ico" aria-hidden="true">${o.icon}</span>
        <span class="acc-act-txt">
          <span class="acc-act-t">${esc(o.label)}</span>
          <span class="acc-act-v">${o.tone ? `<span class="dot" style="background:${DOT[o.tone] || DOT.off};"></span>` : ''}${esc(o.value)}</span>
          ${o.sub ? `<span class="acc-act-sub">${esc(o.sub)}</span>` : ''}
        </span>
        ${dead ? '' : CHEV}
      </button>`;
  }
  const noVenueText = () => pick({ fr: 'Rattachez cette fiche à un établissement pour la régler', en: 'Link this card to a business to set it', ar: 'اربط هذه البطاقة بمؤسسة لضبطها' });

  function receiptRow(b) {
    const K = window.KiwiReceipt;
    if (!K || !window.KiwiReceiptUI) return '';
    const vid = bizVenueId(b);
    const label = pick({ fr: 'Reçu de caisse', en: 'Sales receipt', ar: 'وصل الصندوق' });
    if (!vid) return actionBtn({ icon: '🧾', label, value: noVenueText(), tone: 'off' });
    const miss = bizMissing(b);
    const set = K.isConfigured(vid);
    const text = miss.length
      ? pick({ fr: `${miss.length} mention${miss.length > 1 ? 's' : ''} légale${miss.length > 1 ? 's' : ''} manquante${miss.length > 1 ? 's' : ''}`, en: `${miss.length} legal detail${miss.length > 1 ? 's' : ''} missing`, ar: `${miss.length} بيان قانوني ناقص` })
      : (set ? pick({ fr: 'Personnalisé · prêt à imprimer', en: 'Customised · ready to print', ar: 'مخصّص · جاهز للطبع' })
             : pick({ fr: 'Modèle par défaut · prêt à imprimer', en: 'Default template · ready to print', ar: 'نموذج افتراضي · جاهز للطبع' }));
    return actionBtn({
      icon: '🧾', label, value: text, tone: miss.length ? 'bad' : 'ok',
      sub: miss.length ? miss.map((x) => x.label).join(', ') : '',
      action: 'account-receipt', arg: vid,
    });
  }

  function hoursRow(b) {
    const KH = window.KiwiHours;
    if (!KH) return '';
    const vid = bizVenueId(b);
    const label = pick({ fr: 'Horaires d’ouverture', en: 'Opening hours', ar: 'ساعات العمل' });
    if (!vid) return actionBtn({ icon: '⏰', label, value: noVenueText(), tone: 'off' });
    const s = KH.summary(Date.now(), vid);
    const tone = { open: 'ok', closed: 'off', soon: 'warn', unset: 'bad' }[s.tone] || 'off';
    return actionBtn({
      icon: '⏰', label, value: s.text, tone,
      sub: KH.isConfigured(vid) ? KH.weekText(vid) : '',
      action: 'account-hours', arg: vid,
    });
  }

  /* ════════════════════════════ MON PROFIL ════════════════════════════ */
  function openProfile() {
    const T = {
      title: pick({ fr: 'Mon profil', en: 'My profile', ar: 'ملفي الشخصي' }),
      sub: pick({ fr: 'Compte, établissements & abonnement', en: 'Account, businesses & subscription', ar: 'الحساب، المؤسسات والاشتراك' }),
      role: pick({ fr: 'Propriétaire · admin · membre depuis mars 2025', en: 'Owner · admin · member since March 2025', ar: 'مالك · مشرف · عضو منذ مارس 2025' }),
      edit: pick({ fr: 'Modifier', en: 'Edit', ar: 'تعديل' }),
      personal: pick({ fr: 'Informations personnelles', en: 'Personal information', ar: 'المعلومات الشخصية' }),
      name: pick({ fr: 'Nom complet', en: 'Full name', ar: 'الاسم الكامل' }),
      email: pick({ fr: 'Email', en: 'Email', ar: 'البريد الإلكتروني' }),
      phone: pick({ fr: 'Téléphone', en: 'Phone', ar: 'الهاتف' }),
      language: pick({ fr: 'Langue', en: 'Language', ar: 'اللغة' }),
      security: pick({ fr: 'Sécurité', en: 'Security', ar: 'الأمان' }),
      twofa: pick({ fr: 'Authentification 2FA', en: 'Two-factor auth', ar: 'المصادقة الثنائية' }),
      smsOn: pick({ fr: 'SMS activé', en: 'SMS on', ar: 'الرسائل مُفعّلة' }),
      lastLogin: pick({ fr: 'Dernière connexion', en: 'Last sign-in', ar: 'آخر دخول' }),
      today: pick({ fr: "Aujourd'hui · 08:12", en: 'Today · 08:12', ar: 'اليوم · 08:12' }),
      password: pick({ fr: 'Mot de passe', en: 'Password', ar: 'كلمة المرور' }),
      change: pick({ fr: 'Modifier', en: 'Change', ar: 'تغيير' }),
      myBiz: pick({ fr: 'Mes établissements', en: 'My businesses', ar: 'مؤسساتي' }),
      addBiz: pick({ fr: '+ Ajouter un établissement', en: '+ Add a business', ar: '+ إضافة مؤسسة' }),
      primary: pick({ fr: 'PRINCIPAL', en: 'PRIMARY', ar: 'الرئيسية' }),
      caMonth: pick({ fr: 'CA ce mois', en: 'Revenue · mo', ar: 'المداخيل · الشهر' }),
      ordersL: pick({ fr: 'Commandes', en: 'Orders', ar: 'الطلبات' }),
      teamL: pick({ fr: 'Équipe', en: 'Team', ar: 'الفريق' }),
      subscription: pick({ fr: 'Abonnement', en: 'Subscription', ar: 'الاشتراك' }),
      curPlanLabel: pick({ fr: 'FORMULE ACTUELLE', en: 'CURRENT PLAN', ar: 'الباقة الحالية' }),
      upgrade: pick({ fr: 'Mettre à niveau', en: 'Upgrade', ar: 'ترقية' }),
      downgrade: pick({ fr: 'Rétrograder', en: 'Downgrade', ar: 'تخفيض' }),
      billing: pick({ fr: 'Voir la facturation', en: 'View billing', ar: 'عرض الفواتير' }),
      cancel: pick({ fr: 'Résilier', en: 'Cancel plan', ar: 'إلغاء الاشتراك' }),
      planMeta: pick({ fr: 'Facturé mensuellement · sans engagement', en: 'Billed monthly · no commitment', ar: 'فوترة شهرية · دون التزام' }),
      perMo: pick({ fr: '/mois', en: '/mo', ar: '/شهر' }),
      pwToast: pick({ fr: 'Lien de changement de mot de passe envoyé par SMS.', en: 'Password-change link sent by SMS.', ar: 'تم إرسال رابط تغيير كلمة المرور عبر SMS.' }),
    };
    const plan = PLAN_INFO[curPlan()] || PLAN_INFO.pro;
    const planPrice = curPlan() === 'ultimate' ? pick({ fr: 'Sur devis', en: 'Custom', ar: 'حسب الطلب' }) : plan.price;
    const isBasic = curPlan() === 'basic';
    const row = (k, v, raw) => `<div class="acc-row"><span>${esc(k)}</span>${raw || `<b>${v}</b>`}</div>`;
    const bizCard = (b) => {
      /* Un champ légal vide se dit « à compléter », pas « — ». Le tiret se lit
       * comme « sans objet » et c'est faux : ces mentions sont obligatoires sur
       * un reçu, elles manquent. (Sur le TICKET, à l'inverse, une mention vide
       * ne s'imprime pas du tout — un tiret imprimé à la place d'un ICE
       * ressemble à un ICE illisible.) */
      const todo = pick({ fr: 'à compléter', en: 'to complete', ar: 'ينقص' });
      const lg = (k, v, required) => `<div><div class="k">${esc(k)}</div><div class="v">${v ? esc(v) : (required ? `<span style="font-size:11.5px; color:var(--n-500); font-style:italic;">${esc(todo)}</span>` : '—')}</div></div>`;
      return `
        <div class="acc-biz">
          <div class="acc-biz-head">
            <div class="acc-biz-logo">${b.logo ? `<img src="${esc(b.logo)}" alt=""/>` : esc(initialsOf(b.name))}</div>
            <div style="flex:1; min-width:0;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span class="acc-biz-name">${esc(b.name)}</span>
                ${b.primary ? `<span class="acc-biz-badge">${esc(T.primary)}</span>` : ''}
              </div>
              <div class="acc-biz-meta">${esc(b.type)} · ${esc(b.city)}${b.address ? ' · ' + esc(b.address) : ''}</div>
              ${b.slogan ? `<div class="acc-biz-meta">${esc(b.slogan)}</div>` : ''}
            </div>
            <button class="acc-cta ghost" data-action="account-edit-business" data-arg="${esc(b.id)}">${esc(T.edit)}</button>
          </div>
          ${b.revenue != null ? `<div class="acc-stat-row">
            <div class="acc-stat"><div class="v">${fmtMAD(b.revenue)} <span style="font-size:11px;opacity:.6;">MAD</span></div><div class="l">${esc(T.caMonth)}</div></div>
            <div class="acc-stat"><div class="v">${fmtMAD(b.orders)}</div><div class="l">${esc(T.ordersL)}</div></div>
            <div class="acc-stat"><div class="v">${esc(String(b.team))}</div><div class="l">${esc(T.teamL)}</div></div>
          </div>` : ''}
          <div class="acc-legal">
            ${lg('ICE', b.ice, true)}${lg('IF', b.fiscal, true)}${lg('RC', b.rc, true)}
            ${lg('Patente', b.patente, true)}${lg('CNSS', b.cnss)}${lg(T.phone, b.phone, true)}
          </div>
          <div class="acc-acts">
            ${hoursRow(b)}
            ${receiptRow(b)}
          </div>
        </div>`;
    };
    const biz = allBiz();
    const subscriptionBlock = isReal()
      ? `<div class="acc-card span2"><div class="acc-eyebrow">${esc(T.subscription)}</div><div class="acc-row"><span>${esc(T.curPlanLabel)}</span><b>—</b></div><div style="font-size:12.5px;color:var(--n-500);margin-top:8px;">${esc(pick({ fr: 'Données d’abonnement indisponibles.', en: 'Subscription data is unavailable.', ar: 'بيانات الاشتراك غير متاحة.' }))}</div></div>`
      : `<div class="acc-plan">
          <div>
            <div class="acc-plan-name">${esc(T.curPlanLabel)}</div>
            <div class="acc-plan-price">${esc(plan.name)} · ${esc(planPrice)}${curPlan() !== 'ultimate' ? `<small>${esc(T.perMo)}</small>` : ''}</div>
            <div class="acc-plan-meta">${esc(T.planMeta)}</div>
          </div>
          <div class="acc-plan-acts">
            <button class="acc-cta light" data-action="upgrade-pro">${esc(T.upgrade)}</button>
            <button class="acc-cta ghost" style="color:#fff; border-color:rgba(255,255,255,0.4);" data-action="account-billing">${esc(T.billing)}</button>
          </div>
        </div>
        <div class="acc-plan-btns">
          ${!isBasic ? `<button class="acc-cta ghost" data-action="account-plan-downgrade">${esc(T.downgrade)}</button>` : ''}
          <button class="acc-danger" data-action="account-plan-cancel">${esc(T.cancel)}</button>
        </div>`;
    Kiwi.appPage('account-profile', {
      title: T.title, subtitle: T.sub,
      body: `
        <div class="acc-hero">
          <div class="acc-avatar">${esc(initialsOf(ownerName()))}</div>
          <div style="flex:1; min-width:0;"><div class="acc-hero-name">${esc(ownerName())}</div><div class="acc-hero-role">${esc(isReal() ? pick({ fr: 'Propriétaire · admin', en: 'Owner · admin', ar: 'مالك · مشرف' }) : T.role)}</div></div>
          <button class="acc-cta light" data-action="account-edit-profile">${esc(T.edit)}</button>
        </div>
        <div class="acc-grid">
          <div class="acc-card">
            <div class="acc-eyebrow" style="display:flex; justify-content:space-between; align-items:center;">${esc(T.personal)}<a data-action="account-edit-profile" style="color:var(--atlas); cursor:pointer; letter-spacing:0;">${esc(T.edit)}</a></div>
            ${row(T.name, esc(ownerName()))}
            ${row(T.email, esc(ownerEmail()))}
            ${row(T.phone, esc(ownerPhone() || '—'))}
            ${row(T.language, esc(ownerLang()))}
          </div>
          <div class="acc-card">
            <div class="acc-eyebrow">${esc(T.security)}</div>
            ${row(T.twofa, '', isReal()
              ? `<b>${esc(pick({ fr: 'Non configurée', en: 'Not set up', ar: 'غير مُفعّلة' }))}</b>`
              : `<b class="ok">${esc(T.smsOn)}</b>`)}
            ${isReal() ? '' : row(T.lastLogin, esc(T.today))}
            ${row(T.password, '', `<a data-action="account-change-pw">${esc(T.change)}</a>`)}
          </div>
        </div>
        <div class="acc-section-head"><h3>${esc(T.myBiz)}</h3><span class="ct">${biz.length}</span></div>
        ${biz.map(bizCard).join('')}
        <button class="acc-add-biz" data-action="account-add-business">${esc(T.addBiz)}</button>
        <div class="acc-section-head"><h3>${esc(T.subscription)}</h3></div>
        ${subscriptionBlock}`,
    });
    handlers['account-change-pw'] = () => Kiwi.toast(T.pwToast, { type: 'success', force: true });
    handlers['account-edit-business'] = (el, arg) => editBusinessModal(arg || (el && el.dataset.arg));
    handlers['account-hours'] = (el, arg) => {
      const vid = arg || (el && el.dataset.arg) || null;
      if (!window.KiwiHoursUI || !vid) return;
      const b = allBiz().find((x) => bizVenueId(x) === vid);
      window.KiwiHoursUI.open({ venueId: vid, title: (b && b.name) || '', onSave: () => setTimeout(openProfile, 80) });
    };
    handlers['account-receipt'] = (el, arg) => {
      const vid = arg || (el && el.dataset.arg) || null;
      if (!window.KiwiReceiptUI || !vid) return;
      const b = allBiz().find((x) => bizVenueId(x) === vid);
      window.KiwiReceiptUI.open({
        venueId: vid, title: (b && b.name) || '',
        /* Ce que la carte affiche, pour que l'éditeur et l'aperçu montrent la
         * même identité qu'elle. Purement affiché : jamais enregistré, sinon
         * on créerait la seconde copie que tout ce chantier évite. */
        fallbackBusiness: b ? bizIdentity(b) : null,
        /* Le raccourci vers la SOURCE. L'éditeur de reçu affiche les mentions
         * légales ; il ne les édite pas, sinon il en existerait deux copies. */
        onEditBusiness: () => { if (b) editBusinessModal(b.id); },
        onSave: () => setTimeout(openProfile, 80),
      });
    };
    handlers['account-add-business'] = () => addBusinessModal();
    handlers['account-plan-downgrade'] = () => planChangeModal('down');
    handlers['account-plan-cancel'] = () => planChangeModal('down');
    if (!handlers['account-help-mail']) handlers['account-help-mail'] = () => window.KiwiHelp && window.KiwiHelp.openContact('email');
    if (!handlers['account-help-phone']) handlers['account-help-phone'] = () => window.KiwiHelp && window.KiwiHelp.openContact('whatsapp');
  }

  /* ── Business editor (rich form, persists per-field / extras) ── */
  function fieldInput(f, val, b) {
    const label = pick(f.label);
    const hint = f.hint ? `<p class="acc-hint">${esc(pick(f.hint))}</p>` : '';
    const wrap = (inner) => `<div${f.span ? ' style="grid-column:1/-1;"' : ''}><label class="acc-lbl" for="accf-${esc(f.k)}">${esc(label)}</label>${inner}${hint}</div>`;
    if (f.kind === 'logo') {
      const preview = val ? `<img src="${esc(val)}" alt=""/>` : esc(initialsOf((b && b.name) || 'K'));
      return wrap(`<div class="acc-logo-picker"><div class="acc-logo-preview" data-logo-preview>${preview}</div><div class="acc-logo-actions"><button class="acc-cta ghost" type="button" data-logo-pick>${esc(pick({ fr: 'Choisir un logo', en: 'Choose a logo', ar: 'اختيار شعار' }))}</button><button class="acc-cta ghost" type="button" data-logo-remove${val ? '' : ' hidden'}>${esc(pick({ fr: 'Retirer', en: 'Remove', ar: 'إزالة' }))}</button></div><input type="file" accept="image/png,image/jpeg" data-logo-file hidden/><input type="hidden" class="acc-f" id="accf-logo" data-f="logo" value="${esc(val || '')}"/></div><p class="acc-hint">${esc(pick({ fr: 'PNG ou JPG, 250 Ko maximum.', en: 'PNG or JPG, 250 KB maximum.', ar: 'PNG أو JPG، بحد أقصى 250 كيلوبايت.' }))}</p>`);
    }
    if (f.kind === 'trade') {
      const T = KT();
      /* Pas de liste de métiers chargée : on n'invente pas un menu vide, on
       * garde le champ tel qu'il était. */
      if (!T) return wrap(`<input class="acc-f" id="accf-${esc(f.k)}" data-f="${esc(f.k)}" maxlength="60" value="${esc(val == null ? '' : val)}"/>`);
      /* Ce qu'il FAUT présélectionner, c'est le métier que le produit applique
       * réellement — pas le texte qu'on avait laissé écrire. Pour un vrai
       * établissement c'est son `subtype` ; à défaut sa famille. Un client dont
       * l'ancien texte ne veut rien dire retrouve donc son métier effectif,
       * pas une case vide qui l'accuserait de n'avoir rien réglé. */
      const cur = (b && bizTrade(b)) || T.resolve(val) || '';
      return wrap(`<select class="acc-sel" id="accf-${esc(f.k)}" data-f="${esc(f.k)}">${T.options(cur, {
        placeholder: cur ? '' : pick({ fr: 'Choisir un type d’activité…', en: 'Choose an activity type…', ar: 'اختر نوع النشاط…' }),
      })}</select>`);
    }
    return wrap(`<input class="acc-f" id="accf-${esc(f.k)}" data-f="${esc(f.k)}" maxlength="${f.max || 90}"${f.attr ? ' ' + f.attr : ''} value="${esc(val == null ? '' : val)}"/>`);
  }
  function bizForm(b) {
    let out = '<div class="acc-form">';
    BIZ_FIELDS.forEach((f) => {
      const s = f.sec && BIZ_SECTIONS[f.sec];
      if (s) {
        out += `<div class="acc-form-sec">${esc(pick(s.label))}${s.why ? `<span class="why">${esc(pick(s.why))}</span>` : ''}</div>`;
      }
      out += fieldInput(f, b ? b[f.k] : '', b);
    });
    return out + '</div>';
  }
  function wireLogoPicker(scope) {
    const file = scope.querySelector('[data-logo-file]');
    const value = scope.querySelector('[data-f="logo"]');
    const preview = scope.querySelector('[data-logo-preview]');
    const remove = scope.querySelector('[data-logo-remove]');
    const pickBtn = scope.querySelector('[data-logo-pick]');
    if (!file || !value || !preview || !remove || !pickBtn) return;
    pickBtn.addEventListener('click', () => file.click());
    remove.addEventListener('click', () => { value.value = ''; file.value = ''; preview.textContent = 'K'; remove.hidden = true; });
    file.addEventListener('change', () => {
      const chosen = file.files && file.files[0];
      if (!chosen) return;
      if (!/^image\/(png|jpeg)$/.test(chosen.type) || chosen.size > 250 * 1024) {
        Kiwi.toast(pick({ fr: 'Choisissez un PNG ou JPG de 250 Ko maximum.', en: 'Choose a PNG or JPG up to 250 KB.', ar: 'اختر PNG أو JPG بحجم أقصى 250 كيلوبايت.' }), { type: 'info', force: true });
        file.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => { value.value = String(reader.result || ''); preview.innerHTML = `<img src="${esc(value.value)}" alt=""/>`; remove.hidden = false; };
      reader.readAsDataURL(chosen);
    });
  }
  function readForm(scope) {
    const v = {};
    scope.querySelectorAll('.acc-f, .acc-sel').forEach((i) => { v[i.dataset.f] = (i.value || '').trim(); });
    return v;
  }
  function editBusinessModal(id) {
    const b = allBiz().find((x) => x.id === id);
    if (!b) return;
    /* « Est-ce une fiche ajoutée à la main ? » se lit dans kiwiBizExtra, pas
       dans l'absence des démos. L'établissement d'un VRAI compte a l'id
       'primary' : absent de BIZ_DEFAULTS, il était traité comme un extra, et
       la sauvegarde faisait un .map() sur une liste où il ne figure pas —
       elle réécrivait la liste inchangée. Le commerçant corrigeait son
       adresse, voyait « Établissement mis à jour », et retrouvait l'ancienne
       au rechargement. Les surcharges par champ (kiwiSet:biz:primary:*) sont
       relues par bizField() : c'est la bonne branche pour lui. */
    const isExtra = extraBiz().some((x) => x.id === id);
    const m = Kiwi.modal({
      tag: pick({ fr: 'ÉTABLISSEMENT', en: 'BUSINESS', ar: 'مؤسسة' }), title: b.name, width: 560,
      body: bizForm(b),
      foot: `<button class="kb atlas" data-save type="button" style="width:100%;justify-content:center;padding:12px;font-size:15px;">${esc(pick({ fr: 'Enregistrer', en: 'Save', ar: 'حفظ' }))}</button>`,
    });
    wireLogoPicker(m.el);
    m.el.addEventListener('click', (e) => {
      if (!e.target.closest('[data-save]')) return;
      const v = readForm(m.el);
      /* Le métier d'abord : il ne se range pas avec le reste, et il repeint le
       * tableau de bord. */
      saveTrade(b, v.type);
      /* Adossée à un établissement ⇒ la fiche partagée (per-venue, mirrorée
       * serveur), et c'est elle que le reçu, la caisse et le détail d'une
       * transaction liront. Sinon l'ancien chemin, inchangé. */
      if (!saveBizFields(b, v)) {
        if (isExtra) { setExtraBiz(extraBiz().map((x) => (x.id === id ? { ...x, ...v } : x))); }
        else { BIZ_FIELDS.forEach((f) => { if (f.k !== 'type') { try { localStorage.setItem('kiwiSet:biz:' + id + ':' + f.k, v[f.k]); } catch (_) {} } }); }
      } else if (v.name && window.KiwiVenue && window.KiwiVenue.updateVenue) {
        /* Renommer l'établissement ici doit renommer l'établissement, pas
         * seulement l'étiquette de cette carte. */
        try { window.KiwiVenue.updateVenue(bizVenueId(b), { name: v.name }); } catch (_) {
          if (typeof Kiwi !== 'undefined' && Kiwi.toast) {
            Kiwi.toast(pick({ fr: 'Erreur d’enregistrement du nom', en: 'Failed to save business name', ar: 'خطأ في حفظ اسم المؤسسة' }), { type: 'warn', force: true });
          }
        }
      }
      m.close(); setTimeout(openProfile, 80);
      Kiwi.toast(pick({ fr: 'Établissement mis à jour', en: 'Business updated', ar: 'تم تحديث المؤسسة' }), { type: 'success', force: true });
    });
  }
  /* ── AJOUTER UN ÉTABLISSEMENT ───────────────────────────────────────────
   * Ce bouton fabriquait une CARTE, pas un établissement : une entrée dans
   * `kiwiBizExtra`, connue de ce seul écran. Elle n'apparaissait pas dans le
   * sélecteur, n'avait ni horaires, ni reçu, ni caisse à appairer, et ses
   * mentions légales dormaient dans un localStorage que rien d'autre ne lit.
   * Le propriétaire croyait avoir ouvert sa deuxième boutique.
   * Il crée maintenant un vrai établissement (KiwiVenue), déclaré au serveur
   * comme celui du premier jour, puis y écrit les mentions saisies. */
  function addBusinessModal() {
    const T = KT();
    const KV = window.KiwiVenue;
    const canCreate = isReal() && !!(T && KV && KV.createVenue);
    const m = Kiwi.modal({
      tag: pick({ fr: 'NOUVEL ÉTABLISSEMENT', en: 'NEW BUSINESS', ar: 'مؤسسة جديدة' }), title: pick({ fr: 'Ajouter un établissement', en: 'Add a business', ar: 'إضافة مؤسسة' }), width: 560,
      desc: canCreate ? pick({
        fr: 'Il aura ses propres horaires, son propre reçu, son propre catalogue et sa propre caisse.',
        en: 'It gets its own opening hours, its own receipt, its own catalogue and its own till.',
        ar: 'ستكون له ساعاته ووصله وكتالوجه وصندوقه.' }) : '',
      body: bizForm(null),
      foot: `<button class="kb atlas" data-save type="button" style="width:100%;justify-content:center;padding:12px;font-size:15px;">${esc(pick({ fr: "Créer l'établissement", en: 'Create business', ar: 'إنشاء المؤسسة' }))}</button>`,
    });
    wireLogoPicker(m.el);
    setTimeout(() => { const a = m.el.querySelector('.acc-f'); if (a) a.focus(); }, 320);
    m.el.addEventListener('click', (e) => {
      if (!e.target.closest('[data-save]')) return;
      const v = readForm(m.el);
      if (!v.name) { Kiwi.toast(pick({ fr: 'Le nom est requis.', en: 'Name is required.', ar: 'الاسم مطلوب.' }), { type: 'info', force: true }); return; }
      if (canCreate) {
        const trade = T.resolve(v.type);
        if (!trade) {
          Kiwi.toast(pick({ fr: "Choisissez le type d'activité.", en: 'Choose the activity type.', ar: 'اختر نوع النشاط.' }), { type: 'info', force: true });
          return;
        }
        let nid = null;
        try {
          nid = KV.createVenue({
            type: T.base(trade), subtype: trade,
            name: v.name, location: v.city || '',
          });
        } catch (_) {}
        if (!nid) { Kiwi.toast(pick({ fr: 'Création impossible', en: 'Creation failed', ar: 'تعذّر الإنشاء' }), { type: 'warn', force: true }); return; }
        /* Les mentions saisies vont dans la fiche du NOUVEL établissement —
         * per-établissement et mirrorée serveur, comme partout ailleurs. */
        if (KR()) {
          const legal = {};
          BIZ_FIELDS.forEach((f) => { if (!['name', 'type', 'logo', 'slogan'].includes(f.k)) legal[f.k] = v[f.k] || ''; });
          try { KR().saveBusiness({ name: v.name, logo: v.logo || '', slogan: v.slogan || '', legal }, nid); } catch (_) {
            if (typeof Kiwi !== 'undefined' && Kiwi.toast) {
              Kiwi.toast(pick({ fr: 'Erreur de sauvegarde des mentions légales', en: 'Failed to save legal details', ar: 'خطأ في حفظ البيانات القانونية' }), { type: 'warn', force: true });
            }
          }
        }
        m.close(); setTimeout(openProfile, 80);
        Kiwi.toast(pick({ fr: 'Établissement créé', en: 'Business created', ar: 'تم إنشاء المؤسسة' }), { type: 'success', force: true,
          desc: pick({ fr: 'Réglez ses horaires et son reçu sur sa fiche.', en: 'Set its opening hours and receipt on its card.', ar: 'اضبط ساعاته ووصله من بطاقته.' }) });
        return;
      }
      const extras = extraBiz(); extras.push({ id: 'biz-' + Date.now(), primary: false, ...v }); setExtraBiz(extras);
      m.close(); setTimeout(openProfile, 80);
      Kiwi.toast(pick({ fr: 'Établissement ajouté', en: 'Business added', ar: 'تمت إضافة المؤسسة' }), { type: 'success', force: true });
    });
  }

  /* ── Subscription change / cancel ── */
  function planChangeModal() {
    const idx = PLAN_LADDER.indexOf(curPlan());
    const target = PLAN_LADDER[Math.max(0, idx - 1)];
    const ti = PLAN_INFO[target];
    const m = Kiwi.modal({
      tag: pick({ fr: 'CHANGEMENT DE FORMULE', en: 'PLAN CHANGE', ar: 'تغيير الباقة' }),
      title: pick({ fr: `Passer à ${ti.name} ?`, en: `Switch to ${ti.name}?`, ar: `الانتقال إلى ${ti.name}؟` }), width: 460,
      body: `<p style="font-size:14px; color:var(--n-600); line-height:1.6; margin:0;">${esc(pick({
        fr: `Vous passerez à ${ti.name} (${ti.price}/mois). Le changement prend effet à votre prochaine échéance, vous gardez vos fonctionnalités actuelles jusque-là.`,
        en: `You'll move to ${ti.name} (${ti.price}/mo). The change applies at your next billing date, you keep your current features until then.`,
        ar: `ستنتقل إلى ${ti.name} (${ti.price}/شهر). يسري التغيير في تاريخ الفوترة القادم, تحتفظ بميزاتك حتى ذلك الحين.` }))}</p>`,
      foot: `<button class="kb ghost" data-cancel type="button" style="flex:1;justify-content:center;">${esc(pick({ fr: 'Annuler', en: 'Cancel', ar: 'إلغاء' }))}</button><button class="kb atlas" data-confirm type="button" style="flex:1;justify-content:center;">${esc(pick({ fr: 'Confirmer', en: 'Confirm', ar: 'تأكيد' }))}</button>`,
    });
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cancel]')) { m.close(); return; }
      if (!e.target.closest('[data-confirm]')) return;
      try { localStorage.setItem('kiwiSet:plan', target); } catch (_) {}
      m.close(); setTimeout(openProfile, 80);
      Kiwi.toast(pick({ fr: `Demande enregistrée, ${ti.name} au prochain cycle.`, en: `Saved, ${ti.name} from next cycle.`, ar: `تم الحفظ، ${ti.name} من الدورة القادمة.` }), { type: 'success', force: true });
    });
  }
  function openBilling() {

    const venueBiz = window.KiwiVenue?.isCustom?.()
      ? ((window.KiwiVenue.getCurrentVenueData?.() || {}).fullDisplay || "") : "";
    const biz = venueBiz || meVal("business") || (pairedVenue() && pairedVenue().name) || "Amira Boutique";
    const planKey = curPlan() || "pro";
    const plan = PLAN_INFO[planKey] || PLAN;


    // ── Données réelles — lues dans les magasins qui existent VRAIMENT.
    // KiwiSales est le grand livre du tableau de bord (la caisse l'alimente
    // par Live Link) ; KiwiMenu expose la carte du commerce actif ; le plan de
    // salle persiste sous kiwiPlanDeSalle:<tenant>. Rien n'est inventé : une
    // fonctionnalité sans trace mesurable affiche zéro — et passe alors dans
    // les « Recommandées », c'est exactement son rôle.
    const venuesList = allBiz();
    const venuesCount = venuesList.length;

    const lsJson = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } };
    /* Balaye les clés kiwi* dont le nom contient `frag` et rend le plus grand
       magasin trouvé (tableau nu, .items/.list nommé, ou valeurs d'objet) —
       robuste aux clés par tenant sans avoir à les recopier ici. */
    function scanCount(frag, path) {
      let best = 0;
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) || '';
          if (!/^kiwi/i.test(k) || k.toLowerCase().indexOf(frag) < 0) continue;
          const v = lsJson(k);
          let n = 0;
          if (Array.isArray(v)) n = v.length;
          else if (v && Array.isArray(v[path])) n = v[path].length;
          else if (v && typeof v === 'object') n = Object.values(v).filter(Boolean).length;
          if (n > best) best = n;
        }
      } catch (_) {}
      return best;
    }

    const salesT = (window.KiwiSales && window.KiwiSales.totals) ? (window.KiwiSales.totals() || {}) : {};
    const realSalesCount = salesT.count || 0;
    const realSalesVolume = salesT.revenue || 0;
    let lastSaleTs = 0;
    try { (window.KiwiSales.list() || []).forEach((x) => { const t = +(x && x.ts) || 0; if (t > lastSaleTs) lastSaleTs = t; }); } catch (_) {}
    const daysSinceSale = lastSaleTs ? Math.floor((Date.now() - lastSaleTs) / 86400000) : null;

    const menuCount = (() => { try { return (window.KiwiMenu?.items?.() || []).length; } catch (_) { return 0; } })();
    const invCount = (() => {
      try {
        const cur = window.KiwiVenue?.getCurrentVenueData?.() || {};
        return (window.KiwiVenue?.getInventory?.(cur.id || cur.slug || cur.key) || []).length;
      } catch (_) { return 0; }
    })();
    const tableCount = scanCount('plandesalle', 'tables');
    const clientsCount = scanCount('client', 'clients');
    const resaCount = scanCount('reserv', 'reservations') || scanCount('resa', 'list');
    const teamCount = (() => {
      try {
        const by = window.__kiwiTeamV2 && window.__kiwiTeamV2.byVenue;
        let n = 0;
        if (by) Object.values(by).forEach((l) => { if (Array.isArray(l) && l.length > n) n = l.length; });
        return n;
      } catch (_) { return 0; }
    })();
    const aiCount = scanCount('agent', 'messages') || scanCount('copilot', 'messages');

    // Real device / browser detection
    const ua = navigator.userAgent || "";
    let osName = "Poste de travail";
    if (ua.includes("Mac OS") || ua.includes("Macintosh")) osName = "Apple Mac";
    else if (ua.includes("iPhone")) osName = "Apple iPhone";
    else if (ua.includes("iPad")) osName = "Apple iPad";
    else if (ua.includes("Android")) osName = "Terminal Android";
    else if (ua.includes("Windows")) osName = "PC Windows";

    let browserName = "Navigateur Web";
    if (ua.includes("Chrome") && !ua.includes("Edg")) browserName = "Google Chrome";
    else if (ua.includes("Safari") && !ua.includes("Chrome")) browserName = "Apple Safari";
    else if (ua.includes("Firefox")) browserName = "Mozilla Firefox";
    else if (ua.includes("Edg")) browserName = "Microsoft Edge";

    /* L'imprimante : l'état vient de KiwiPrinter (la vraie couche matérielle)
       avec kiwiPrinterCfg — sa clé réelle — en secours. */
    let printerConfigured = false;
    try {
      if (window.KiwiPrinter) printerConfigured = window.KiwiPrinter.isConnected ? window.KiwiPrinter.isConnected() : window.KiwiPrinter.isConfigured();
      if (!printerConfigured) printerConfigured = !!localStorage.getItem('kiwiPrinterCfg');
    } catch (_) {}

    const pv = pairedVenue();

    /* Icônes Material Symbols recopiées d'assets/icons/material/ (voir le
       README du dossier) — forme pleine, currentColor, jamais d'emoji. */
    const mi = (d) => `<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" style="width:18px;height:18px;flex:none;"><path d="${d}"/></svg>`;
    const MI = {
      receipt_long: mi('M240-80q-50 0-85-35t-35-85v-120h120v-560l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v680q0 50-35 85t-85 35H240Zm480-80q17 0 28.5-11.5T760-200v-560H320v440h360v120q0 17 11.5 28.5T720-160ZM360-600v-80h240v80H360Zm0 120v-80h240v80H360Zm320-120q-17 0-28.5-11.5T640-640q0-17 11.5-28.5T680-680q17 0 28.5 11.5T720-640q0 17-11.5 28.5T680-600Zm0 120q-17 0-28.5-11.5T640-520q0-17 11.5-28.5T680-560q17 0 28.5 11.5T720-520q0 17-11.5 28.5T680-480ZM240-160h360v-80H200v40q0 17 11.5 28.5T240-160Zm-40 0v-80 80Z'),
      menu_book: mi('M560-564v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-600q-38 0-73 9.5T560-564Zm0 220v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-380q-38 0-73 9t-67 27Zm0-110v-68q33-14 67.5-21t72.5-7q26 0 51 4t49 10v64q-24-9-48.5-13.5T700-490q-38 0-73 9.5T560-454ZM260-320q47 0 91.5 10.5T440-278v-394q-41-24-87-36t-93-12q-36 0-71.5 7T120-692v396q35-12 69.5-18t70.5-6Zm260 42q44-21 88.5-31.5T700-320q36 0 70.5 6t69.5 18v-396q-33-14-68.5-21t-71.5-7q-47 0-93 12t-87 36v394Zm-40 118q-48-38-104-59t-116-21q-42 0-82.5 11T100-198q-21 11-40.5-1T40-234v-482q0-11 5.5-21T62-752q46-24 96-36t102-12q58 0 113.5 15T480-740q51-30 106.5-45T700-800q52 0 102 12t96 36q11 5 16.5 15t5.5 21v482q0 23-19.5 35t-40.5 1q-37-20-77.5-31T700-240q-60 0-116 21t-104 59ZM280-494Z'),
      inventory_2: mi('M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z'),
      table_restaurant: mi('M173-600h614l-34-120H208l-35 120Zm307-60Zm192 140H289l-11 80h404l-10-80ZM160-160l49-360h-89q-20 0-31.5-16T82-571l57-200q4-13 14-21t24-8h606q14 0 24 8t14 21l57 200q5 19-6.5 35T840-520h-88l48 360h-80l-27-200H267l-27 200h-80Z'),
      favorite: mi('m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z'),
      today: mi('M289-329q-29-29-29-71t29-71q29-29 71-29t71 29q29 29 29 71t-29 71q-29 29-71 29t-71-29ZM200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Z'),
      trending_up: mi('m136-240-56-56 296-298 160 160 208-206H640v-80h240v240h-80v-104L536-320 376-480 136-240Z'),
      storefront: mi('M841-518v318q0 33-23.5 56.5T761-120H201q-33 0-56.5-23.5T121-200v-318q-23-21-35.5-54t-.5-72l42-136q8-26 28.5-43t47.5-17h556q27 0 47 16.5t29 43.5l42 136q12 39-.5 71T841-518Zm-272-42q27 0 41-18.5t11-41.5l-22-140h-78v148q0 21 14 36.5t34 15.5Zm-180 0q23 0 37.5-15.5T441-612v-148h-78l-22 140q-4 24 10.5 42t37.5 18Zm-178 0q18 0 31.5-13t16.5-33l22-154h-78l-40 134q-6 20 6.5 43t41.5 23Zm540 0q29 0 42-23t6-43l-42-134h-76l22 154q3 20 16.5 33t31.5 13ZM201-200h560v-282q-5 2-6.5 2H751q-27 0-47.5-9T663-518q-18 18-41 28t-49 10q-27 0-50.5-10T481-518q-17 18-39.5 28T393-480q-29 0-52.5-10T299-518q-21 21-41.5 29.5T211-480h-4.5q-2.5 0-5.5-2v282Zm560 0H201h560Z'),
      print: mi('M640-640v-120H320v120h-80v-200h480v200h-80Zm-480 80h640-640Zm560 100q17 0 28.5-11.5T760-500q0-17-11.5-28.5T720-540q-17 0-28.5 11.5T680-500q0 17 11.5 28.5T720-460Zm-80 260v-160H320v160h320Zm80 80H240v-160H80v-240q0-51 35-85.5t85-34.5h560q51 0 85.5 34.5T880-520v240H720v160Zm80-240v-160q0-17-11.5-28.5T760-560H200q-17 0-28.5 11.5T160-520v160h80v-80h480v80h80Z'),
      phonelink: mi('M480-540ZM80-160v-80h400v80H80Zm120-120q-33 0-56.5-23.5T120-360v-360q0-33 23.5-56.5T200-800h560q33 0 56.5 23.5T840-720H200v360h280v80H200Zm600 40v-320H640v320h160Zm-180 80q-25 0-42.5-17.5T560-220v-360q0-25 17.5-42.5T620-640h200q25 0 42.5 17.5T880-580v360q0 25-17.5 42.5T820-160H620Zm100-300q13 0 21.5-9t8.5-21q0-13-8.5-21.5T720-520q-12 0-21 8.5t-9 21.5q0 12 9 21t21 9Zm0 60Z'),
      shield: mi('M480-80q-139-35-229.5-159.5T160-516v-244l320-120 320 120v244q0 152-90.5 276.5T480-80Zm0-84q104-33 172-132t68-220v-189l-240-90-240 90v189q0 121 68 220t172 132Zm0-316Z'),
    };

    const T = {
      title: "My Kiwi",
      sub: pick({
        fr: `Compte & exploitation · ${biz}`,
        en: `Account & operations · ${biz}`,
        ar: `الحساب والعمليات · ${biz}`,
      }),
      accountStatus: pick({
        fr: "Compte actif · PWA Local-First · Synchronisation cloud",
        en: "Active account · Local-First PWA · Cloud sync",
        ar: "حساب نشط · تطبيق PWA محلي · مزامنة سحابية",
      }),
      planBadge: pick({ fr: "Formule Active", en: "Active Plan", ar: "الباقة النشطة" }),
      
      kpiVenues: pick({ fr: "Établissements", en: "Venues", ar: "المؤسسات" }),
      kpiVenuesSub: pick({ fr: "Magasins & points de vente", en: "Shops & retail outlets", ar: "المتاجر ونقاط البيع" }),
      kpiProducts: pick({ fr: "Articles à la carte", en: "Menu items", ar: "عناصر القائمة" }),
      kpiProductsSub: pick({ fr: "Carte du commerce actif", en: "Active venue's menu", ar: "قائمة المتجر النشط" }),
      kpiTickets: pick({ fr: "Ventes enregistrées", en: "Recorded sales", ar: "المبيعات المسجلة" }),
      kpiTicketsSub: pick({ fr: "Grand livre · depuis l'ouverture", en: "Ledger · since day one", ar: "دفتر الأستاذ · منذ البداية" }),
      kpiVolume: pick({ fr: "Volume encaissé", en: "Processed volume", ar: "الحجم المحصّل" }),
      kpiVolumeSub: pick({ fr: "Total du grand livre · MAD", en: "Ledger total · MAD", ar: "إجمالي الدفتر · درهم" }),

      secUsage: pick({
        fr: "Fonctionnalités les plus utilisées",
        en: "Most-used features",
        ar: "الميزات الأكثر استخداماً",
      }),
      secUsageSub: pick({
        fr: "Mesuré sur les données réelles de ce compte — ventes, carte, stock, salle, équipe",
        en: "Measured on this account's real data — sales, menu, stock, floor, team",
        ar: "مقاس على بيانات هذا الحساب الحقيقية",
      }),
      usageEmpty: pick({
        fr: "Encore aucune activité mesurée sur cet appareil — encaissez votre première vente et ce panorama s'allume.",
        en: "No activity measured on this device yet — ring up your first sale and this panorama lights up.",
        ar: "لا نشاط مقاساً بعد على هذا الجهاز — سجّل أول بيع وستضيء هذه اللوحة.",
      }),
      secReco: pick({
        fr: "À exploiter davantage",
        en: "Worth using more",
        ar: "تستحق استخداماً أكثر",
      }),
      secRecoSub: pick({
        fr: "Incluses dans votre formule et encore muettes sur ce compte — chacune se lance en un clic",
        en: "Included in your plan and still silent on this account — each one starts in a click",
        ar: "مشمولة في باقتك وما تزال صامتة — تبدأ بنقرة واحدة",
      }),
      recoBadge: pick({ fr: "Recommandée", en: "Recommended", ar: "موصى بها" }),

      secFleet: pick({
        fr: "Appareils & Périphériques détectés",
        en: "Detected Devices & Peripherals",
        ar: "الأجهزة والمعدات المتصلة",
      }),
      secFleetSub: pick({
        fr: "État en temps réel de votre matériel d’encaissement",
        en: "Real-time status of your checkout hardware",
        ar: "الحالة المباشرة لمعدات الصندوق",
      }),

      secSub: pick({
        fr: "Abonnement & Facturation",
        en: "Subscription & Billing",
        ar: "الاشتراك والفوترة",
      }),
      current: pick({ fr: "VOTRE FORMULE", en: "YOUR PLAN", ar: "باقتك الحالية" }),
      nextDue: pick({
        fr: "Prochaine échéance : 1 septembre 2026 · Prélèvement automatique",
        en: "Next charge: 1 September 2026 · Automatic debit",
        ar: "الاستحقاق القادم: 1 شتنبر 2026 · خصم تلقائي",
      }),
      changePlan: pick({ fr: "Changer de formule", en: "Change plan", ar: "تغيير الباقة" }),
      goUltra: pick({ fr: "Découvrir Ultra →", en: "Explore Ultra →", ar: "استكشف Ultra ←" }),
      payMethod: pick({ fr: "Moyen de paiement", en: "Payment method", ar: "طريقة الدفع" }),
      updateCard: pick({ fr: "Modifier la carte", en: "Update card", ar: "تحديث البطاقة" }),
      cancelSub: pick({ fr: "Résilier l’abonnement", en: "Cancel subscription", ar: "إلغاء الاشتراك" }),
      included: pick({ fr: "Inclus dans votre formule", en: "Included in your plan", ar: "مشمول في باقتك" }),

      secInvoices: pick({ fr: "Historique des factures Kiwi", en: "Kiwi invoice history", ar: "سجل فواتير كيوي" }),
      period: pick({ fr: "Période", en: "Period", ar: "الفترة" }),
      amount: pick({ fr: "Montant", en: "Amount", ar: "المبلغ" }),
      status: pick({ fr: "Statut", en: "Status", ar: "الحالة" }),
      invoice: pick({ fr: "Facture", en: "Invoice", ar: "الفاتورة" }),
      paid: pick({ fr: "Payée", en: "Paid", ar: "مدفوعة" }),
      pdf: pick({ fr: "Télécharger (PDF)", en: "Download (PDF)", ar: "تحميل (PDF)" }),
    };

    /* Chaque fonctionnalité porte un SIGNAL mesuré sur de vraies données.
       Signal > 0 → classée par usage réel ; signal nul → recommandée, avec son
       bénéfice et un bouton vers une destination dont le data-action est déjà
       tenu par le tableau de bord (le garde-fou de check.js les connaît). */
    const FEATURES = [
      { icon: MI.receipt_long, name: pick({ fr: 'Caisse & Encaissement', en: 'Register & Checkout', ar: 'الصندوق ونقطة البيع' }),
        n: realSalesCount, unit: pick({ fr: 'ventes au grand livre', en: 'sales in the ledger', ar: 'مبيعات في الدفتر' }),
        extra: daysSinceSale == null ? '' : (daysSinceSale === 0 ? pick({ fr: '· dernière vente aujourd\u2019hui', en: '· last sale today', ar: '· آخر بيع اليوم' }) : '· ' + daysSinceSale + ' ' + pick({ fr: 'j depuis la dernière vente', en: 'd since the last sale', ar: 'يوم منذ آخر بيع' })),
        pitch: pick({ fr: 'Encaissez et chaque vente nourrit vos chiffres en direct.', en: 'Ring up sales and your numbers update live.', ar: 'سجّل مبيعاتك وتتحدّث أرقامك مباشرة.' }), cta: null },
      { icon: MI.menu_book, name: pick({ fr: 'Carte & Catalogue', en: 'Menu & Catalog', ar: 'القائمة والكتالوج' }),
        n: menuCount, unit: pick({ fr: 'articles à la carte', en: 'items in the catalog', ar: 'عناصر في القائمة' }), extra: '',
        pitch: pick({ fr: 'Une carte à jour, ce sont des tickets plus rapides et zéro erreur de prix.', en: 'An up-to-date menu means faster tickets and zero price errors.', ar: 'قائمة محدّثة تعني تذاكر أسرع وبلا أخطاء أسعار.' }), cta: 'menu-edit', ctaLbl: pick({ fr: 'Compléter la carte', en: 'Build the menu', ar: 'أكمل القائمة' }) },
      { icon: MI.inventory_2, name: pick({ fr: 'Stock & Approvisionnement', en: 'Inventory & Supply', ar: 'المخزون والتموين' }),
        n: invCount, unit: pick({ fr: 'références suivies', en: 'tracked references', ar: 'مرجعيات متتبعة' }), extra: '',
        pitch: pick({ fr: 'Suivez vos coûts matière et soyez alerté des ruptures avant le service.', en: 'Track ingredient costs and get stock-out alerts before service.', ar: 'تتبّع تكاليف المواد مع تنبيهات النفاد قبل الخدمة.' }), cta: 'stock-reorder', ctaLbl: pick({ fr: 'Activer le stock', en: 'Start tracking', ar: 'فعّل المخزون' }) },
      { icon: MI.table_restaurant, name: pick({ fr: 'Plan de salle & Tables', en: 'Floor plan & Tables', ar: 'مخطط الصالة والطاولات' }),
        n: tableCount, unit: pick({ fr: 'tables sur le plan', en: 'tables on the plan', ar: 'طاولات على المخطط' }), extra: '',
        pitch: pick({ fr: 'Additions par table, transferts et vue service en un coup d\u2019œil.', en: 'Per-table checks, transfers and a one-glance service view.', ar: 'حسابات لكل طاولة ونظرة واحدة على الخدمة.' }), cta: null },
      { icon: MI.favorite, name: pick({ fr: 'Clients & Fidélité', en: 'Customers & Loyalty', ar: 'الزبائن والوفاء' }),
        n: clientsCount, unit: pick({ fr: 'fiches clients', en: 'customer profiles', ar: 'ملفات زبائن' }), extra: '',
        pitch: pick({ fr: 'Reconnaissez vos habitués — un client fidèle revient plus souvent et dépense plus.', en: 'Know your regulars — loyal customers come back more and spend more.', ar: 'تعرّف على زبائنك — الوفي يعود أكثر وينفق أكثر.' }), cta: 'clients-directory', ctaLbl: pick({ fr: 'Créer une fiche', en: 'Add a profile', ar: 'أنشئ ملفاً' }) },
      { icon: MI.today, name: pick({ fr: 'Réservations & RDV', en: 'Reservations & Bookings', ar: 'الحجوزات والمواعيد' }),
        n: resaCount, unit: pick({ fr: 'réservations enregistrées', en: 'recorded bookings', ar: 'حجوزات مسجلة' }), extra: '',
        pitch: pick({ fr: 'Remplissez la salle avant l\u2019ouverture et réduisez les no-shows.', en: 'Fill the room before you open and cut the no-shows.', ar: 'املأ الصالة قبل الفتح وقلّل الغيابات.' }), cta: 'nav-reservations', ctaLbl: pick({ fr: 'Ouvrir l\u2019agenda', en: 'Open the book', ar: 'افتح المفكرة' }) },
      { icon: MI.shield, name: pick({ fr: 'Équipe & Codes d\u2019accès', en: 'Team & Access codes', ar: 'الفريق ورموز الدخول' }),
        n: teamCount, unit: pick({ fr: 'membres d\u2019équipe', en: 'team members', ar: 'أعضاء فريق' }), extra: '',
        pitch: pick({ fr: 'Un code par employé : pointage, rôles et historique nominatif.', en: 'One code per employee: clock-ins, roles and a named history.', ar: 'رمز لكل موظف: حضور وأدوار وسجل بالأسماء.' }), cta: 'team-settings', ctaLbl: pick({ fr: 'Inviter l\u2019équipe', en: 'Invite the team', ar: 'ادعُ الفريق' }) },
      { icon: MI.trending_up, name: pick({ fr: 'Assistant Kiwi AI', en: 'Kiwi AI Assistant', ar: 'مساعد كيوي الذكي' }),
        n: aiCount, unit: pick({ fr: 'échanges avec l\u2019assistant', en: 'assistant conversations', ar: 'محادثات مع المساعد' }), extra: '',
        pitch: pick({ fr: 'Posez vos questions à la voix ou au clavier — marges, comparaisons, tendances.', en: 'Ask by voice or keyboard — margins, comparisons, trends.', ar: 'اسأل صوتياً أو كتابياً — الهوامش والمقارنات والاتجاهات.' }), cta: 'open-assistant', ctaLbl: pick({ fr: 'Essayer l\u2019assistant', en: 'Try the assistant', ar: 'جرّب المساعد' }) },
    ];
    const used = FEATURES.filter((f) => f.n > 0).sort((a, b) => b.n - a.n);
    const reco = FEATURES.filter((f) => !f.n);
    const maxN = used.length ? used[0].n : 1;

    /* Trois cartes, trois états MESURÉS — plus de statut décoratif. */
    const fleet = [
      { icon: MI.phonelink, name: osName + ' · ' + browserName,
        role: pick({ fr: 'Ce terminal · session en cours', en: 'This terminal · current session', ar: 'هذا الجهاز · الجلسة الحالية' }),
        ok: navigator.onLine !== false,
        status: navigator.onLine !== false ? pick({ fr: 'En ligne · synchronisation active', en: 'Online · live sync', ar: 'متصل · مزامنة نشطة' }) : pick({ fr: 'Hors-ligne · vos données restent locales', en: 'Offline · your data stays local', ar: 'غير متصل · بياناتك محلية' }) },
      { icon: MI.storefront, name: pv ? pick({ fr: 'Caisse appairée · ', en: 'Paired till · ', ar: 'صندوق مقترن · ' }) + (pv.name || pv.merchant || '') : pick({ fr: 'Caisse', en: 'Till', ar: 'الصندوق' }),
        role: pick({ fr: 'Point d\u2019encaissement comptoir', en: 'Front-desk checkout station', ar: 'نقطة البيع الرئيسية' }),
        ok: !!pv,
        status: pv ? pick({ fr: 'Reliée à ce compte', en: 'Linked to this account', ar: 'مرتبط بهذا الحساب' }) : pick({ fr: 'Aucune caisse appairée — reliez-la depuis la caisse, menu Appairage', en: 'No till paired yet — pair it from the till', ar: 'لا صندوق مقترناً بعد' }) },
      { icon: MI.print, name: pick({ fr: 'Imprimante de tickets', en: 'Receipt printer', ar: 'طابعة التذاكر' }),
        role: pick({ fr: 'Thermique 80 mm · tiroir-caisse via port DK', en: '80 mm thermal · cash drawer via DK port', ar: 'حرارية 80 مم · درج النقود عبر منفذ DK' }),
        ok: printerConfigured,
        status: printerConfigured ? pick({ fr: 'Configurée sur ce poste', en: 'Configured on this station', ar: 'مهيأة على هذا الجهاز' }) : pick({ fr: 'Non configurée — Réglages → Imprimante', en: 'Not configured — Settings → Printer', ar: 'غير مهيأة — الإعدادات ← الطابعة' }) },
    ];



    Kiwi.appPage("account-billing", {
      title: T.title,
      subtitle: T.sub,
      body: `
        <!-- ═══ HERO ACCOUNT STATUS CARD ═══ -->
        <div class="acc-hero-card">
          <div class="acc-hero-left">
            <div class="acc-hero-avatar">${esc(initialsOf(biz))}</div>
            <div>
              <div class="acc-hero-biz">${esc(biz)}</div>
              <div class="acc-hero-meta">
                <span class="acc-biz-badge">${esc(plan.name.toUpperCase())}</span>
                <span>${esc(T.accountStatus)}</span>
              </div>
            </div>
          </div>
          <div>
            <button class="acc-cta ghost" data-action="upgrade-pro">${esc(T.changePlan)}</button>
          </div>
        </div>

        <!-- ═══ 4-METRIC REAL OPERATIONAL KPI BAND ═══ -->
        <div class="acc-kpi-band">
          <div class="acc-kpi-box">
            <div class="val" style="color:var(--atlas);">${venuesCount}</div>
            <div class="lbl">${esc(T.kpiVenues)}</div>
            <div class="sub">${esc(T.kpiVenuesSub)}</div>
          </div>
          <div class="acc-kpi-box">
            <div class="val">${fmtMAD(menuCount)}</div>
            <div class="lbl">${esc(T.kpiProducts)}</div>
            <div class="sub">${esc(T.kpiProductsSub)}</div>
          </div>
          <div class="acc-kpi-box">
            <div class="val">${fmtMAD(realSalesCount)}</div>
            <div class="lbl">${esc(T.kpiTickets)}</div>
            <div class="sub">${esc(T.kpiTicketsSub)}</div>
          </div>
          <div class="acc-kpi-box">
            <div class="val" style="color:var(--success);">${fmtMAD(realSalesVolume)} <span style="font-size:12px;opacity:.6;">MAD</span></div>
            <div class="lbl">${esc(T.kpiVolume)}</div>
            <div class="sub">${esc(T.kpiVolumeSub)}</div>
          </div>
        </div>

        <!-- ═══ REAL MODULES STATUS ═══ -->
        <div class="acc-section-head">
          <div>
            <h3>${esc(T.secUsage)}</h3>
            <div class="ct">${esc(T.secUsageSub)}</div>
          </div>
        </div>
        <div class="acc-meter-grid" style="margin-bottom:24px;">
          ${used.length ? used.map((f) => `
            <div class="acc-meter-item">
              <div class="acc-meter-head">
                <div class="acc-meter-t">${f.icon} <span>${esc(f.name)}</span></div>
                <div class="acc-meter-pct">${fmtMAD(f.n)}</div>
              </div>
              <div class="acc-meter-desc" style="margin-bottom:8px;">${esc(f.n + ' ' + f.unit + (f.extra ? ' ' + f.extra : ''))}</div>
              <div style="height:4px;border-radius:2px;background:var(--n-200,rgba(0,0,0,.08));overflow:hidden;" aria-hidden="true">
                <i style="display:block;height:100%;width:${Math.max(6, Math.round(100 * f.n / maxN))}%;background:var(--atlas);border-radius:2px;"></i>
              </div>
            </div>
          `).join("") : `<div class="acc-meter-item"><div class="acc-meter-desc" style="margin:0;">${esc(T.usageEmpty)}</div></div>`}
        </div>

        <!-- ═══ RECOMMANDATIONS — fonctionnalités muettes sur ce compte ═══ -->
        ${reco.length ? `
        <div class="acc-section-head">
          <div>
            <h3>${esc(T.secReco)}</h3>
            <div class="ct">${esc(T.secRecoSub)}</div>
          </div>
        </div>
        <div class="acc-meter-grid" style="margin-bottom:24px;">
          ${reco.map((f) => `
            <div class="acc-meter-item" style="border-inline-start:3px solid var(--mint);">
              <div class="acc-meter-head">
                <div class="acc-meter-t">${f.icon} <span>${esc(f.name)}</span></div>
                <div class="acc-meter-pct" style="color:var(--atlas);">${esc(T.recoBadge)}</div>
              </div>
              <div class="acc-meter-desc" style="margin-bottom:${f.cta ? '10px' : '0'};">${esc(f.pitch)}</div>
              ${f.cta ? `<button class="acc-cta ghost" type="button" data-action="${f.cta}">${esc(f.ctaLbl || '')}</button>` : ''}
            </div>
          `).join("")}
        </div>` : ''}

        <!-- ═══ REAL DETECTED FLEET & HARDWARE ═══ -->
        <div class="acc-section-head">
          <div>
            <h3>${esc(T.secFleet)}</h3>
            <div class="ct">${esc(T.secFleetSub)}</div>
          </div>
        </div>
        <div class="acc-fleet-grid" style="margin-bottom:24px;">
          ${fleet.map((d) => `
            <div class="acc-fleet-card">
              <div class="acc-fleet-ico" style="color:var(--atlas);">${d.icon}</div>
              <div class="acc-fleet-info">
                <div class="acc-fleet-name">${esc(d.name)}</div>
                <div class="acc-fleet-role">${esc(d.role)}</div>
                <div class="acc-fleet-status"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${d.ok ? 'var(--atlas)' : 'var(--n-400, #9aa4a0)'};margin-inline-end:6px;" aria-hidden="true"></span>${esc(d.status)}</div>
              </div>
            </div>
          `).join("")}
        </div>

        <!-- ═══ SUBSCRIPTION & BILLING CONTROLS ═══ -->
        <div class="acc-section-head">
          <div>
            <h3>${esc(T.secSub)}</h3>
          </div>
        </div>
        <div class="acc-plan">
          <div>
            <div class="acc-plan-name">${esc(T.current)}</div>
            <div class="acc-plan-price">${esc(plan.name)} · ${esc(plan.price)}<small>${esc(plan.cycle || "/mois")}</small></div>
            <div class="acc-plan-meta">${esc(T.nextDue)}</div>
          </div>
          <div class="acc-plan-acts">
            <button class="acc-cta light" data-action="upgrade-pro">${esc(T.changePlan)}</button>
            <button class="acc-cta ghost" style="color:#fff;border-color:rgba(255,255,255,0.4);" data-action="upgrade-pro">${esc(T.goUltra)}</button>
          </div>
        </div>
        <div class="acc-grid">
          <div class="acc-card">
            <div class="acc-eyebrow">${esc(T.payMethod)}</div>
            <p style="font-size:14px; font-weight:600; margin:4px 0 14px; color:var(--ink);">${esc(cardSaved)}</p>
            <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
              <button class="acc-cta ghost" data-action="account-update-card">${esc(T.updateCard)}</button>
              <button class="acc-danger" data-action="account-plan-cancel">${esc(T.cancelSub)}</button>
            </div>
          </div>
          <div class="acc-card">
            <div class="acc-eyebrow">${esc(T.included)}</div>
            <div class="acc-chips" style="margin-top:4px;">
              ${incl.map((i) => `<span class="acc-chip">${esc(i)}</span>`).join("")}
            </div>
          </div>
        </div>

        <!-- ═══ INVOICE HISTORY ═══ -->
        <div class="acc-sec-title">${esc(T.secInvoices)}</div>
        <div class="acc-card span2">
          <table class="acc-tbl">
            <thead>
              <tr>
                <th>${esc(T.period)}</th>
                <th>RÉFÉRENCE</th>
                <th>${esc(T.amount)}</th>
                <th>${esc(T.status)}</th>
                <th style="text-align:end;">${esc(T.invoice)}</th>
              </tr>
            </thead>
            <tbody>
              ${months.map((m) => `
                <tr>
                  <td><b>${esc(m.period)}</b></td>
                  <td><code style="font-family:var(--mono);font-size:11px;color:var(--n-500);">${esc(m.ref)}</code></td>
                  <td>${esc(m.amount)}</td>
                  <td><span class="acc-paid">✓ ${esc(T.paid)}</span></td>
                  <td style="text-align:end;">
                    <a class="acc-dl" data-action="account-dl-invoice" data-inv="${esc(m.ref)}">${esc(T.pdf)}</a>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>`,
    });

    handlers['account-update-card'] = () => updateCardModal();
    handlers['account-plan-cancel'] = () => planCancelModal();
    handlers['account-dl-invoice'] = (el) => {
      const inv = el?.getAttribute?.('data-inv') || 'KIWI-INV-2026-08';
      const p = el?.closest('tr')?.querySelector('b')?.textContent || 'Août 2026';
      const L = (k) => pick(k);
      
      const html = `
        <div style="font-family:system-ui,-apple-system,sans-serif;padding:20px;color:var(--ink);background:var(--surface);border:1px solid var(--n-200);border-radius:14px;max-width:440px;margin:auto;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--atlas);padding-bottom:12px;margin-bottom:16px;">
            <div>
              <div style="font-size:20px;font-weight:800;color:var(--atlas);letter-spacing:-0.03em;">KIWI POS</div>
              <div style="font-size:11px;color:var(--n-500);">Kiwi Technologies SARL</div>
            </div>
            <div style="text-align:end;">
              <div style="font-size:12.5px;font-weight:700;color:var(--success);">✓ ${esc(L({ fr: 'FACTURE ACQUITTÉE', en: 'PAID INVOICE', ar: 'فاتورة مدفوعة' }))}</div>
              <div style="font-family:var(--mono);font-size:11px;color:var(--n-500);">${esc(inv)}</div>
            </div>
          </div>
          <div style="font-size:12.5px;margin-bottom:14px;line-height:1.6;">
            <div><b>${esc(L({ fr: 'Client :', en: 'Merchant:', ar: 'الزبون:' }))}</b> ${esc(biz)}</div>
            <div><b>${esc(L({ fr: 'Période :', en: 'Period:', ar: 'الفترة:' }))}</b> ${esc(p)}</div>
            <div><b>${esc(L({ fr: 'Paiement :', en: 'Payment:', ar: 'طريقة الدفع:' }))}</b> ${esc(cardSaved)}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:16px;">
            <thead>
              <tr style="border-bottom:1px solid var(--n-200);text-align:start;">
                <th style="padding:6px 0;font-weight:600;">Description</th>
                <th style="text-align:end;padding:6px 0;font-weight:600;">Total HT</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding:8px 0;">Abonnement ${esc(plan.name)} · 1 mois</td>
                <td style="text-align:end;padding:8px 0;font-family:var(--mono);">332,50 MAD</td>
              </tr>
              <tr style="border-top:1px solid var(--n-100);">
                <td style="padding:6px 0;color:var(--n-500);">TVA légale (20%)</td>
                <td style="text-align:end;padding:6px 0;font-family:var(--mono);color:var(--n-500);">66,50 MAD</td>
              </tr>
              <tr style="border-top:2px solid var(--n-300);font-weight:700;font-size:14px;">
                <td style="padding:8px 0;">Total TTC</td>
                <td style="text-align:end;padding:8px 0;font-family:var(--mono);color:var(--atlas);">${esc(plan.price)} MAD</td>
              </tr>
            </tbody>
          </table>
          <div style="text-align:center;font-size:11px;color:var(--n-500);border-top:1px dashed var(--n-200);padding-top:12px;">
            Facture électronique certifiée conforme · ICE: 003291823000045 · RC Casablanca
          </div>
        </div>`;

      const m = Kiwi.modal({
        tag: pick({ fr: 'JUSTIFICATIF COMPTABLE', en: 'TAX RECEIPT', ar: 'إيصال ضريبي' }),
        title: `${esc(inv)} · ${esc(p)}`,
        width: 490,
        body: html,
        foot: `<button class="kb ghost" data-close type="button" style="flex:1;justify-content:center;">${esc(L({ fr: 'Fermer', en: 'Close', ar: 'إغلاق' }))}</button><button class="kb atlas" data-print type="button" style="flex:1;justify-content:center;">${esc(L({ fr: 'Imprimer / Enregistrer PDF', en: 'Print / Save PDF', ar: 'طباعة / حفظ PDF' }))}</button>`,
      });
      m.el.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) m.close();
        if (e.target.closest('[data-print]')) {
          window.print();
        }
      });
    };
  }

  /* ════════════════════════════ CENTRE D'AIDE ════════════════════════════ */
  function openHelp() {
    if (window.KiwiHelp && window.KiwiHelp.open) window.KiwiHelp.open();
  }

  /* ── Edit-profile modal (persists to kiwiSet:* like the Settings editors) ── */
  function editProfile() {
    const fld = 'width:100%;padding:11px 13px;border:1px solid var(--n-200);border-radius:10px;font-family:var(--sans);font-size:14px;color:var(--ink);background:var(--surface);outline:none;box-sizing:border-box;';
    const lbl = 'display:block;font-size:12px;font-weight:500;color:var(--n-600);margin:16px 0 6px;';
    const L = (k) => pick(k);
    const fields = [
      { k: 'ownerName', label: L({ fr: 'Nom complet', en: 'Full name', ar: 'الاسم الكامل' }), cur: ownerName() },
      { k: 'ownerEmail', label: L({ fr: 'Email', en: 'Email', ar: 'البريد الإلكتروني' }), cur: ownerEmail() },
      { k: 'ownerPhone', label: L({ fr: 'Téléphone', en: 'Phone', ar: 'الهاتف' }), cur: ownerPhone() },
    ];
    const m = Kiwi.modal({
      tag: pick({ fr: 'PROFIL', en: 'PROFILE', ar: 'الملف' }),
      title: L({ fr: 'Modifier mon profil', en: 'Edit my profile', ar: 'تعديل ملفي' }),
      width: 460,
      body: '<style>.acc-f:focus{border-color:var(--atlas)!important;}</style>' + fields.map((f, i) =>
        `<label style="${lbl}${i === 0 ? 'margin-top:2px;' : ''}">${esc(f.label)}</label><input class="acc-f" data-f="${f.k}" maxlength="60" style="${fld}"/>`).join(''),
      foot: `<button class="kb atlas" data-save type="button" style="width:100%;justify-content:center;padding:12px;font-size:15px;">${esc(L({ fr: 'Enregistrer', en: 'Save', ar: 'حفظ' }))}</button>`,
    });
    fields.forEach((f) => { m.el.querySelector(`[data-f="${f.k}"]`).value = f.cur; });
    setTimeout(() => { const a = m.el.querySelector('.acc-f'); if (a) a.focus(); }, 320);
    m.el.addEventListener('click', (e) => {
      if (!e.target.closest('[data-save]')) return;
      fields.forEach((f) => { const v = (m.el.querySelector(`[data-f="${f.k}"]`).value || '').trim(); if (v) { try { localStorage.setItem('kiwiSet:' + f.k, v); } catch (_) {} } });
      m.close();
      setTimeout(() => openProfile(), 80);
      Kiwi.toast(pick({ fr: 'Profil mis à jour', en: 'Profile updated', ar: 'تم تحديث الملف' }), { type: 'success', force: true });
    });
  }

  handlers['account-profile'] = openProfile;
  handlers['account-billing'] = openBilling;
  handlers['account-help'] = openHelp;
  handlers['account-edit-profile'] = editProfile;
})();
