/* Owner: agent drawer, CSS and prompt rendering.
 * Registers functions on KiwiAgent.__internal; needs its live private-state accessors.
 * No merchant data, DOM work or requests run at registration. */
(function () {
  'use strict';
  window.__kiwiAgentParts = function (__state) {
function menuContextLines() {
    const items = (window.KiwiMenu && window.KiwiMenu.items && window.KiwiMenu.items()) || [];
    if (!items.length) return null;
    return items.slice().sort((a, b) => b.units - a.units).map(
      (it) => `  · ${it.name}, ${__state.fmt(it.units)} vendus/mois · prix ${__state.fmt(it.price)} MAD · marge unitaire ${__state.fmt(it.price - it.cost)} MAD`
    ).join('\n');
  }
function liveActivityContextLines() {
    const sim = window.KiwiDemoClock && window.KiwiDemoClock.getSimState && window.KiwiDemoClock.getSimState();
    const cache = window.__kiwiFeedOrders || {};
    const orders = Object.keys(cache).sort().map(k => cache[k]).filter(Boolean);
    if (!sim || (!sim.cumTx && !orders.length)) return null;

    const lines = [];
    /* Aggregates straight from the simulator — the merchant sees these at the
     * top of the dashboard, so the agent must match them exactly. */
    lines.push(
      `  · Heure de service simulée : ~${sim.simHourLabel || '·'}`,
      `  · Commandes encaissées depuis ce matin : ${__state.fmt(sim.cumTx || 0)}`,
      `  · CA réalisé depuis ce matin : ${__state.fmt(sim.cumRevenue || 0)} MAD`,
      `  · Panier moyen aujourd'hui : ${__state.fmt(sim.panierMoyen || 0)} MAD`,
      `  · Clients réguliers identifiés : ${__state.fmt(sim.cumRegulars || 0)}`
    );

    if (orders.length) {
      /* Compact per-order line: time · customer/table · server · payment ·
       * total · 1–2 items. Keeps the prompt readable even with 10 orders. */
      const fmt2 = (n) => window.KiwiNumber?.number(n, 2) || Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const recent = orders.slice(0, 8).map(o => {
        const items = (o.items || []).slice(0, 2).map(it => `×${it.qty} ${it.name}`).join(', ');
        const more = (o.items || []).length > 2 ? ` (+${o.items.length - 2})` : '';
        const table = o.table != null ? `T${o.table}` : '·';
        const covers = o.covers ? ` · ${o.covers} couvert${o.covers > 1 ? 's' : ''}` : '';
        const server = o.server ? ` · servi par ${o.server}` : '';
        const total = (o.total || o.amt) ? `${o.total || o.amt} MAD` : '·';
        return `  · ${o.t || '·'} · ${o.customer || '·'} · ${table}${covers}${server} · ${o.primary || '·'} · ${total}${items ? `, ${items}${more}` : ''}`;
      });
      lines.push('', `  Les ${recent.length} dernières commandes encaissées (la plus récente d'abord) :`);
      lines.push(...recent);

      /* Servers actually seen on shift today, with their ticket count — lets
       * the model answer staffing questions from observed work, not the
       * static employee list. */
      const seenServers = {};
      orders.forEach(o => { if (o.server) seenServers[o.server] = (seenServers[o.server] || 0) + 1; });
      const servers = Object.keys(seenServers).sort((a, b) => seenServers[b] - seenServers[a]);
      if (servers.length) {
        lines.push('', `  Serveurs en service maintenant : ${servers.map(s => `${s} (${seenServers[s]} ticket${seenServers[s] > 1 ? 's' : ''})`).join(', ')}.`);
      }
    }
    return lines.join('\n');
  }
function buildSystemPrompt(lang) {
    const dir = __state.SP_DIR[lang] || __state.SP_DIR.fr;
    let featureContext = '';
    try {
      if (window.KiwiFeatureGuide && typeof window.KiwiFeatureGuide.promptContext === 'function') {
        featureContext = window.KiwiFeatureGuide.promptContext(__state.B.trade, lang);
      }
    } catch (_) {}
    let capabilityContext = '';
    try {
      if (window.KiwiFeatureTruth && window.KiwiFeatureTruth.context) {
        const c = window.KiwiFeatureTruth.context({ role: __state.accessTier() });
        capabilityContext = JSON.stringify({ venue: c.venue, plan: c.plan, role: c.role, aiMode: c.aiMode,
          access: c.assistantAccess, features: c.features.map((f) => ({ key: f.key, nav: f.nav, enabled: f.enabled, live: f.live, permission: f.permission })) });
      }
    } catch (_) {}
    /* The books never enter the context of a reader who may not see them.
     * Gating the deterministic answers alone would have been theatre: every
     * unmatched question goes to the model, and the model was handed the full
     * P&L — salaries, cash, net margin — in its very first system message. */
    if (!__state.seesBooks()) {
      const menuR = __state.menuContextLines();
      const liveR = __state.liveActivityContextLines();
      const outR = [
        dir, '',
        `Tu es l'assistant de "${__state.B.name}", un établissement au Maroc. Tu parles à un membre de l'équipe, PAS au propriétaire.`,
        `Ventes des 30 derniers jours : ${__state.fmt(__state.B.revenue)} MAD sur ${__state.fmt(__state.B.ordersPerMonth)} vente(s), panier moyen ${__state.fmt(__state.B.avgBasket)} MAD.`,
      ];
      if (liveR) outR.push('', 'Activité en direct, enregistrée par la caisse depuis l’ouverture aujourd’hui :', liveR);
      if (menuR) outR.push('', 'La carte, avec les ventes du mois par article :', menuR);
      if (featureContext) outR.push('', `Fonctions Kiwi disponibles pour le métier « ${__state.B.tradeLabel || __state.B.trade || 'établissement'} » :`, featureContext);
      if (capabilityContext) outR.push('', 'Contexte de capacité vérifié (source produit) :', capabilityContext);
      outR.push(
        '',
        'Règles :',
        `- Tu ne connais PAS et tu ne donnes JAMAIS : les marges, le coût matière, les charges, le loyer, les salaires, la masse salariale, le bénéfice, la trésorerie, le seuil de rentabilité, la valorisation. Si on te les demande, réponds que ces chiffres sont réservés au propriétaire du compte, en une phrase, sans t'excuser et sans en deviner un seul.`,
        `- Tu aides sur la caisse, les ventes, la carte, le stock, le service, les clients et les opérations.`,
        `- Pour expliquer ou configurer une fonction, appuie-toi uniquement sur la liste ci-dessus. Pose des questions courtes, puis guide vers la page correspondante. Ne prétends jamais avoir activé, enregistré ou intégré une fonction : la validation se fait sur la vraie page Kiwi.`,
        `- Tu es en LECTURE SEULE. Tu peux lire uniquement les adaptateurs explicitement marqués live. Tu ne modifies jamais stock, commande, reçu, imprimante, client ou réglage depuis une réponse.`,
        `- N'invente JAMAIS un chiffre, un plat ou une statistique.`,
        `- Tu n'as pas accès à Internet ni à des données en temps réel.`,
        __state.INTEGRITY_RULE,
        '',
        dir
      );
      return outR.join('\n');
    }
    if (__state.B.partial) {
      const partialPrompt = [
        dir, '',
        `Tu es l'assistant financier de "${__state.B.name}", un établissement qui vient de démarrer sur Kiwi, au Maroc.`,
        `Type d'activité : ${__state.B.tradeLabel || __state.B.trade || 'non renseigné'}.`,
        __state.salesWindowEvidence(__state.B),
        __state.B.revenue > 0
          ? `Seules données réelles disponibles : ${__state.fmt(__state.B.revenue)} MAD de ventes sur ${__state.fmt(__state.B.ordersPerMonth)} vente(s), panier moyen ${__state.fmt(__state.B.avgBasket)} MAD.`
          : `Aucune vente n'a encore été enregistrée pour cet établissement.`,
        `Tu n'as PAS sa structure de coûts (loyer, salaires, coût matière, marge, trésorerie, effectif) ni le détail de sa carte.`,
      ];
      if (featureContext) partialPrompt.push('', 'Fonctions Kiwi réellement disponibles pour ce métier :', featureContext);
      if (capabilityContext) partialPrompt.push('', 'Contexte de capacité vérifié (source produit) :', capabilityContext);
      partialPrompt.push('',
        'Règles :',
        `- N'invente JAMAIS un chiffre, un plat ou une statistique. Si on te demande une marge, un bénéfice, un seuil de rentabilité, des charges, ou les articles du menu, explique que le commerçant doit d'abord renseigner ces données dans Kiwi, ne donne ni nombre ni liste inventée.`,
        `- Tu peux donner des conseils de gestion généraux et qualitatifs, sans chiffrer ce que tu ne connais pas.`,
        `- Pour expliquer ou configurer une fonction, appuie-toi uniquement sur la liste ci-dessus. Pose des questions courtes et guide vers la page correspondante. Ne prétends jamais avoir activé, enregistré ou intégré une fonction : la validation se fait sur la vraie page Kiwi.`,
        `- Tu es en LECTURE SEULE. Un adaptateur live peut te donner un état, jamais l'autorisation de le changer.`,
        `- Tu n'as pas accès à Internet ni à des données en temps réel.`,
        `- Ne donne jamais de conseil d'investissement boursier. Ne réponds pas aux questions sans lien avec l'activité.`,
        __state.INTEGRITY_RULE,
        '',
        dir
      );
      return partialPrompt.join('\n');
    }
    const o = __state.B.opex;
    const menu = __state.menuContextLines();
    const live = __state.liveActivityContextLines();
    const lines = [
      dir, '',
      `Tu es l'assistant financier de "Café Atlas · Maarif", un café-restaurant à Casablanca, au Maroc.`,
      'Tu conseilles son propriétaire, Rachid. Voici ses chiffres réels sur les 30 derniers jours (en dirhams marocains, MAD) :',
      `- Chiffre d'affaires : ${__state.fmt(__state.B.revenue)} MAD`,
      `- Coût matière : ${__state.fmt(__state.B.cogs)} MAD (${__state.fmt1(100 - __state.B.grossMargin)} % du CA)`,
      `- Marge brute : ${__state.fmt(__state.B.grossProfit)} MAD (${__state.fmt1(__state.B.grossMargin)} %)`,
      `- Charges fixes : ${__state.fmt(__state.B.totalOpex)} MAD, dont masse salariale ${__state.fmt(o.salaries)}, loyer ${__state.fmt(o.rent)}, énergie ${__state.fmt(o.utilities)}.`,
      `- Bénéfice net : ${__state.fmt(__state.B.netProfit)} MAD (marge nette ${__state.fmt1(__state.B.netMargin)} %)`,
      `- Trésorerie disponible : ${__state.fmt(__state.B.cashBuffer)} MAD`,
      `- Panier moyen : ${__state.fmt(__state.B.avgBasket)} MAD · ${__state.fmt(__state.B.ordersPerMonth)} ventes/mois · ${__state.B.staffCount} employés.`,
    ];
    if (live) {
      lines.push(
        '',
        `Activité en direct, ce que la caisse a enregistré depuis l'ouverture aujourd'hui. Pour toute question sur la journée en cours, les commandes du moment, les serveurs ou les tables, appuie-toi UNIQUEMENT sur ce bloc, ce sont les seules données fraîches dont tu disposes :`,
        live
      );
    }
    if (menu) {
      lines.push(
        '',
        `Sa carte réelle, chaque article avec ses ventes du mois, son prix et sa marge unitaire. Pour TOUTE question sur le menu, les plats, les meilleures ou les moins bonnes ventes, appuie-toi UNIQUEMENT sur cette liste, n'invente jamais un plat qui n'y figure pas :`,
        menu
      );
    } else {
      lines.push('', `Tu n'as pas le détail de sa carte : pour une question sur les plats, invite-le à ouvrir la page Menu, ne cite aucun plat de mémoire.`);
    }
    if (featureContext) lines.push('', 'Fonctions Kiwi réellement disponibles pour ce métier :', featureContext);
    lines.push(
      '',
      'Règles :',
      `- Sois concis, concret et chiffré quand c'est utile.`,
      `- Tu peux parler de tout ce qui touche la gestion du café : finances, RH, marketing, opérations, fournisseurs, stratégie, menu.`,
      `- Pour expliquer ou configurer une fonction, appuie-toi uniquement sur la liste ci-dessus. Pose des questions courtes et guide vers la page correspondante. Ne prétends jamais avoir activé, enregistré ou intégré une fonction : la validation se fait sur la vraie page Kiwi.`,
      `- N'invente JAMAIS un chiffre, un plat ou une statistique : appuie-toi uniquement sur les données ci-dessus. Si une information manque, dis-le simplement.`,
      `- Tu NE réponds PAS aux questions sans lien avec l'activité (sport, célébrités, actualité). Décline poliment en une phrase.`,
      `- Tu n'as pas accès à Internet ni à des données en temps réel ; ne donne jamais de conseil d'investissement boursier.`,
      __state.INTEGRITY_RULE,
      '',
      dir
    );
    return lines.join('\n');
  }
function injectCss() {
    if (document.getElementById('fa-css')) return;
    const s = document.createElement('style');
    s.id = 'fa-css';
    s.textContent = `
    /* ─── Financial assistant · interface ─────────────────────────────── */
    .fa-drawer .kiwi-drawer { display:flex; flex-direction:column; }
    .fa-drawer .kiwi-drawer-body { flex:1; min-height:0; padding:0 !important; display:flex; }
    .fa-drawer .kiwi-drawer-head { background:var(--paper); padding:20px max(48px, calc((100vw - 1480px) / 2 + 48px)); }
    .fa-drawer .kiwi-drawer-head h3 { font-family:var(--sans); font-weight:600;
      font-size:18px; letter-spacing:-0.015em; color:var(--ink); }
    .fa-drawer .kiwi-drawer-head p { color:var(--n-500); font-size:13px; margin-top:3px; }

    .fa { display:flex; width:100%; height:100%; background:var(--paper);
      --fa-ease:var(--ease-glide,cubic-bezier(.16,1,.30,1)); }
    .fa-main { flex:1; display:flex; flex-direction:column; min-width:0; }

    /* thread */
    .fa-thread { flex:1; overflow-y:auto; padding:34px clamp(20px,8%,120px) 26px; }
    .fa-thread::-webkit-scrollbar { width:8px; }
    .fa-thread::-webkit-scrollbar-thumb { background:var(--n-200); border-radius:8px; }
    .fa-thread-in { max-width:730px; margin:0 auto; display:flex; flex-direction:column; gap:28px; }
    .fa-msg { display:flex; gap:14px; animation:fa-rise 560ms var(--fa-ease) both; }
    .fa-msg.user { justify-content:flex-end; }
    @keyframes fa-rise { from{ opacity:0; transform:translateY(14px); } to{ opacity:1; transform:none; } }

    .fa-avatar { width:30px; height:30px; border-radius:50%; flex-shrink:0; margin-top:1px;
      display:flex; align-items:center; justify-content:center;
      background:linear-gradient(150deg,var(--atlas),var(--riad)); color:var(--mint);
      box-shadow:0 3px 10px -3px rgba(11,110,79,.55); }
    .fa-avatar-ico { width:17px; height:17px;
      filter:brightness(0) saturate(100%) invert(85%) sepia(31%) saturate(469%)
        hue-rotate(70deg) brightness(102%) contrast(91%); }

    /* agent message · text flows on paper, no box */
    .fa-msg.agent .fa-bubble { flex:1; min-width:0; max-width:632px; padding-top:3px;
      font-size:14px; line-height:1.62; color:var(--ink); }
    /* user message · soft white card */
    .fa-msg.user .fa-bubble { max-width:78%; background:var(--surface); border:1px solid var(--n-200);
      border-radius:18px 18px 6px 18px; padding:11px 16px; font-size:13.5px; line-height:1.55;
      color:var(--ink); box-shadow:0 4px 16px -10px rgba(10,15,13,.22); }
    [dir="rtl"] .fa-msg.user .fa-bubble { border-radius:18px 18px 18px 6px; }
    .fa-bubble b { font-weight:600; color:var(--riad); }
    .fa-bubble i { color:var(--n-500); }

    /* stat cards */
    .fa-stats { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:16px; }
    .fa-stat { background:var(--surface); border:1px solid var(--n-200); border-radius:14px; padding:12px 14px;
      transition:border-color 150ms; }
    .fa-stat:hover { border-color:var(--n-300); }
    .fa-stat .l { font-size:11px; letter-spacing:.085em; text-transform:uppercase; color:var(--n-500); font-weight:600; }
    .fa-stat .v { font-size:18.5px; font-weight:600; margin-top:5px; color:var(--ink);
      font-variant-numeric:tabular-nums; letter-spacing:-.012em; }
    .fa-stat .h { font-size:11px; color:var(--n-500); margin-top:3px; line-height:1.4; }

    /* verdict */
    .fa-verdict { margin-top:14px; padding:12px 14px; border-radius:13px; font-size:12.5px;
      font-weight:500; line-height:1.5; }
    .fa-verdict.good { background:rgba(11,110,79,.08); color:var(--atlas); }
    .fa-verdict.warn { background:rgba(176,124,0,.11); color:#8a6200; }
    .fa-verdict.bad  { background:rgba(193,58,48,.10); color:#b3392f; }
    .fa-note { margin-top:11px; font-size:11.5px; color:var(--n-500); line-height:1.5; }
    /* La provenance : établissement · période · module · volume · fraîcheur.
       Discrète par construction · elle ne s'adresse pas au commerçant tous les
       jours, elle sert le jour où deux surfaces annoncent deux chiffres. */
    .fa-meta { margin-top:9px; font-size:11px; color:var(--n-500); opacity:.8;
      letter-spacing:.015em; line-height:1.45; }
    .fa-evidence { display:flex; flex-wrap:wrap; gap:6px; margin-top:11px; }
    .fa-evidence-chip { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--n-200);
      border-radius:999px; background:var(--paper-soft); color:var(--n-600); padding:5px 9px;
      font-size:11px; line-height:1.2; font-weight:550; }
    button.fa-evidence-chip { cursor:pointer; font-family:inherit; }
    button.fa-evidence-chip:hover { color:var(--atlas); border-color:rgba(11,110,79,.35); }

    /* suggestion chips */
    .fa-follow { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
    .fa-follow button { font-size:12px; font-weight:450; padding:8px 14px; border-radius:999px;
      border:1px solid var(--n-200); background:var(--surface); color:var(--ink); cursor:pointer;
      transition:transform 160ms var(--fa-ease), border-color 160ms, color 160ms, box-shadow 160ms; }
    .fa-follow button:hover { border-color:var(--atlas); color:var(--atlas); transform:translateY(-1px);
      box-shadow:0 8px 18px -12px rgba(11,110,79,.55); }

    /* typing */
    .fa-typing { display:flex; gap:4px; padding:6px 2px; }
    .fa-typing i { width:6px; height:6px; border-radius:50%; background:var(--n-400); animation:fa-bounce 1.1s infinite; }
    .fa-typing i:nth-child(2){ animation-delay:.15s; } .fa-typing i:nth-child(3){ animation-delay:.3s; }
    @keyframes fa-bounce { 0%,60%,100%{ transform:translateY(0); opacity:.4; } 30%{ transform:translateY(-5px); opacity:1; } }

    /* dock */
    .fa-dock { border-top:1px solid var(--n-200); background:var(--paper);
      padding:15px clamp(20px,8%,120px) 19px; }
    .fa-dock-in { max-width:730px; margin:0 auto; }
    .fa-inputwrap { display:flex; align-items:center; gap:10px; background:var(--surface,#fff);
      border:1.5px solid var(--n-300,#E0DFDB); border-radius:999px; padding:6px 8px 6px 20px; min-height:52px; box-sizing:border-box;
      box-shadow:0 4px 20px -2px rgba(10,15,13,.06), 0 1px 3px rgba(10,15,13,.04);
      transition:border-color 180ms ease, box-shadow 180ms ease, background-color 180ms ease; }
    .fa-inputwrap:focus-within { border-color:var(--atlas,#0B6E4F); background:#fff;
      box-shadow:0 6px 24px -4px rgba(11,110,79,.18), 0 0 0 3px rgba(11,110,79,.12); }
    .fa-input { flex:1; min-width:0; resize:none; border:none !important; outline:none !important;
      box-shadow:none !important; background:transparent !important; background-color:transparent !important;
      -webkit-appearance:none; appearance:none; font:inherit; font-size:15px; line-height:22px;
      padding:0; margin:0 !important; height:22px; min-height:22px; max-height:140px; color:var(--ink,#0A0F0D);
      box-sizing:border-box; display:block; align-self:center; }
    .fa-input::placeholder { color:var(--n-500,#8A948F); font-size:14.5px; opacity:.85; letter-spacing:-.01em; line-height:22px; }
    .fa-send { width:38px; height:38px; min-width:38px; min-height:38px; border-radius:50%; border:none; flex-shrink:0; cursor:pointer;
      background:var(--atlas,#0B6E4F); color:#fff; display:inline-flex; align-items:center; justify-content:center;
      padding:0; margin:0; box-shadow:0 2px 8px rgba(11,110,79,.28);
      transition:transform 150ms cubic-bezier(.34,1.56,.64,1), background 150ms ease, box-shadow 150ms ease; }
    .fa-send:hover { background:var(--riad,#053B2C); transform:scale(1.06); box-shadow:0 4px 14px rgba(11,110,79,.38); }
    .fa-send:active { transform:scale(.92); box-shadow:0 1px 4px rgba(11,110,79,.2); }
    .fa-send svg { width:17px; height:17px; display:block; margin-inline-start:1px; }
    [dir="rtl"] .fa-send svg { transform:scaleX(-1); margin-inline-start:-1px; }
    [dir="rtl"] .fa-inputwrap { padding:6px 18px 6px 6px; }
    .fa-toolbar { display:flex; align-items:center; justify-content:space-between; margin-top:11px; padding:0 4px; }
    .fa-tool { display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:500;
      color:var(--n-600); background:var(--surface); border:1px solid var(--n-200); border-radius:999px;
      padding:7px 14px; cursor:pointer; transition: transform 150ms var(--fa-ease), opacity 150ms var(--fa-ease), background-color 150ms var(--fa-ease), border-color 150ms var(--fa-ease), color 150ms var(--fa-ease), box-shadow 150ms var(--fa-ease); }
    .fa-tool:hover { border-color: var(--n-400); color:var(--ink); transform:translateY(-1px); }
    .fa-tool.on { background:var(--atlas); border-color:var(--atlas); color:#fff; }
    .fa-tool svg { width:14px; height:14px; }
    .fa-hint { font-size:11px; color: var(--n-500); }

    /* calculator · hidden until toggled */
    .fa-keypad { display:none; }
    .fa-keypad.open { display:block; animation:fa-kp-in 300ms var(--ease-out,cubic-bezier(.32,.72,0,1)) both; }
    @keyframes fa-kp-in { from{ opacity:0; transform:translateY(18px); } to{ opacity:1; transform:none; } }
    .fa-keypad-card { background:var(--surface); border:1px solid var(--n-200); border-radius:22px; padding:14px;
      margin-bottom:14px; box-shadow:0 18px 44px -26px rgba(10,15,13,.35); }
    .fa-kpdisplay { background: var(--inverse-surface); color:#fff; border-radius:14px; padding:16px 18px;
      text-align:right; direction:ltr;
      font-family:var(--mono); font-size:25px; letter-spacing:.02em; overflow:hidden; white-space:nowrap; }
    .fa-kpgrid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:11px; direction:ltr; }
    .fa-kpgrid button { padding:15px 0; border-radius:14px; border:1px solid var(--n-200);
      background:var(--paper-soft); font-size:16px; font-family:var(--mono); color:var(--ink);
      cursor:pointer; transition:transform 90ms, background 130ms; }
    .fa-kpgrid button:hover { background:var(--n-100); }
    .fa-kpgrid button:active { transform:scale(.94); }
    .fa-kpgrid button.op { color:var(--atlas); font-weight:600; }
    .fa-kpgrid button.eq { background:var(--atlas); color:#fff; border-color:var(--atlas);
      grid-column:span 2; font-weight:600; }
    .fa-kpgrid button.eq:hover { background:var(--riad); }
    .fa-kp-use { display:block; margin-top:10px; width:100%; padding:11px 12px;
      border-radius:13px; border:0; background:var(--atlas); color:#fff;
      font:inherit; font-size:12.5px; font-weight:600; cursor:pointer;
      transition:background 130ms, transform 90ms; }
    .fa-kp-use[hidden] { display:none; }
    .fa-kp-use:hover { background:var(--riad); }
    .fa-kp-use:active { transform:scale(.97); }

    /* context rail */
    .fa-context { width:312px; flex-shrink:0; border-inline-start:1px solid var(--n-200);
      background:var(--paper); padding:28px 22px; overflow-y:auto; }
    .fa-ctx-eyebrow { font-size:11px; font-weight:600; letter-spacing:.15em; text-transform:uppercase; color:var(--n-500); }
    .fa-ctx-biz { font-size:14.5px; font-weight:600; color:var(--ink); margin-top:5px; line-height:1.2; }
    .fa-ctx-sub { font-size:11px; color:var(--n-500); margin-top:3px; }
    .fa-ctx-group { margin-top:6px; }
    .fa-ctx-gh { display:flex; justify-content:space-between; align-items:baseline; gap:8px;
      font-size:11px; font-weight:600; letter-spacing:.11em; text-transform:uppercase; color:var(--n-500);
      margin:18px 0 5px; padding:0 10px; }
    .fa-ctx-gh .tot { color:var(--atlas); letter-spacing:.02em; }
    .fa-ctx-item { display:flex; justify-content:space-between; align-items:baseline; gap:12px; width:100%;
      padding:9px 10px; border:none; background:transparent; border-radius:10px; cursor:pointer;
      text-align:start; font:inherit; transition:background 130ms var(--fa-ease); }
    .fa-ctx-item:hover { background:var(--paper-soft); }
    .fa-ctx-item .k { font-size:12px; color:var(--n-600); }
    .fa-ctx-item .v { font-size:12.5px; font-weight:600; color:var(--ink);
      font-variant-numeric:tabular-nums; text-align:end; white-space:nowrap; }
    .fa-ctx-item.fa-flash { animation:fa-flash-kf 540ms var(--fa-ease); }
    @keyframes fa-flash-kf { 0%{ background:rgba(11,110,79,.20); } 100%{ background:transparent; } }
    .fa-ctx-net { margin-top:18px; padding:16px 17px; border-radius:17px; color:#fff; width:100%;
      text-align:start; border:none; cursor:pointer;
      background:linear-gradient(145deg,var(--atlas),var(--riad)); box-shadow:0 16px 34px -20px rgba(11,110,79,.65);
      transition:transform 160ms var(--fa-ease); }
    .fa-ctx-net:hover { transform:translateY(-2px); }
    .fa-ctx-net.fa-flash { animation:fa-flash-net 540ms ease; }
    @keyframes fa-flash-net { 0%{ filter:brightness(1.4); } 100%{ filter:brightness(1); } }
    .fa-ctx-net .k { font-size:11px; letter-spacing:.1em; text-transform:uppercase; opacity:.82; }
    .fa-ctx-net .v { font-size:23px; font-weight:600; margin-top:6px; font-variant-numeric:tabular-nums; letter-spacing:-.01em; }
    .fa-ctx-net .s { font-size:11.5px; opacity:.82; margin-top:2px; }
    .fa-ctx-note { margin-top:20px; font-size:11.5px; color:var(--n-500); line-height:1.55; }
    .fa-ctx-trust { margin-top:13px; display:flex; gap:7px; align-items:flex-start; font-size:11px; color:var(--n-500); line-height:1.45; }
    .fa-ctx-trust svg { width:13px; height:13px; color:var(--atlas); flex-shrink:0; margin-top:1px; }
    .fa-ctx-mode { margin-top:8px; background:none; border:1px solid var(--n-200); border-radius:999px; padding:4px 10px; font:inherit; font-size:11px; color:var(--atlas); cursor:pointer; }
    .fa-ctx-mode:hover { border-color:var(--atlas); }
    @media (max-width:920px) { .fa-context { display:none; } }

    /* ─── empty-state hero · the first screen, before any conversation ─── */
    .fa-hero { display:flex; flex-direction:column; }
    .fa-hero-mark { width:46px; height:46px; border-radius:50%; display:flex; align-items:center;
      justify-content:center; background:linear-gradient(150deg,var(--atlas),var(--riad)); color:var(--mint);
      box-shadow:0 8px 22px -8px rgba(11,110,79,.6); }
    .fa-hero-h { font-family:var(--sans); font-size:32px; font-weight:650; letter-spacing:-0.03em; color:var(--ink); margin:17px 0 0; line-height:1.15; }
    .fa-hero-p { font-size:14px; color:var(--n-600); line-height:1.62; margin-top:9px; max-width:540px; }
    .fa-hero-cards { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:11px; margin-top:24px; }
    .fa-hero-card { display:flex; flex-direction:column; align-items:flex-start; text-align:start;
      background:var(--surface); border:1px solid var(--n-200); border-radius:16px; padding:15px 14px; cursor:pointer;
      font:inherit; transition:transform 160ms var(--fa-ease), border-color 160ms, box-shadow 160ms;
      box-shadow:0 1px 2px rgba(10,15,13,.04), 0 18px 32px -26px rgba(10,15,13,.24); }
    .fa-hero-card:hover { border-color:var(--atlas); transform:translateY(-2px);
      box-shadow:0 16px 30px -18px rgba(11,110,79,.42); }
    .fa-hero-card:active { transform:scale(.98); }
    .fa-hero-card .ic { width:32px; height:32px; border-radius:10px; display:flex; align-items:center;
      justify-content:center; background:var(--paper-soft); color:var(--atlas); margin-bottom:12px; }
    .fa-hero-card .ic svg { width:17px; height:17px; }
    .fa-hero-card .t { font-size:13px; font-weight:600; color:var(--ink); }
    .fa-hero-card .s { font-size:11.5px; color:var(--n-500); margin-top:3px; line-height:1.4; }
    .fa-hero-insight { display:flex; gap:11px; align-items:flex-start; margin-top:13px;
      padding:14px 16px; border-radius:15px; background:var(--paper-soft); border:1px solid var(--n-200);
      font-size:12.5px; color:var(--n-600); line-height:1.55; }
    .fa-hero-insight svg { width:16px; height:16px; color:var(--atlas); flex-shrink:0; margin-top:1px; }
    .fa-hero-insight b { color:var(--atlas); font-weight:600; }
    @media (max-width:560px) { .fa-hero-cards { grid-template-columns:1fr; } }

    /* ─── curated context rail · 4 KPIs, a cost split, the rest folded away ─── */
    .fa-ctx-kpis { margin-top:20px; }
    .fa-ctx-kpi { display:flex; justify-content:space-between; align-items:baseline; gap:12px; width:100%;
      border:0; background:transparent; padding:12px 8px; border-radius:11px; cursor:pointer;
      text-align:start; font:inherit; transition:background 130ms var(--fa-ease); }
    .fa-ctx-kpi + .fa-ctx-kpi { border-top:1px solid var(--n-200); }
    .fa-ctx-kpi:hover { background:var(--paper-soft); }
    .fa-ctx-kpi.fa-flash { animation:fa-flash-kf 540ms var(--fa-ease); }
    .fa-ctx-kpi .k { font-size:11.5px; color:var(--n-600); }
    .fa-ctx-kpi .v { font-size:15px; font-weight:600; color:var(--ink); white-space:nowrap; text-align:end;
      font-variant-numeric:tabular-nums; }
    .fa-ctx-kpi.hl .v { color:var(--atlas); }
    .fa-ctx-viz { margin-top:20px; padding-top:18px; border-top:1px solid var(--n-200); }
    .fa-ctx-viz-h { display:flex; justify-content:space-between; align-items:baseline;
      font-size:11px; font-weight:600; letter-spacing:.11em; text-transform:uppercase; color:var(--n-500); }
    .fa-ctx-viz-h .t { color:var(--atlas); letter-spacing:.02em; }
    .fa-ctx-bar { display:flex; height:10px; border-radius:999px; overflow:hidden; margin-top:10px; gap:2px; }
    .fa-ctx-bar span { display:block; height:100%; }
    .fa-ctx-leg { display:flex; flex-wrap:wrap; gap:8px 14px; margin-top:11px; }
    .fa-ctx-leg .li { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--n-600); }
    .fa-ctx-leg .li i { width:8px; height:8px; border-radius:3px; flex-shrink:0; }
    .fa-ctx-more { width:100%; margin-top:18px; font:inherit; font-size:12px; font-weight:500;
      color:var(--n-600); background:transparent; border:1px solid var(--n-200); border-radius:11px;
      padding:10px; cursor:pointer; transition: transform 140ms, opacity 140ms, background-color 140ms, border-color 140ms, color 140ms, box-shadow 140ms; }
    .fa-ctx-more:hover { border-color: var(--n-400); color:var(--ink); }
    .fa-ctx-detail[hidden] { display:none; }

    /* in-browser LLM */
    .fa-llm-btn { font-size:13px; font-weight:600; padding:11px 19px; border-radius:999px; border:none;
      background:var(--atlas); color:#fff; cursor:pointer; transition:transform 150ms var(--fa-ease), background 150ms;
      box-shadow:0 10px 24px -12px rgba(11,110,79,.6); }
    .fa-llm-btn:hover { background:var(--riad); transform:translateY(-1px); }
    .fa-llm-btn[data-fa-cloud-no] { background:transparent; color:var(--atlas); box-shadow:inset 0 0 0 1.5px var(--atlas); }
    .fa-llm-btn[data-fa-cloud-no]:hover { background:rgba(11,110,79,.08); color:var(--riad); }
    .fa-rate { background:none; border:1px solid var(--n-200); border-radius:999px; padding:3px 9px;
               font-size:13px; cursor:pointer; line-height:1.4; opacity:0.55; transition:opacity 140ms, border-color 140ms; }
    .fa-rate:hover { opacity:1; border-color:var(--atlas); }
    .fa-rated { opacity:0.75; font-size:13px; }
    .fa-llm-prog { height:8px; border-radius:999px; background:var(--n-200); overflow:hidden; margin:13px 0 8px; }
    .fa-llm-bar { height:100%; width:0%; border-radius:999px;
      background:linear-gradient(90deg,var(--atlas),var(--mint)); transition:width 240ms ease; }
    .fa-llm-ptxt { font-size:11.5px; color:var(--n-500); }
    [data-fa-stream] { white-space:pre-wrap; }

    /* ─── Dark theme · flat, contour-free, off-white (ChatGPT-style) ──────
     * In dark mode the assistant drops every light card, border and bright
     * accent · surfaces sit on the flat --paper tones, text is off-white,
     * nothing is outlined. */
    html[data-theme="dark"] .fa-msg.user .fa-bubble {
      background:var(--paper-soft); border:none; box-shadow:none; }
    html[data-theme="dark"] .fa-bubble b { color:var(--ink); }
    html[data-theme="dark"] .fa-avatar { background:var(--paper-muted); box-shadow:none; }
    html[data-theme="dark"] .fa-avatar-ico { filter:brightness(0) invert(0.92); }
    html[data-theme="dark"] .fa-stat,
    html[data-theme="dark"] .fa-stat:hover { background:var(--paper-soft); border:none; }
    html[data-theme="dark"] .fa-follow button {
      background:var(--paper-soft); border:none; color:var(--ink); box-shadow:none; }
    html[data-theme="dark"] .fa-follow button:hover { background:var(--paper-muted); color:var(--ink); }
    html[data-theme="dark"] .fa-inputwrap { background:var(--paper-soft); border:1.5px solid rgba(255,255,255,.1); box-shadow:0 8px 32px rgba(0,0,0,.36); }
    html[data-theme="dark"] .fa-inputwrap:focus-within {
      background:var(--paper-muted); border-color:var(--mint,#3FB67A); box-shadow:0 8px 32px rgba(0,0,0,.45), 0 0 0 3px rgba(63,182,122,.18); }
    html[data-theme="dark"] .fa-send { background:var(--mint,#3FB67A); color:#0A0F0D; box-shadow:0 2px 10px rgba(63,182,122,.4); }
    html[data-theme="dark"] .fa-send:hover { background:#5ccfa0; transform:scale(1.06); box-shadow:0 4px 14px rgba(63,182,122,.55); }
    html[data-theme="dark"] .fa-tool { background:var(--paper-soft); border:none; color:var(--ink); }
    html[data-theme="dark"] .fa-tool:hover,
    html[data-theme="dark"] .fa-tool.on { background:var(--paper-muted); border:none; color:var(--ink); }
    html[data-theme="dark"] .fa-keypad-card { background:var(--paper-soft); border:none; box-shadow:none; }
    html[data-theme="dark"] .fa-kpdisplay { background:var(--paper-muted); color:var(--ink); }
    html[data-theme="dark"] .fa-kpgrid button { background:var(--paper-muted); border:none; }
    html[data-theme="dark"] .fa-kpgrid button.op { color:var(--ink); }
    html[data-theme="dark"] .fa-kpgrid button.eq { background:var(--n-200); border:none; color:var(--ink); }
    html[data-theme="dark"] .fa-context { background:var(--paper-soft); border-inline-start:none; }
    html[data-theme="dark"] .fa-ctx-eyebrow { color:var(--n-500); }
    html[data-theme="dark"] .fa-ctx-gh .tot { color:var(--ink); }
    html[data-theme="dark"] .fa-ctx-item:hover { background:var(--paper-muted); }
    html[data-theme="dark"] .fa-ctx-net {
      background:var(--paper-muted); border:none; box-shadow:none; color:var(--ink); }
    html[data-theme="dark"] .fa-ctx-trust svg { color:var(--n-500); }
    html[data-theme="dark"] .fa-llm-btn {
      background:var(--paper-muted); color:var(--ink); box-shadow:none; }
    html[data-theme="dark"] .fa-llm-btn:hover { background:var(--n-200); }
    html[data-theme="dark"] .fa-llm-btn[data-fa-cloud-no] { background:transparent; color:var(--ink-on-dark, #F7F5F0); box-shadow:inset 0 0 0 1.5px currentColor; }
    html[data-theme="dark"] .fa-drawer :focus-visible { outline-color:var(--n-500); }
    `;
    document.head.appendChild(s);
  }
function replyHtml(r) {
    let h = `<div>${r.text}</div>`;
    if (r.stats && r.stats.length) {
      h += '<div class="fa-stats">' + r.stats.map((s) =>
        `<div class="fa-stat"><div class="l">${s.l}</div><div class="v">${s.v}</div>${s.h ? `<div class="h">${s.h}</div>` : ''}</div>`
      ).join('') + '</div>';
    }
    if (r.verdict) h += `<div class="fa-verdict ${r.verdict.tone}">${r.verdict.text}</div>`;
    if (r.note) h += `<div class="fa-note">${r.note}</div>`;
    if (r.meta) h += `<div class="fa-evidence"><span class="fa-evidence-chip">${__state.escHtml(r.meta)}</span></div>`;
    if (r.follow && r.follow.length) {
      h += '<div class="fa-follow">' + r.follow.map((f) =>
        `<button data-fa-follow="${__state.escAttr(f)}">${f}</button>`).join('') + '</div>';
    }
    if (r.open && r.open.length) {
      h += '<div class="fa-follow">' + r.open.map((o) =>
        `<button class="fa-llm-btn" data-fa-open="${__state.escAttr(o.handler)}">${o.label}</button>`).join('') + '</div>';
    }
    /* Une proposition, pas une exécution : le bouton porte l'ordre, et rien ne
       part avant que le commerçant ne clique dessus. La phrase qu'il a dite
       voyage avec, parce que le journal côté serveur doit pouvoir répondre à
       « pourquoi cette commande a-t-elle bougé ». */
    if (r.run) {
      h += '<div class="fa-follow"><button class="fa-llm-btn" data-fa-run="' + __state.escAttr(r.run.action)
        + '" data-fa-status="' + __state.escAttr(r.run.status) + '" data-fa-number="' + __state.escAttr(r.run.number)
        + '" data-fa-said="' + __state.escAttr(r.run.said || '') + '">' + r.run.label + '</button></div>';
    }
    return h;
  }
function open(prefill) {
    if (!window.Kiwi || !window.Kiwi.drawer) return;
    __state.L = __state.getLang();
    __state.injectCss();
    __state.syncProfile();  // build the profile for whatever venue is active
    const u = __state.tr().ui;
    const dynamicUi = __state.assistantUiCopy();

    // Every fact the agent knows — grouped, each row click-to-insert.
    const ctxItem = (k, v) =>
      `<button class="fa-ctx-item" type="button" data-fa-fact="${__state.escAttr(`${k} : ${v}`)}"><span class="k">${k}</span><span class="v">${v}</span></button>`;
    const ctxGroup = (title, items, total) =>
      `<div class="fa-ctx-group"><div class="fa-ctx-gh"><span>${title}</span>${total ? `<span class="tot">${total}</span>` : ''}</div>${items.map(([k, v]) => ctxItem(k, v)).join('')}</div>`;
    /* The context rail — full financial panel for Café Atlas, or a clean
     * "new venue" panel (real recorded sales only) for a custom venue. */
    let asideHtml;
    if (__state.B.partial) {
      const p = __state.nv();
      const rows = __state.B.revenue > 0
        ? [[p.revLabel, __state.fmtMad(__state.B.revenue)], [p.ordLabel, __state.fmt(__state.B.ordersPerMonth)], [p.basketLabel, __state.fmtMad(__state.B.avgBasket)]]
        : [];
      asideHtml =
        `<div class="fa-ctx-eyebrow">${u.ctxEyebrow}</div>` +
        `<div class="fa-ctx-biz">${__state.escHtml(__state.B.name)}</div>` +
        `<div class="fa-ctx-sub">${u.ctxSub}</div>` +
        (rows.length
          ? `<div class="fa-ctx-kpis">${rows.map(([k, v]) =>
              `<button class="fa-ctx-kpi" type="button" data-fa-fact="${__state.escAttr(k + ' : ' + v)}"><span class="k">${k}</span><span class="v">${v}</span></button>`).join('')}</div>`
          : '') +
        (__state.salesWindowEvidence(__state.B) ? `<div class="fa-ctx-detail" style="display:block;font-size:12.5px;color:var(--n-500);line-height:1.55;">${__state.escHtml(__state.salesWindowEvidence(__state.B))}</div>` : '') +
        `<div class="fa-ctx-detail" style="display:block;font-size:12.5px;color:var(--n-500);line-height:1.55;">${p.railEmpty}</div>` +
        `<div class="fa-ctx-trust" data-fa-trust>${__state.ICON.lock}<span data-fa-trust-text>${dynamicUi.privacy}</span></div>` +
        `<button type="button" class="fa-ctx-mode" data-fa-mode-toggle>${dynamicUi.modeToggle}</button>` +
        autoActMarkup();
    } else {
      const f = __state.tr().facts;
      const opexItems = Object.entries(__state.B.opex).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => [__state.tr().opex[k] || k, __state.fmtMad(v)]);
      const ctxRail =
        ctxGroup(u.gActivity, [
          [f.revenue, __state.fmtMad(__state.B.revenue)],
          [f.revPerDay, __state.fmtMad(__state.B.dailyRev)],
          [f.mtdRev, `${__state.fmtMad(__state.B.mtdRevenue)} · ${__state.B.mtdDays} ${u.days}`],
          [f.ordersMonth, __state.fmt(__state.B.ordersPerMonth)],
          [f.ordersDay, __state.fmt(__state.B.ordersPerDay)],
          [f.basket, __state.fmtMad(__state.B.avgBasket)],
        ]) +
        ctxGroup(u.gProfit, [
          [f.grossMargin, `${__state.fmtMad(__state.B.grossProfit)} · ${__state.fmt1(__state.B.grossMargin)} %`],
          [f.cogs, `${__state.fmtMad(__state.B.cogs)} · ${__state.fmt1(100 - __state.B.grossMargin)} %`],
          [f.profitPerOrder, __state.fmtMad(__state.B.netPerOrder)],
          [f.breakEven, `${__state.fmtMad(__state.B.breakEvenRev)} ${u.perMonth}`],
        ]) +
        ctxGroup(u.gFixed, opexItems, `${__state.fmtMad(__state.B.totalOpex)} ${u.perMonth}`) +
        ctxGroup(u.gCash, [
          [f.cashAvail, __state.fmtMad(__state.B.cashBuffer)],
          [f.headcount, u.employees(__state.B.staffCount)],
        ]);
      const netFact = `${f.netProfit} : ${__state.fmtMad(__state.B.netProfit)} · ${f.netMarginLine(__state.fmt1(__state.B.netMargin))}`;
      const kpiFact = (k, v) => `${k} : ${v}`;
      const coreKpis = [
        { k: f.revenue, v: __state.fmtMad(__state.B.revenue), fact: kpiFact(f.revenue, __state.fmtMad(__state.B.revenue)) },
        { k: f.grossMargin, v: __state.fmtMad(__state.B.grossProfit), fact: kpiFact(f.grossMargin, `${__state.fmtMad(__state.B.grossProfit)} · ${__state.fmt1(__state.B.grossMargin)} %`) },
        { k: f.netProfit, v: __state.fmtMad(__state.B.netProfit), fact: netFact, hl: true },
        { k: f.cashAvail, v: __state.fmtMad(__state.B.cashBuffer), fact: kpiFact(f.cashAvail, __state.fmtMad(__state.B.cashBuffer)) },
      ];
      const opexRaw = Object.entries(__state.B.opex).sort((a, b) => b[1] - a[1]);
      const vizColors = ['var(--atlas)', '#46A878', '#7DF2B0', '#cdd6d0'];
      const vizParts = opexRaw.slice(0, 3).map(([k, v], i) => ({ k: __state.tr().opex[k] || k, v, c: vizColors[i] }));
      vizParts.push({ k: __state.HL().autres, v: opexRaw.slice(3).reduce((s, r) => s + r[1], 0), c: vizColors[3] });
      asideHtml =
        `<div class="fa-ctx-eyebrow">${u.ctxEyebrow}</div>` +
        `<div class="fa-ctx-biz">${__state.escHtml(__state.B.name)}</div>` +
        `<div class="fa-ctx-sub">${u.ctxSub}</div>` +
        `<div class="fa-ctx-kpis">${coreKpis.map((c) => `<button class="fa-ctx-kpi${c.hl ? ' hl' : ''}" type="button" data-fa-fact="${__state.escAttr(c.fact)}"><span class="k">${c.k}</span><span class="v">${c.v}</span></button>`).join('')}</div>` +
        `<div class="fa-ctx-viz">` +
          `<div class="fa-ctx-viz-h"><span>${u.gFixed}</span><span class="t">${__state.fmtMad(__state.B.totalOpex)}</span></div>` +
          `<div class="fa-ctx-bar">${vizParts.map((p) => `<span style="width:${(p.v / __state.B.totalOpex * 100).toFixed(1)}%;background:${p.c};"></span>`).join('')}</div>` +
          `<div class="fa-ctx-leg">${vizParts.map((p) => `<span class="li"><i style="background:${p.c};"></i>${p.k}</span>`).join('')}</div>` +
        `</div>` +
        `<button class="fa-ctx-more" type="button" data-fa-ctx-more>${__state.HL().more}</button>` +
        `<div class="fa-ctx-detail" data-fa-detail hidden>${ctxRail}</div>` +
        `<div class="fa-ctx-trust" data-fa-trust>${__state.ICON.lock}<span data-fa-trust-text>${dynamicUi.privacy}</span></div>` +
        `<button type="button" class="fa-ctx-mode" data-fa-mode-toggle>${dynamicUi.modeToggle}</button>` +
        autoActMarkup();
    }

    const body = `
      <div class="fa">
        <div class="fa-main">
          <div class="fa-thread" tabindex="0">
            <div class="fa-thread-in" data-fa-thread></div>
          </div>
          <div class="fa-dock">
            <div class="fa-dock-in">
              <div class="fa-keypad" data-fa-keypad>
                <div class="fa-keypad-card">
                  <div class="fa-kpdisplay" data-fa-kpd>0</div>
                  <div class="fa-kpgrid">
                    ${['C','⌫','%','÷','7','8','9','×','4','5','6','−','1','2','3','+','0','.']
                      .map((k) => `<button class="${/[÷×−+%]/.test(k) ? 'op' : ''}" data-fa-key="${k}">${k}</button>`).join('')}
                    <button class="eq" data-fa-key="=">=</button>
                  </div>
                  <button class="fa-kp-use" data-fa-kp-use type="button" hidden>${u.kpUse}</button>
                </div>
              </div>
              <div class="fa-inputwrap">
                <textarea class="fa-input" data-fa-input rows="1"
                  aria-label="${__state.escAttr(u.placeholder)}"
                  placeholder="${__state.escAttr(window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? u.placeholder.split(/[,،]/)[0] + '…' : u.placeholder)}"></textarea>
                <button data-activation=write class="fa-send" data-fa-send type="button" title="${__state.escAttr(u.send)}" aria-label="${__state.escAttr(u.send)}">${__state.ICON.send}</button>
              </div>
              <div class="fa-toolbar">
                <button class="fa-tool" data-fa-keypad-toggle type="button">${__state.ICON.keypad}<span>${u.calc}</span></button>
                <span class="fa-hint">${u.enterToSend}</span>
              </div>
            </div>
          </div>
        </div>
        <aside class="fa-context">${asideHtml}</aside>
      </div>`;

    const res = window.Kiwi.drawer({
      title: dynamicUi.title,
      subtitle: (() => {
        try {
          return window.KiwiFeatureGuide && window.KiwiFeatureGuide.assistantSubtitle
            ? window.KiwiFeatureGuide.assistantSubtitle(__state.L, __state.B.trade)
            : u.subtitle;
        } catch (_) { return u.subtitle; }
      })(),
      body,
      fullpage: true,
    });
    res.el.classList.add('fa-drawer');

    const root = res.el;
    const thread = root.querySelector('[data-fa-thread]');
    const threadScroll = root.querySelector('.fa-thread');
    const input = root.querySelector('[data-fa-input]');
    const keypad = root.querySelector('[data-fa-keypad]');
    const kpd = root.querySelector('[data-fa-kpd]');

    const scrollDown = () => { threadScroll.scrollTop = threadScroll.scrollHeight; };

    function pushUser(text) {
      const m = document.createElement('div');
      m.className = 'fa-msg user';
      m.insertAdjacentHTML('beforeend', `<div class="fa-bubble"></div>`);
      m.querySelector('.fa-bubble').textContent = text;
      thread.appendChild(m);
      scrollDown();
    }
    function pushAgent(html) {
      const m = document.createElement('div');
      m.className = 'fa-msg agent';
      m.insertAdjacentHTML('beforeend',
        `<div class="fa-avatar">${__state.ICON.avatar}</div><div class="fa-bubble">${html}</div>`);
      thread.appendChild(m);
      scrollDown();
      return m;
    }
    function pushTyping() {
      const m = document.createElement('div');
      m.className = 'fa-msg agent';
      m.insertAdjacentHTML('beforeend',
        `<div class="fa-avatar">${__state.ICON.avatar}</div><div class="fa-bubble"><div class="fa-typing"><i></i><i></i><i></i></div></div>`);
      thread.appendChild(m);
      scrollDown();
      return m;
    }

    /* L'exécution vit ici, et pas dans le classifieur : `respond()` est
       synchrone et rend une carte tout de suite. Résoudre « la 12 » en
       identifiant demande un aller-retour réseau, et il ne doit avoir lieu
       qu'après le clic — sinon le simple fait de poser la question aurait déjà
       parlé au serveur. */
    async function runOperation(btn) {
      const o = __state.opCopy();
      const K = window.KiwiOperations;
      const wanted = btn.getAttribute('data-fa-status') || '';
      const number = Number(btn.getAttribute('data-fa-number')) || 0;
      const said = btn.getAttribute('data-fa-said') || '';
      btn.textContent = o.working;
      const typing = pushTyping();
      const done = (text) => { typing.remove(); pushAgent(__state.replyHtml({ text: text })); };
      if (!K || typeof K.agentRun !== 'function') { done(o.absent); return; }
      let out;
      try {
        const inbox = await K.orders({ open: true, limit: 120 });
        if (inbox && inbox.unavailable) { done(o.off); return; }
        const hit = ((inbox && inbox.orders) || []).filter((row) => Number(row.number) === number);
        if (!hit.length) { done(o.unknown(number)); return; }
        /* Deux tickets ouverts au même numéro ne devraient pas exister — la
           numérotation est hebdomadaire et par commerçant. Si cela arrive, on
           refuse plutôt que de tirer au sort. */
        if (hit.length > 1) { done(o.ambiguous(number)); return; }
        out = await K.agentRun('update-order-status', { orderId: hit[0].id, status: wanted }, said);
      } catch (error) {
        done(__state.opWhy(o, (error && error.code) || 'reseau', number));
        return;
      }
      const cmd = (out && out.command) || {};
      if (cmd.status === 'completed') { done(o.done(number, o.state[wanted] || wanted)); return; }
      if (cmd.status === 'queued-offline') { done(o.queued(number)); return; }
      done(__state.opWhy(o, cmd.lastError || cmd.status, number));
    }

    function ask(text) {
      const t = (text || '').trim();
      if (!t) return;
      const hero = thread.querySelector('[data-fa-hero]');
      if (hero) hero.remove();
      pushUser(t);
      const t0 = Date.now();
      const reply = __state.respond(t);
      /* No question text goes in — see the header of assets/ai-telemetry.js.
       * Route, provenance, tier, language, latency. That is enough to know
       * what is failing without keeping a log of what a merchant asks about
       * their own money. */
      logAi({
        route: __state.lastRouteKind,
        provenance: !reply ? 'model' : reply.refused ? 'refused' : __state.lastRouteKind === 'lookup' ? 'lookup' : 'deterministic',
        ms: Date.now() - t0,
        qLength: t.length,
      });
      if (reply) {
        /* Le moteur de décision et le modèle travaillent ENSEMBLE, pas l'un
         * après l'autre. Quand le nuage est accepté, le brouillon déterministe
         * s'affiche tout de suite — chiffres instantanés, calculés par notre
         * code — puis le modèle le reformule dans la même bulle, dans la
         * langue de la question, en tenant le fil de la conversation, et va
         * chercher par un outil ce que le brouillon n'a pas. Ses chiffres sont
         * vérifiés contre les faits du tour : ce qu'il ne tient ni du moteur
         * ni d'un outil est retiré. S'il échoue, le brouillon reste. Sans
         * consentement nuage : le brouillon, comme avant. Un refus ou une
         * réponse sur les livres d'un autre n'ont rien à gagner à une
         * reformulation : ils restent déterministes. */
        const collaborate = !reply.refused && !reply.run && __state.cloudAccepted() && window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal();
        if (collaborate) {
          const bubble = pushAgent(__state.replyHtml(reply));
          runLlm(t, { reply, bubble });
          return;
        }
        const typing = pushTyping();
        setTimeout(() => { typing.remove(); pushAgent(__state.replyHtml(reply)); }, 460 + Math.random() * 300);
        return;
      }
      routeToLlm(t);
    }

    function logAi(e) {
      try {
        if (!window.KiwiAiTelemetry) return;
        window.KiwiAiTelemetry.log(Object.assign({ tier: __state.accessTier(), lang: __state.L }, e));
      } catch (_) {}
    }

    /* Le panneau dit le mode courant ; on le repeint quand il change. */
    function refreshTrustLine() {
      const u = __state.assistantUiCopy();
      root.querySelectorAll('[data-fa-trust-text]').forEach((el) => { el.textContent = u.privacy; });
      root.querySelectorAll('[data-fa-mode-toggle]').forEach((el) => { el.textContent = u.modeToggle; });
      const ac = __state.ACTION_COPY[__state.L] || __state.ACTION_COPY.fr;
      root.querySelectorAll('[data-fa-auto-text]').forEach((el) => { el.textContent = __state.autoActOn() ? ac.autoOn : ac.autoOff; });
      root.querySelectorAll('[data-fa-auto-toggle]').forEach((el) => { el.textContent = __state.autoActOn() ? ac.autoToggleOn : ac.autoToggleOff; });
    }
    /* The switch is visible only to the owner after server AI consent. */
    function autoActMarkup() {
      if (__state.accessTier() !== 'owner' || !__state.cloudAccepted()) return '';
      const ac = __state.ACTION_COPY[__state.L] || __state.ACTION_COPY.fr;
      return `<div class="fa-ctx-trust" data-fa-auto>${__state.ICON.lock}<span data-fa-auto-text>${__state.autoActOn() ? ac.autoOn : ac.autoOff}</span></div>` +
        `<button type="button" class="fa-ctx-mode" data-fa-auto-toggle>${__state.autoActOn() ? ac.autoToggleOn : ac.autoToggleOff}</button>`;
    }

    /* Hors calculs et sans modèle : on le dit, avec la liste de ce qui
     * marche toujours — jamais un haussement d'épaules. */
    function deterministicOnly(why) {
      const m = __state.tr().llm;
      const lead = why === 'private' ? (window.KiwiNativePrivacy ? m.privateNative : m.privateLead)
        : why === 'auth' ? m.cloudAuth : m.unavailable;
      pushAgent(__state.replyHtml({
        text: lead + ' ' + m.unfitTail,
        follow: [__state.tr().chips.charges, __state.tr().chips.breakeven],
      }));
    }

    /* Le consentement, une fois. La question attend dans la file ; « oui »
     * l'envoie, « non » est gardé (mode privé) et se change dans le panneau. */
    function offerCloud(question) {
      const m = __state.tr().llm;
      __state.LLM.pending.push(question);
      pushAgent(
        `<div>${m.cloudLead}</div>
         <div class="fa-note" style="font-style:normal;">${m.cloudPrivacy}</div>
         <div class="fa-follow"><button data-activation=write type="button" class="fa-llm-btn" data-fa-cloud>${m.cloudActivate}</button>`
        + `<button type="button" class="fa-llm-btn" data-fa-cloud-no>${m.cloudDecline}</button></div>`);
    }

    async function acceptCloud() {
      __state.setCloud(true);
      refreshTrustLine();
      const queued = __state.LLM.pending.slice();
      __state.LLM.pending.length = 0;
      for (const q of queued) await runLlm(q);
    }

    function declineCloud() {
      __state.setCloud(false);
      refreshTrustLine();
      __state.LLM.pending.length = 0;
      deterministicOnly('private');
    }

    function routeToLlm(question) {
      /* Signed-out (the demo): the server answers 401 to every ask, so say so
       * once instead of asking for consent to a request that cannot succeed. */
      if (__state.LLM.needsSignIn) { deterministicOnly('auth'); return; }
      /* In the iOS app the system consent sheet (native-privacy.js) is THE
       * consent, asked before any byte leaves. A second in-chat card asking the
       * same thing was a double prompt, so ask the server and let the sheet gate it. */
      if (window.KiwiNativePrivacy) { runLlm(question); return; }
      if (__state.cloudDeclined()) { deterministicOnly('private'); return; }
      if (__state.cloudAccepted()) { runLlm(question); return; }
      offerCloud(question);
    }

    /* Le serveur rend du SSE sur HTTP ; on le ramène à un flux de bouts de
     * texte pour que découpage par phrase, redactUnsupported(), note de garde,
     * télémétrie, boutons d'avis et historique expurgé soient écrits UNE fois. */
    /* Premier tour : le modèle voit la question, les faits et la liste des
     * outils, et répond soit par des appels d'outils, soit directement (texte
     * entier, non streamé). Une réponse JSON, pas un flux. */
    async function cloudToolRound(messages) {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages, tools: __state.LLM_TOOLS, round: 'tools' }),
      });
      let j = null;
      try { j = await res.json(); } catch (_) { j = null; }
      if (!res.ok || !j || !j.ok) {
        const err = new Error('cloud:' + ((j && j.error) || res.status));
        /* The gate answers a missing session with an HTML page, not JSON. */
        err.kiwiCode = (j && j.error) || (res.status === 401 ? 'auth' : '');
        throw err;
      }
      return j;
    }
    async function cloudDeltas(messages) {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages, tools: __state.LLM_TOOLS, round: 'answer' }),
      });
      if (!res.ok || !res.body) {
        /* L'endpoint nomme sa panne — binding absent, quota du jour, session
         * expirée, modèle en échec. On la remonte telle quelle pour que
         * l'appelant puisse retomber sur le message d'avant plutôt que
         * d'afficher une erreur brute. */
        let code = '';
        try { const j = await res.json(); code = (j && j.error) || ''; } catch (_) {}
        if (!code && res.status === 401) code = 'auth';
        const err = new Error('cloud:' + (code || res.status));
        err.kiwiCode = code;
        throw err;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      return (async function* () {
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          /* Une lecture réseau peut couper une ligne SSE en deux : seules les
           * lignes complètes sortent du tampon. */
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (line.slice(0, 5) !== 'data:') continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const t = __state.llmChunkText(JSON.parse(payload));
              if (t) yield t;
            } catch (_) { /* trame partielle ou commentaire : on ignore */ }
          }
        }
        /* Un flux qui se termine sans saut de ligne final laisserait sa
         * dernière phrase dans le tampon. On la rend quand même. */
        const tail = buf.trim();
        if (tail.slice(0, 5) === 'data:') {
          const payload = tail.slice(5).trim();
          if (payload && payload !== '[DONE]') {
            try {
              const t = __state.llmChunkText(JSON.parse(payload));
              if (t) yield t;
            } catch (_) {}
          }
        }
      })();
    }

    /* Deux tours au plus. Tour 1 (JSON) : faits + outils, le modèle demande
     * des lectures ou répond. Tour 2 (flux) : les résultats d'outils sont
     * renvoyés, tool_choice 'none', le modèle rédige. Les résultats passent
     * par noteTurnFacts AVANT le rendu : le redacteur les connaît. */
    async function llmAnswerStream(messages) {
      const r1 = await cloudToolRound(messages);
      const calls = Array.isArray(r1.tool_calls) ? r1.tool_calls.slice(0, 4) : [];
      if (!calls.length) {
        const text = typeof r1.text === 'string' ? r1.text : '';
        return { deltas: (async function* () { if (text) yield text; })(), tools: 0 };
      }
      const results = [];
      for (const c of calls) {
        let args = {};
        try { args = typeof c.arguments === 'string' ? JSON.parse(c.arguments) : (c.arguments || {}); } catch (_) { args = {}; }
        const out = await __state.runTool(String(c.name || ''), args);
        __state.noteTurnFacts(out);
        __state.noteTurnEvidence(String(c.name || ''), args, out);
        results.push({ id: String(c.id || ''), name: String(c.name || ''), content: __state.toolResultText(out) });
      }
      const toolMsgs = [
        { role: 'assistant', content: '', tool_calls: calls.map((c) => ({ id: String(c.id || ''), type: 'function', function: { name: String(c.name || ''), arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments || {}) } })) },
        ...results.map((r) => ({ role: 'tool', tool_call_id: r.id, name: r.name, content: r.content })),
      ];
      return { deltas: await cloudDeltas([...messages, ...toolMsgs]), tools: calls.length };
    }

    async function runLlm(question, draft) {
      const tLlm = Date.now();
      const hasDraft = !!(draft && draft.bubble);
      const typing = hasDraft ? null : pushTyping();
      __state.clearTurnFacts();
      __state.llmHistory.push({ role: 'user', content: question });
      /* No `/no_think` suffix: that was Qwen3's switch and Qwen3.5 removed it
       * (its template is non-thinking unless enable_thinking:true is passed).
       * Appending it now would only pollute the system prompt. */
      const sys = __state.buildSystemPrompt(__state.detectQLang(question));
      const facts = hasDraft ? __state.draftFacts(draft.reply) : '';
      if (facts) __state.noteTurnFacts(facts);
      __state.LLM.proposals = [];
      const messages = [{ role: 'system', content: sys }, { role: 'system', content: __state.TOOLS_RULE }]
        .concat(facts ? [{ role: 'system', content: __state.FACTS_LEAD + facts }] : [])
        .concat(__state.llmHistory.slice(-8));
      try {
        const run = await llmAnswerStream(messages);
        const deltas = run.deltas;
        if (typing) typing.remove();
        __state.LLM.cancelled = false;
        let bubble, target, draftText = '';
        if (hasDraft) {
          /* Même bulle : le texte du brouillon est remplacé phrase par phrase,
           * les statistiques, boutons et pistes restent. Si rien n'arrive, le
           * brouillon est encore là. */
          bubble = draft.bubble;
          target = bubble.querySelector(':scope > div') || bubble;
          draftText = target.textContent;
        } else {
          bubble = pushAgent('<span data-fa-stream></span><div class="fa-follow" data-fa-stopwrap><button type="button" class="fa-llm-btn" data-fa-stop-llm>' + __state.tr().llm.stop + '</button></div>');
          target = bubble.querySelector('[data-fa-stream]');
        }
        let acc = '';
        /* Stream by SETTLED SENTENCE, not by token. The redactor works on whole
         * clauses — it has to, since "is this a hypothesis or a claim?" is only
         * answerable once the sentence exists. Rendering raw tokens would put
         * an invented figure on screen for the second between the token that
         * completes it and the token that ends the sentence, and a merchant
         * reading over the till does not get that second back. */
        const SETTLED = /[\s\S]*[.!?\n؟]/;
        let shown = 0;
        for await (const piece of deltas) {
          if (__state.LLM.cancelled) break;
          acc += piece;
          const m = __state.stripThink(acc).match(SETTLED);
          const settled = m ? m[0] : '';
          if (settled.length > shown) {
            shown = settled.length;
            if (target) target.textContent = __state.redactUnsupported(settled, __state.L).text;
            scrollDown();
          }
        }
        const stopWrap = bubble && bubble.querySelector('[data-fa-stopwrap]');
        if (stopWrap) stopWrap.remove();
        const clean = __state.stripThink(acc);
        /* The guardrail REMOVES what it cannot support (see the block above
         * redactUnsupported). redacted === -1 means the detector itself threw:
         * an answer we could not check is an answer we do not show. */
        const red = __state.redactUnsupported(clean, __state.L);
        if (target) {
          if (hasDraft && (red.redacted === -1 || !red.text.trim())) target.textContent = draftText;
          else target.textContent = red.redacted === -1 ? __state.tr().llm.runErr : red.text;
        }
        if (bubble && red.redacted > 0) {
          const note = document.createElement('div');
          note.className = 'fa-note';
          note.textContent = (__state.GUARD[__state.L] || __state.GUARD.fr)(red.redacted);
          bubble.appendChild(note);
        }
        /* Un taux légal a été cité. Kiwi n'est pas la source officielle d'un
         * barème qui bouge à chaque loi de finances : on le dit, une fois. */
        if (bubble && red.redacted !== -1 && red.caveat) {
          const cav = document.createElement('div');
          cav.className = 'fa-note';
          cav.textContent = red.caveat;
          bubble.appendChild(cav);
        }
        logAi({ route: hasDraft ? 'cloud+deterministic' : 'cloud', provenance: red.redacted === -1 ? 'error' : 'model', ms: Date.now() - tLlm, qLength: question.length, redacted: Math.max(0, red.redacted), tools: run.tools });
        /* Ce que le modèle a PROPOSÉ attend un doigt : un bouton par action,
         * avec le résumé exact, qui appelle le même confirm que le reste. */
        if (bubble && __state.LLM.proposals.length) {
          const ac = __state.ACTION_COPY[__state.L] || __state.ACTION_COPY.fr;
          __state.LLM.proposals.forEach((pr) => {
            const row = document.createElement('div');
            row.className = 'fa-follow';
            row.innerHTML = '<button type="button" class="fa-llm-btn" data-fa-confirm="' + __state.escAttr(pr.token) + '">' + ac.confirm + ' · ' + __state.escHtml(pr.summary || pr.action) + '</button>'
              + '<button type="button" class="fa-llm-btn" data-fa-confirm-no="' + __state.escAttr(pr.token) + '">' + ac.cancel + '</button>';
            bubble.appendChild(row);
          });
          __state.LLM.proposals = [];
        }
        if (bubble && __state.TURN_EVIDENCE.length) {
          const evidence = document.createElement('div');
          evidence.className = 'fa-evidence';
          __state.TURN_EVIDENCE.forEach((ev) => {
            const chip = document.createElement(ev.open ? 'button' : 'span');
            if (ev.open) { chip.type = 'button'; chip.setAttribute('data-fa-open', ev.open); }
            chip.className = 'fa-evidence-chip';
            chip.title = 'Source: ' + ev.source;
            chip.textContent = [ev.volume, ev.period, ev.source].filter(Boolean).join(' · ');
            evidence.appendChild(chip);
          });
          bubble.appendChild(evidence);
        }
        /* The merchant's own verdict — the only signal that says whether the
         * answer was any good. Two buttons, no free text, nothing transmitted. */
        if (bubble && red.redacted !== -1) {
          const rate = document.createElement('div');
          rate.className = 'fa-follow';
          rate.innerHTML = '<button type="button" class="fa-rate" data-fa-rate="up" aria-label="Utile"><i data-lucide="thumbs-up" width="17" height="17" aria-hidden="true"></i></button>'
            + '<button type="button" class="fa-rate" data-fa-rate="down" aria-label="Pas utile"><i data-lucide="thumbs-down" width="17" height="17" aria-hidden="true"></i></button>';
          bubble.appendChild(rate);
        }
        scrollDown();
        /* Store the REDACTED answer. Keeping the raw one would feed the
         * invented figure straight back into the next turn's context, where
         * the model would treat its own slip as established fact — and Qwen
         * guidance is to keep prior thinking content out of history anyway. */
        __state.llmHistory.push({ role: 'assistant', content: red.redacted === -1 ? '' : red.text });
      } catch (e) {
        if (typing) typing.remove();
        /* Avec un brouillon déterministe à l'écran, une panne du modèle ne
         * vaut pas un message : le commerçant a déjà sa réponse. */
        if (hasDraft) { __state.llmHistory.push({ role: 'assistant', content: __state.draftFacts(draft.reply).slice(0, 600) }); return; }
        /* La route serveur nomme sa panne. Binding absent, session expirée,
         * modèle en échec : le commerçant n'a pas à lire ça — il retrouve
         * simplement la réponse déterministe qu'il avait avant que cette route
         * existe. Le quota, lui, se dit : c'est temporaire et il repart demain. */
        const code = e && e.kiwiCode;
        try { console.warn('[kiwi-ai] server answer failed', e && e.name, e && e.message); } catch (_) {}
        if (e && e.name === 'NotAllowedError') { deterministicOnly('private'); return; }
        if (code === 'auth') __state.LLM.needsSignIn = true;
        if (code === 'quota') {
          pushAgent(__state.replyHtml({ text: __state.tr().llm.cloudQuota }));
        } else if (code === 'auth') {
          deterministicOnly('auth');
        } else if (code === 'unbound' || code === 'model' || code === 'messages' || code === 'body') {
          deterministicOnly('unavailable');
        } else {
          pushAgent(__state.replyHtml({ text: __state.tr().llm.runErr }));
        }
      }
    }

    // first screen — the empty-state hero, replaced by the conversation on first ask
    thread.insertAdjacentHTML('beforeend', __state.renderHero());
    __state.kitAsk = ask;
    try { window.dispatchEvent(new CustomEvent('kiwi:ai-home-model')); } catch (_) {}

    if (typeof prefill === 'string' && prefill.trim()) {
      setTimeout(() => ask(prefill.trim()), 360);
    }

    // ─── input wiring ───
    function send() {
      const v = input.value;
      input.value = '';
      input.style.height = 'auto';
      ask(v);
    }
    function insertFact(text, el) {
      const cur = input.value.trim();
      input.value = cur ? `${cur} · ${text}` : text;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 144) + 'px';
      input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {}
      if (el) { el.classList.remove('fa-flash'); void el.offsetWidth; el.classList.add('fa-flash'); }
    }
    root.querySelector('[data-fa-send]').addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    input.addEventListener('input', () => {
      input.style.height = '22px';
      if (input.scrollHeight > 24) {
        input.style.height = Math.min(input.scrollHeight, 130) + 'px';
      }
    });

    // ─── chips + follow-ups + facts (delegated) ───
    root.addEventListener('click', (e) => {
      const follow = e.target.closest('[data-fa-follow]');
      if (follow) { ask(follow.getAttribute('data-fa-follow')); return; }
      const openBtn = e.target.closest('[data-fa-open]');
      if (openBtn) {
        const handlerName = openBtn.getAttribute('data-fa-open');
        const fn = window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers[handlerName];
        if (typeof fn === 'function') fn();
        /* Take the merchant to the destination: close the assistant so the
         * page/drawer the handler opened is actually visible underneath. */
        const back = root.closest('.kiwi-drawer-backdrop');
        if (back && typeof back.__kiwiClose === 'function') back.__kiwiClose();
        /* For a page-switch (nav-*), re-assert the sidebar highlight after the
         * drawer-close's reset-to-home settles (~320 ms). */
        const navKey = handlerName.indexOf('nav-') === 0 ? handlerName.slice(4) : null;
        if (navKey) setTimeout(() => {
          const nav = document.querySelector('.sidebar nav');
          const link = nav && nav.querySelector('a[data-nav="' + navKey + '"]');
          if (link) { nav.querySelectorAll('a').forEach((a) => a.classList.remove('active')); link.classList.add('active'); }
        }, 360);
        return;
      }
      const runBtn = e.target.closest('[data-fa-run]');
      if (runBtn) {
        /* Un ordre ne part qu'une fois : le second clic ne doit pas rejouer la
           transition, même si le premier est encore en vol. */
        if (runBtn.disabled) return;
        runBtn.disabled = true;
        runOperation(runBtn);
        return;
      }
      if (e.target.closest('[data-fa-cloud]')) { acceptCloud(); return; }
      if (e.target.closest('[data-fa-cloud-no]')) { declineCloud(); return; }
      if (e.target.closest('[data-fa-mode-toggle]')) { __state.setCloud(!__state.cloudAccepted()); refreshTrustLine(); return; }
      if (e.target.closest('[data-fa-auto-toggle]')) { if (__state.accessTier() === 'owner') __state.setAutoAct(!__state.autoActOn()); refreshTrustLine(); return; }
      const confirmBtn = e.target.closest('[data-fa-confirm]');
      if (confirmBtn) {
        if (confirmBtn.disabled) return;
        const row = confirmBtn.parentElement; const token = confirmBtn.getAttribute('data-fa-confirm');
        const ac = __state.ACTION_COPY[__state.L] || __state.ACTION_COPY.fr;
        row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        const A = window.KiwiAgentActions;
        Promise.resolve().then(() => A && A.confirm ? A.confirm(token) : { ok: false, reason: 'unavailable' }).then((res) => {
          const okRes = !!(res && res.ok);
          const draft = okRes && res.outcome === 'draft-opened';
          row.textContent = draft ? ac.draft : okRes ? ac.done : (res && res.reason === 'expired' ? ac.expired : ac.refused + (res && res.reason ? ' (' + res.reason + ')' : ''));
          logAi({ route: 'action', provenance: draft ? 'draft-opened' : okRes ? 'executed' : 'refused', ms: 0, qLength: 0 });
        }, () => { row.textContent = ac.refused; });
        return;
      }
      const cancelBtn = e.target.closest('[data-fa-confirm-no]');
      if (cancelBtn) {
        const row = cancelBtn.parentElement;
        const A = window.KiwiAgentActions;
        if (A && A.cancel) A.cancel(cancelBtn.getAttribute('data-fa-confirm-no'));
        row.textContent = (__state.ACTION_COPY[__state.L] || __state.ACTION_COPY.fr).cancelled;
        return;
      }
      const rateBtn = e.target.closest('[data-fa-rate]');
      if (rateBtn) {
        try { window.KiwiAiTelemetry && window.KiwiAiTelemetry.rate(rateBtn.getAttribute('data-fa-rate')); } catch (_) {}
        const wrap = rateBtn.parentElement;
        if (wrap) { wrap.textContent = rateBtn.getAttribute('data-fa-rate') === 'up' ? '👍' : '👎'; wrap.classList.add('fa-rated'); }
        return;
      }
      if (e.target.closest('[data-fa-stop-llm]')) { __state.LLM.cancelled = true; return; }
      const moreBtn = e.target.closest('[data-fa-ctx-more]');
      if (moreBtn) {
        const det = root.querySelector('[data-fa-detail]');
        if (det) {
          det.hidden = !det.hidden;
          moreBtn.textContent = det.hidden ? __state.HL().more : __state.HL().less;
        }
        return;
      }
      const fact = e.target.closest('[data-fa-fact]');
      if (fact) { insertFact(fact.getAttribute('data-fa-fact'), fact); return; }
    });

    // ─── keypad ───
    const toggle = root.querySelector('[data-fa-keypad-toggle]');
    toggle.addEventListener('click', () => {
      const isOpen = keypad.classList.toggle('open');
      toggle.classList.toggle('on', isOpen);
    });

    const kpUse = root.querySelector('[data-fa-kp-use]');
    let kpExpr = '', kpDone = false;
    const kpShow = () => {
      kpd.textContent = kpExpr || '0';
      if (kpUse) kpUse.hidden = !(kpDone && kpExpr);
    };
    keypad.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-fa-key]');
      if (!btn) return;
      const k = btn.getAttribute('data-fa-key');
      if (k === 'C') { kpExpr = ''; kpDone = false; }
      else if (k === '⌫') { kpExpr = kpExpr.slice(0, -1); }
      else if (k === '=') {
        const r = __state.evalMath(kpExpr);
        if (r != null) {
          kpExpr = String(Math.round(r * 1e6) / 1e6);
          kpDone = true;
        } else { kpd.textContent = __state.tr().ui.kpError; if (kpUse) kpUse.hidden = true; return; }
      } else {
        const isOp = /[÷×−+%]/.test(k);
        if (kpDone && !isOp) { kpExpr = ''; kpDone = false; }
        else if (kpDone && isOp) { kpDone = false; }
        kpExpr += k;
      }
      kpShow();
    });
    /* Calculator → conversation bridge — drop the computed result into the
     * message box so the owner can build a question around it. */
    if (kpUse) kpUse.addEventListener('click', () => {
      if (!kpExpr) return;
      insertFact(kpExpr);
      keypad.classList.remove('open');
      toggle.classList.remove('on');
    });

    /* Desk only: on a phone, focusing here opens the keyboard 480 ms after the
       drawer and moves every control under the merchant's finger. */
    const finePointer = !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (finePointer) setTimeout(() => input.focus(), 480);
  }
    return { menuContextLines, liveActivityContextLines, buildSystemPrompt, injectCss, replyHtml, open };
  };
})();
