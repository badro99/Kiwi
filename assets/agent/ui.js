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
function salesWindowEvidence(profile) {
    if (!profile || !profile.partial || !profile.salesWindowStart || !profile.salesWindowEnd) return '';
    const freshness = profile.salesAsOf
      ? new Date(profile.salesAsOf).toISOString()
      : 'aucun événement horodaté dans la fenêtre';
    const zone = profile.salesTimezone ? ` · ${profile.salesTimezone}` : '';
    const cutoff = profile.salesCutoff == null ? '' : ` · bascule ${profile.salesCutoff}h`;
    return `Fenêtre ventes : ${profile.salesWindowStart} → ${profile.salesWindowEnd} inclus${zone}${cutoff} · dernière vente/remboursement : ${freshness}`;
  }

function detectQLang(text) {
    const t = String(text || '');
    if (/[؀-ۿ]/.test(t)) return 'ar';
    const s = ' ' + t.toLowerCase().replace(/[^a-zà-ÿ ]/g, ' ') + ' ';
    let fr = 0, en = 0;
    ['le','la','les','une','des','du','mon','ma','mes','est','sont','quel','quels','quelle','combien','pour','avec','je','pas','ne','ca'].forEach((w) => { if (s.indexOf(' ' + w + ' ') >= 0) fr++; });
    ['the','an','my','is','are','what','how','much','many','with','does','best','worst','show','which','items','your'].forEach((w) => { if (s.indexOf(' ' + w + ' ') >= 0) en++; });
    if (en > fr) return 'en';
    if (fr > en) return 'fr';
    return __state.getLang();
  }

function parseAmount(q) {
    const m = q.match(/(\d[\d  .]*\d|\d)\s*(millions?|m\b|k\b|mille|thousand|alf|ألف)?/i);
    if (!m) return null;
    let n = parseFloat(m[1].replace(/[  .]/g, '').replace(',', '.'));
    const suf = (m[2] || '').toLowerCase();
    if (suf === 'k' || suf === 'mille' || suf === 'thousand' || suf === 'alf' || suf === 'ألف') n *= 1000;
    else if (suf[0] === 'm') n *= 1000000;
    return isFinite(n) ? n : null;
  }

function parseAllAmounts(q) {
    const out = [];
    const re = /(\d[\d  .]*\d|\d)\s*(millions?|m\b|k\b|mille|thousand|alf|ألف)?/gi;
    for (const m of String(q).matchAll(re)) {
      let n = parseFloat(m[1].replace(/[  .]/g, '').replace(',', '.'));
      const suf = (m[2] || '').toLowerCase();
      if (suf === 'k' || suf === 'mille' || suf === 'thousand' || suf === 'alf' || suf === 'ألف') n *= 1000;
      else if (suf[0] === 'm') n *= 1000000;
      if (isFinite(n)) out.push(n);
    }
    return out;
  }

function evalMath(expr) {
    let e = __state.fixDigits(String(expr)).replace(/×/g, '*').replace(/÷/g, '/')
      .replace(/\s/g, '').replace(/,/g, '.');
    e = e.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    if (!/^[-+*/().\d]+$/.test(e) || !/\d/.test(e)) return null;
    try {
      const r = Function('"use strict";return(' + e + ')')();
      return (typeof r === 'number' && isFinite(r)) ? r : null;
    } catch (_) { return null; }
  }

function partialReply() {
    const t = __state.nv();
    const r = { text: t.costsNeeded(__state.escHtml(__state.B.name)), note: t.costsCta };
    if (__state.B.revenue > 0) {
      r.stats = [
        { l: t.revLabel, v: __state.fmtMad(__state.B.revenue), h: '' },
        { l: t.ordLabel, v: __state.fmt(__state.B.ordersPerMonth), h: '' },
        { l: t.basketLabel, v: __state.fmtMad(__state.B.avgBasket), h: '' },
      ];
    }
    return r;
  }

function sHire(q) {
    if (__state.B.partial) return partialReply();
    const t = __state.tr().hire;
    /* Take the first figure that could plausibly be a monthly salary, not the
     * first number in the string — the leading number is usually the count. */
    const unit = parseAllAmounts(q).filter((v) => v >= 1800)[0];
    /* Count: explicit wins. Otherwise, a message that also states a NEW salary
     * is a fresh spec ("un cuisinier à 6000" → one), while a bare follow-up
     * ("et avec la CNSS ?") still refers to however many we were discussing. */
    const said = __state.hireCount(q);
    const n = said != null ? said : (unit ? 1 : (__state.lastHire.n || 1));
    let per = unit, assumed = false;
    /* A follow-up rarely repeats the salary: "et si j'en prends deux" means
     * two AT THE FIGURE WE JUST DISCUSSED. Carry it rather than silently
     * resetting to the 7 200 default, which would understate the answer. */
    if (!per && __state.lastHire.per) per = __state.lastHire.per;
    if (!per) { per = 7200; assumed = true; }
    /* "et avec la CNSS ?" — gross their net figure up to employer cost. */
    const loaded = __state.LOADED_RX.test(__state.norm(q)) && !assumed;
    if (loaded) per = Math.round(per * __state.CNSS_UPLIFT);
    __state.lastHire = { per: per, n: n };
    const c = per * n;
    const ordersMo = c / (__state.B.avgBasket * __state.B.contribRatio);
    const newNet = __state.B.netProfit - c;
    const tone = c < __state.B.netProfit * 0.4 ? 'good' : c < __state.B.netProfit * 0.8 ? 'warn' : 'bad';
    return {
      text: t.text(c, per, n),
      stats: [
        { l: t.s1l, v: t.s1v(ordersMo), h: t.s1h(ordersMo) },
        { l: t.s2l, v: __state.fmtMad(c / __state.B.contribRatio), h: t.s2h },
        { l: t.s3l, v: __state.fmtMad(newNet), h: t.s3h() },
        { l: t.s4l, v: `${__state.fmt1(c / __state.B.netProfit * 100)} %`, h: t.s4h },
      ],
      verdict: { tone, text: tone === 'good' ? t.vGood(ordersMo) : tone === 'warn' ? t.vWarn : t.vBad },
      /* Always disclose the loaded-cost reading: a merchant who types 4 500
       * usually means net salary, and CNSS + AMO employer share adds ~21%
       * on top. Silently treating their figure as fully loaded understated
       * every hire. When we assumed the whole figure, say that instead. */
      note: assumed ? t.note : (loaded ? t.noteCnss(per, n) : t.noteLoaded(per, n)),
      follow: [__state.tr().chips.price5, __state.tr().chips.breakeven],
    };
  }

function sPrice(q) {
    if (__state.B.partial) return partialReply();
    const t = __state.tr().price;
    let p = __state.parsePercent(q), assumed = false;
    /* "augmente prix 10" — merchants drop the % sign constantly. In a pricing
     * question a lone plausible number is the percentage they mean, so using
     * the 5 % default there answered a question nobody asked. Guarded: ignore
     * it when a currency follows ("de 2 dirhams" is an absolute change, a
     * different scenario we don't model) or when it can't be a percentage. */
    if (p == null) {
      const bare = __state.norm(q).match(/(?:^|\s)(\d{1,3}(?:[.,]\d+)?)\s*(?!\s*(?:dh|dhs|dirham|mad|درهم|درهما))(?:\s|$|\?|!|\.)/);
      const v = bare ? parseFloat(bare[1].replace(',', '.')) : null;
      if (v != null && v > 0 && v <= 100) p = v;
    }
    if (p == null) { p = 5; assumed = true; }
    const down = /\b(baiss|rédui|reduir|diminu|lower|cut|reduc|decrease|خفض|تخفيض)/i.test(__state.norm(q));
    if (down) p = -Math.abs(p);
    /* Clamp before any arithmetic. Unclamped, "baisse les prix de 200%"
     * returned a 177,7% net margin and a MINUS 142 MAD average basket,
     * stated with the same confidence as a real answer. A cut cannot exceed
     * 100%, and beyond +200% the constant-volume assumption is fiction. */
    const clamped = p < -100 || p > 200;
    p = Math.max(-100, Math.min(200, p));
    /* Degenerate cut: below this the new revenue no longer covers the food
     * cost, so every stat downstream is meaningless — at exactly -100 % the
     * margin divides by zero and printed "-∞ %". A sentence the merchant can
     * act on beats four impossible numbers. */
    if (__state.B.revenue * (1 + p / 100) <= __state.B.cogs) {
      return {
        text: t.textDegenerate(Math.abs(p), __state.B.cogs),
        note: t.note + (clamped ? t.noteClamped : ''),
        follow: [__state.tr().chips.breakeven, __state.tr().chips.charges],
      };
    }
    const deltaNet = __state.B.revenue * p / 100;
    const newNet = __state.B.netProfit + deltaNet;
    const newRev = __state.B.revenue * (1 + p / 100);
    const newNetMargin = newNet / newRev * 100;
    const tone = p > 0 ? (p <= 8 ? 'good' : 'warn') : 'warn';
    return {
      text: t.text(p),
      stats: [
        { l: t.s1l, v: __state.fmtMad(newNet), h: t.s1h(deltaNet) },
        { l: t.s2l, v: `${deltaNet >= 0 ? '+' : ''}${__state.fmtMad(deltaNet * 12)}`, h: t.s2h },
        { l: t.s3l, v: `${__state.fmt1(newNetMargin)} %`, h: t.s3h() },
        { l: t.s4l, v: __state.fmtMad(newRev), h: t.s4h(__state.B.avgBasket * (1 + p / 100)) },
      ],
      /* p === 0 used to fall through to vDown and announce "une BAISSE de
       * prix" right under a headline reading "une hausse de 0,0 %". */
      verdict: {
        tone,
        text: p === 0 ? t.vFlat : p > 0 ? t.vUp(p, deltaNet) : t.vDown(Math.abs(p) / __state.B.contribRatio),
      },
      note: t.note + (assumed ? t.noteAssumed : '') + (clamped ? t.noteClamped : ''),
      follow: [__state.tr().chips.forecast, __state.tr().chips.charges],
    };
  }

function sAfford(q) {
    if (__state.B.partial) return partialReply();
    const t = __state.tr().afford;
    const A = parseAmount(q);
    if (!A || A < 100) {
      return { text: t.ask, follow: [__state.tr().chips.invest80, __state.tr().chips.invest150] };
    }
    const monthsRecoup = A / __state.B.netProfit;
    const afterCash = __state.B.cashBuffer - A;
    const pctCash = A / __state.B.cashBuffer * 100;
    const tone = (A <= __state.B.cashBuffer && monthsRecoup < 6) ? 'good'
      : (A <= __state.B.cashBuffer ? 'warn' : 'bad');
    return {
      text: t.text(A),
      stats: [
        { l: t.s1l, v: t.s1v(monthsRecoup), h: t.s1h },
        { l: t.s2l, v: __state.fmtMad(Math.max(afterCash, 0)), h: afterCash >= 0 ? t.s2hOk(pctCash) : t.s2hNo },
        { l: t.s3l, v: t.s3v(A / __state.B.dailyNet), h: t.s3h },
        { l: t.s4l, v: `${__state.fmt1(A / (__state.B.netProfit * 12) * 100)} %`, h: t.s4h },
      ],
      verdict: {
        tone,
        text: tone === 'good' ? t.vGood(monthsRecoup, afterCash)
          : tone === 'warn' ? t.vWarn(monthsRecoup, pctCash) : t.vBad(),
      },
      follow: [__state.tr().chips.breakeven, __state.tr().chips.forecast],
    };
  }

function sForecast() {
    if (__state.B.partial) return partialReply();
    const t = __state.tr().forecast;
    const runRate = __state.B.mtdRevenue / __state.B.mtdDays;
    const projRev = runRate * __state.B.daysInMonth;
    // Use the exact net-margin ratio (net ÷ revenue), not the rounded 22.3%
    // display constant, so the projection reconciles to the P&L to the dirham.
    const projNet = projRev * (__state.B.netProfit / __state.B.revenue);
    const vsAvg = (projRev - __state.B.revenue) / __state.B.revenue * 100;
    const tone = vsAvg >= 0 ? 'good' : 'warn';
    return {
      text: t.text(runRate),
      stats: [
        { l: t.s1l, v: __state.fmtMad(projRev), h: t.s1h() },
        { l: t.s2l, v: __state.fmtMad(projNet), h: t.s2h() },
        { l: t.s3l, v: __state.fmtMad(projRev * 12), h: t.s3h },
        { l: t.s4l, v: __state.fmtMad(projNet * 12), h: t.s4h },
      ],
      verdict: { tone, text: vsAvg >= 0 ? t.vGood(vsAvg) : t.vWarn(Math.abs(vsAvg)) },
      note: t.note,
      follow: [__state.tr().chips.charges, __state.tr().chips.price5],
    };
  }

function sAdvice(q) {
    if (__state.B.partial) return partialReply();
    const lng = detectQLang(q);
    const ins = (window.KiwiInsights && window.KiwiInsights.compute) ? window.KiwiInsights.compute(undefined, lng) : [];
    /* No insight engine, or nothing worth surfacing: the four-figure overview
     * is a far better answer than handing "kifach nzid lmbi3at" to a model. */
    if (!ins.length) return sOverview();
    const list = ins.slice(0, 3).map((i) =>
      `<div style="border-inline-start:2px solid var(--atlas);padding:1px 0 1px 12px;margin:11px 0;">` +
        `<div style="font-family:var(--mono);font-size:11px;letter-spacing:0.1em;color:var(--atlas);">${__state.escHtml(i.kpi)}</div>` +
        `<div style="font-weight:600;margin:3px 0 2px;line-height:1.3;">${__state.escHtml(i.title)}</div>` +
        `<div style="font-size:13px;color:var(--n-600);line-height:1.45;">${__state.escHtml(i.act)}</div>` +
      `</div>`).join('');
    return { text: `${__state.ADVICE_INTRO[lng] || __state.ADVICE_INTRO.fr}${list}`, follow: [__state.tr().chips.price5, __state.tr().chips.forecast] };
  }

function sBreakEvenReal(K) {
    const t = __state.nv();
    let be = null;
    try { be = K.breakEven(); } catch (_) { be = null; }
    if (!be) return partialReply();
    if (be.salesNeeded == null) {
      const why = { 'no-costs': 'beNoCosts', 'too-few': 'beTooFew', 'no-sales': 'beNoSales', negative: 'beNegative' }[be.reason] || 'beNoSales';
      let txt = '';
      try { txt = K.text ? K.text(why) : ''; } catch (_) { txt = ''; }
      return { text: __state.escHtml(txt || t.costsCta), follow: [__state.tr().chips.charges] };
    }
    const r = {
      text: t.beText(__state.fmtMad(be.fixedMonth), be.staffMonth > 0 ? __state.fmtMad(be.staffMonth) : '', `${__state.fmt1(be.contribution * 100)} %`),
      stats: [
        { l: t.beNeed, v: __state.fmtMad(be.salesNeeded), h: t.beNeedH },
        { l: t.bePerDay, v: __state.fmtMad(be.perDay), h: t.bePerDayH(be.daysAreOpenDays) },
        { l: t.beSold, v: __state.fmtMad(be.soldSoFar), h: t.beSoldH },
      ],
      note: t.beNote,
      follow: [__state.tr().chips.charges],
    };
    if (be.projection != null) {
      /* La fiabilité de ce rythme, rejouée sur les mois passés (KiwiChargesEngine.paceTrack). */
      const trackPct = be.track ? `${String(be.track.error).replace('.', __state.L === 'en' ? '.' : ',')} %` : '';
      r.stats.push({ l: t.bePace, v: __state.fmtMad(be.projection), h: be.track ? t.bePaceTrackH(be.track.months, trackPct) : t.bePaceH });
      r.verdict = be.gap >= 0 ? { tone: 'good', text: t.beAhead(__state.fmtMad(be.gap)) } : { tone: 'warn', text: t.beBehind(__state.fmtMad(-be.gap)) };
    } else {
      r.verdict = { tone: 'good', text: t.beEarly };
    }
    return r;
  }

function sChargesReal(K) {
    const t = __state.nv();
    let m = null;
    try { m = K.monthly(); } catch (_) { m = null; }
    if (!m) return partialReply();
    const labels = __state.tr().opex || {};
    const catLabel = (k) => {
      try { return K.catLabel ? K.catLabel(k) : (labels[k] || k); } catch (_) { return labels[k] || k; }
    };
    const items = Object.entries(m.byCat).map(([k, v]) => [catLabel(k), v]);
    if (m.staff && m.staff.total > 0) items.push([t.chStaff, m.staff.total, t.chStaffH(m.staff.socialSet)]);
    items.sort((a, b) => b[1] - a[1]);
    const total = items.reduce((n, x) => n + x[1], 0);
    if (!(total > 0)) return { text: t.costsCta, follow: [__state.tr().chips.breakeven] };
    const top = items[0];
    return {
      text: t.chText(__state.fmtMad(total)),
      stats: items.slice(0, 6).map((x) => ({ l: __state.escHtml(x[0]), v: __state.fmtMad(x[1]), h: x[2] || t.chShare(__state.fmt1(x[1] / total * 100)) })),
      verdict: { tone: 'warn', text: t.chBiggest(__state.escHtml(top[0]), __state.fmt1(top[1] / total * 100)) },
      follow: [__state.tr().chips.breakeven],
    };
  }

function sBreakEven() {
    if (__state.B.partial) { const K = __state.realCharges(); return K ? sBreakEvenReal(K) : partialReply(); }
    const t = __state.tr().breakeven;
    return {
      text: t.text(),
      stats: [
        { l: t.s1l, v: __state.fmtMad(__state.B.breakEvenRev), h: t.s1h() },
        { l: t.s2l, v: __state.fmt(__state.B.breakEvenOrdersDay), h: t.s2h() },
        { l: t.s3l, v: `${__state.fmt1(__state.B.marginOfSafety)} %`, h: t.s3h },
        { l: t.s4l, v: __state.fmtMad(__state.B.breakEvenRev / __state.B.daysOpen), h: t.s4h() },
      ],
      verdict: { tone: 'good', text: t.vGood() },
      follow: [__state.tr().chips.hire, __state.tr().chips.forecast],
    };
  }

function sMargin() {
    if (__state.B.partial) return partialReply();
    const t = __state.tr().margin;
    return {
      text: t.text,
      stats: [
        { l: t.s1l, v: `${__state.fmt1(__state.B.grossMargin)} %`, h: t.s1h() },
        { l: t.s2l, v: `${__state.fmt1(__state.B.netMargin)} %`, h: t.s2h() },
        { l: t.s3l, v: `${__state.fmt1(100 - __state.B.grossMargin)} %`, h: t.s3h() },
        { l: t.s4l, v: __state.fmtMad(__state.B.netPerOrder), h: t.s4h() },
      ],
      verdict: { tone: 'good', text: t.vGood() },
      note: t.note,
      follow: [__state.tr().chips.charges, __state.tr().chips.price5],
    };
  }

function sCharges() {
    if (__state.B.partial) { const K = __state.realCharges(); return K ? sChargesReal(K) : partialReply(); }
    const t = __state.tr().charges;
    const labels = __state.tr().opex;
    const items = Object.entries(__state.B.opex).sort((a, b) => b[1] - a[1]);
    const biggest = items[0];
    return {
      text: t.text(),
      stats: items.map(([k, v]) => ({ l: labels[k] || k, v: __state.fmtMad(v), h: t.share(v / __state.B.totalOpex * 100) })),
      verdict: { tone: 'warn', text: t.verdict(labels[biggest[0]] || biggest[0], biggest[1] / __state.B.totalOpex * 100) },
      follow: [__state.tr().chips.hire, __state.tr().chips.breakeven],
    };
  }

function sRevenue() {
    const t = __state.tr().revenue;
    if (__state.B.partial) {
      if (!(__state.B.revenue > 0)) return { text: __state.nv().noSales(__state.escHtml(__state.B.name)) };
      const p = __state.nv();
      return {
        text: p.revIntro,
        stats: [
          { l: p.revLabel, v: __state.fmtMad(__state.B.revenue), h: '' },
          { l: p.ordLabel, v: __state.fmt(__state.B.ordersPerMonth), h: '' },
          { l: p.basketLabel, v: __state.fmtMad(__state.B.avgBasket), h: '' },
        ],
        note: p.costsCta,
      };
    }
    return {
      text: t.text,
      stats: [
        { l: t.s1l, v: __state.fmtMad(__state.B.revenue), h: t.s1h },
        { l: t.s2l, v: __state.fmtMad(__state.B.dailyRev), h: t.s2h() },
        { l: t.s3l, v: __state.fmt(__state.B.ordersPerMonth), h: t.s3h() },
        { l: t.s4l, v: __state.fmtMad(__state.B.netProfit), h: t.s4h() },
      ],
      follow: [__state.tr().chips.forecast, __state.tr().chips.charges],
    };
  }

function sProfit() {
    if (__state.B.partial) return partialReply();
    const t = __state.tr().profit;
    return {
      text: t.text,
      stats: [
        { l: t.s1l, v: __state.fmtMad(__state.B.netProfit), h: t.s1h() },
        { l: t.s2l, v: __state.fmtMad(__state.B.dailyNet), h: t.s2h() },
        { l: t.s3l, v: __state.fmtMad(__state.B.netPerOrder), h: t.s3h() },
        { l: t.s4l, v: __state.fmtMad(__state.B.netProfit * 12), h: t.s4h },
      ],
      verdict: { tone: 'good', text: t.vGood() },
      follow: [__state.tr().chips.invest80, __state.tr().chips.breakeven],
    };
  }

function assistantUiCopy() {
    let c = null;
    try { c = window.KiwiFeatureTruth && window.KiwiFeatureTruth.context ? window.KiwiFeatureTruth.context({ role: __state.accessTier() }) : null; } catch (_) {}
    const label = (__state.B.tradeLabel || __state.B.trade || (__state.L === 'en' ? 'business' : __state.L === 'ar' ? 'النشاط' : 'activité'));
    const mode = c && c.aiMode || 'ask';
    const title = __state.L === 'en' ? `Kiwi copilot · ${label}` : __state.L === 'ar' ? `مساعد Kiwi · ${label}` : `Copilote Kiwi · ${label}`;
    const privacy = mode === 'cloud'
      ? (__state.L === 'en' ? 'Server AI on: a free-text question and only the business context it needs are sent securely to Kiwi. Your figures are computed here. The assistant remains read-only.' : __state.L === 'ar' ? 'الذكاء الاصطناعي عبر الخادم مفعّل: يُرسل السؤال الحر والسياق الضروري فقط بأمان إلى Kiwi. أرقامك تُحسب هنا. يبقى المساعد للقراءة فقط.' : 'IA serveur activée : une question libre et le seul contexte nécessaire sont envoyés de façon sécurisée à Kiwi. Vos chiffres sont calculés ici. Le copilote reste en lecture seule.')
      : mode === 'deterministic'
        ? (__state.L === 'en' ? 'Private mode: calculations only, nothing leaves this device. Read-only.' : __state.L === 'ar' ? 'الوضع الخاص: حسابات فقط، لا يغادر أي شيء هذا الجهاز. قراءة فقط.' : 'Mode privé : calculs seuls, rien ne quitte cet appareil. Lecture seule.')
        : (__state.L === 'en' ? 'Your figures are computed on this device. A free-text question goes to Kiwi’s server only after you agree, once. Read-only.' : __state.L === 'ar' ? 'أرقامك تُحسب على هذا الجهاز. السؤال الحر يُرسل إلى خادم Kiwi فقط بعد موافقتك، مرة واحدة. قراءة فقط.' : 'Vos chiffres sont calculés sur cet appareil. Une question libre part vers le serveur Kiwi seulement après votre accord, une fois. Lecture seule.');
    const modeToggle = mode === 'cloud'
      ? (__state.L === 'en' ? 'Switch to private mode' : __state.L === 'ar' ? 'الانتقال إلى الوضع الخاص' : 'Passer en mode privé')
      : (__state.L === 'en' ? 'Enable server AI' : __state.L === 'ar' ? 'تفعيل الذكاء الاصطناعي عبر الخادم' : 'Activer l’IA serveur');
    return { title, privacy, modeToggle };
  }

function renderHero() {
    const h = __state.HL();
    const safety = (__state.B.revenue - __state.B.breakEvenRev) / __state.B.revenue * 100;
    const icHire = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.6"/><path d="M5 21v-1a6 6 0 016-6h2a6 6 0 016 6v1"/></svg>';
    const icPct  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.4"/><circle cx="17" cy="17" r="2.4"/></svg>';
    const icFeatures = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="m15 18 2 2 4-5"/></svg>';
    const icSetup = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>';
    const icBook = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4a2 2 0 012-2h12v20H7a2 2 0 01-2-2z"/><path d="M9 2v20"/></svg>';
    const icIns  = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M289-329q-29-29-29-71t29-71q29-29 71-29t71 29q29 29 29 71t-29 71q-29 29-71 29t-71-29ZM200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Z"/></svg>';
    const icInv  = '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M240-80q-50 0-85-35t-35-85v-120h120v-560l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v680q0 50-35 85t-85 35H240Zm480-80q17 0 28.5-11.5T760-200v-560H320v440h360v120q0 17 11.5 28.5T720-160ZM360-600v-80h240v80H360Zm0 120v-80h240v80H360Zm320-120q-17 0-28.5-11.5T640-640q0-17 11.5-28.5T680-680q17 0 28.5 11.5T720-640q0 17-11.5 28.5T680-600Zm0 120q-17 0-28.5-11.5T640-520q0-17 11.5-28.5T680-560q17 0 28.5 11.5T720-520q0 17-11.5 28.5T680-480ZM240-160h360v-80H200v40q0 17 11.5 28.5T240-160Zm-40 0v-80 80Z"/></svg>';
    const heroH   = __state.B.partial ? __state.nv().heroGreet        : h.greet;
    const heroP   = __state.B.partial ? __state.nv().heroLead(__state.escHtml(__state.B.name)) : h.lead;
    const heroIns = __state.B.partial ? __state.nv().heroIns          : h.ins(__state.fmt1(__state.B.netMargin), __state.fmt1(safety));
    const ph = __state.PRODUCT_HERO[__state.L] || __state.PRODUCT_HERO.fr;
    const firstQuery = __state.B.partial && window.KiwiFeatureGuide ? (__state.L === 'en' ? 'Which Kiwi features do I have?' : __state.L === 'ar' ? 'ما هي وظائف Kiwi المتاحة؟' : 'Quelles fonctions Kiwi ai-je ?') : __state.tr().chips.hire;
    const secondQuery = __state.B.partial && window.KiwiFeatureGuide ? (__state.L === 'en' ? 'Help me configure my business' : __state.L === 'ar' ? 'ساعدني في إعداد مؤسستي' : 'Aide-moi à configurer mon établissement') : __state.tr().chips.price5;
    const op = __state.operationalHero();
    const trade3 = window.KiwiVenue?.getVocab?.('aiChips');
    __state.kitHome = {
      business: __state.B.name, trade: Array.isArray(trade3) ? trade3.slice(0, 3) : null,
      cards: [firstQuery, secondQuery].concat(__state.B.partial ? [op[2]] : []),
      pace: window.KiwiDateRange?.todayPace?.() || null,
    };
    return `<div class="fa-hero" data-fa-hero>
      <div class="fa-hero-mark">${__state.ICON.avatar}</div>
      <div class="fa-hero-h">${heroH}</div>
      <div class="fa-hero-p">${heroP}</div>
      <div class="fa-hero-cards">
        <button class="fa-hero-card" type="button" data-fa-follow="${__state.escAttr(firstQuery)}">
          <span class="ic">${__state.B.partial ? icFeatures : icHire}</span><span class="t">${__state.B.partial ? ph.c1t : h.c1t}</span><span class="s">${__state.B.partial ? ph.c1s : h.c1s}</span></button>
        <button class="fa-hero-card" type="button" data-fa-follow="${__state.escAttr(secondQuery)}">
          <span class="ic">${__state.B.partial ? icSetup : icPct}</span><span class="t">${__state.B.partial ? ph.c2t : h.c2t}</span><span class="s">${__state.B.partial ? ph.c2s : h.c2s}</span></button>
        ${__state.B.partial ? `<button class="fa-hero-card" type="button" data-fa-follow="${__state.escAttr(op[2])}">
          <span class="ic">${icBook}</span><span class="t">${op[0]}</span><span class="s">${op[1]}</span></button>` : `<button class="fa-hero-card" type="button" data-fa-open="open-comptabilite">
          <span class="ic">${icBook}</span><span class="t">${h.c3t}</span><span class="s">${h.c3s}</span></button>`}
        ${__state.supplierInvoiceOn() ? `<button class="fa-hero-card" type="button" data-fa-open="stock-scan-invoice">
          <span class="ic">${icInv}</span><span class="t">${ph.c4t}</span><span class="s">${ph.c4s}</span></button>` : ''}
      </div>
      <div class="fa-hero-insight">${icIns}<div><b>${h.insT}</b> ${heroIns}</div></div>
    </div>`;
  }

function sHelp() {
    // A real / custom-venue merchant must NOT get the demo greeting that names
    // "Rachid" and "Café Atlas". Mirror the rest of the agent (gated on B.partial):
    // use the neutral, business-derived intro instead.
    const text = __state.B.partial
      ? (__state.nv().heroGreet + ' ' + __state.nv().heroLead(__state.escHtml(__state.B.name)))
      : __state.tr().help.text;
    return {
      text,
      follow: [__state.tr().chips.hire, __state.tr().chips.price5, __state.tr().chips.breakeven, __state.tr().chips.forecast, __state.tr().chips.invest80],
      open: [{ label: __state.acctLabel('open'), handler: 'open-comptabilite' }],
    };
  }

function sRunway() {
    const t = __state.tr().runway;
    if (__state.B.partial || __state.B.cashBuffer == null || __state.B.totalOpex == null) {
      return { text: __state.gTxt().strainPartial, follow: [__state.tr().chips.charges, __state.tr().chips.breakeven] };
    }
    const monthlyOut = __state.B.totalOpex + __state.B.cogs;         // everything that must be paid
    const losing = __state.B.netProfit < 0;
    const months = losing ? __state.B.cashBuffer / Math.abs(__state.B.netProfit) : __state.B.cashBuffer / monthlyOut;
    const opex = __state.B.opex || {};
    const topKey = Object.keys(opex).sort((a, b) => opex[b] - opex[a])[0];
    const topLabel = (__state.tr().opex || {})[topKey] || topKey;
    return {
      text: losing ? t.textLoss(months) : t.textOk(months),
      stats: [
        { l: t.s1l, v: __state.fmtMad(__state.B.cashBuffer), h: t.s1h },
        { l: losing ? t.s2lLoss : t.s2lOk, v: __state.fmtMad(Math.abs(__state.B.netProfit)), h: losing ? t.s2hLoss : t.s2hOk },
        { l: t.s3l, v: __state.fmtMad(monthlyOut), h: t.s3h },
        { l: t.s4l, v: `${topLabel} · ${__state.fmtMad(opex[topKey] || 0)}`, h: t.s4h },
      ],
      verdict: { tone: losing ? 'bad' : (months < 1 ? 'warn' : 'good'), text: losing ? t.vLoss(months) : t.vOk(months) },
      note: t.note,
      follow: [__state.tr().chips.breakeven, __state.tr().chips.charges],
    };
  }

function parseDays(q) {
    const m = q.match(/(\d{1,3})\s*(jours?|semaines?|mois|days?|weeks?|months?|iyam|ayam|smanat?|simanat?|ايام|يوم|اسابيع|اسبوع|شهر)/);
    if (m) {
      const n = parseInt(m[1], 10), u = m[2];
      if (/semaine|week|اسبوع|اسابيع/.test(u)) return n * 7;
      if (/mois|month|شهر/.test(u)) return n * 30;
      return n;
    }
    for (const k in __state.DAY_WORD) if (q.indexOf(k) >= 0) return __state.DAY_WORD[k];
    if (new RegExp('\\ble\\s+(?:' + __state.WEEKDAY + ')\\b').test(q)) return 1;
    if (/\bon\s+(?:sunday|monday|saturday)\b/.test(q)) return 1;
    return null;
  }

function ramadanNext() {
    try {
      const R = window.KiwiRamadan;
      let today = '';
      try { today = window.KiwiDayReport && window.KiwiDayReport.today ? window.KiwiDayReport.today() : ''; } catch (_) {}
      if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) today = new Date().toISOString().slice(0, 10);
      const n = R && R.supported ? R.next(today) : null;
      return n && n.start > today ? __state.fmtDay(n.start) : '';
    } catch (_) { return ''; }
  }

function sRamadan() {
    const R = window.KiwiRamadan;
    if (!R || !R.supported) return null;
    let e = null;
    try { e = R.effect(__state.ledger()); } catch (_) { e = null; }
    if (!e) return null;
    const t = __state.xt();
    const pct = (x) => `${__state.fmt1(x * 100)} %`;
    const stats = [
      { l: t.ramDuring, v: __state.fmtMad(e.during.avg), h: t.ramDaysH(e.during.openDays, e.during.days) },
      { l: t.ramBefore, v: __state.fmtMad(e.before.avg), h: t.ramDaysH(e.before.openDays, e.before.days) },
      { l: t.ramChange, v: `${e.change >= 0 ? '+' : '−'}${pct(Math.abs(e.change))}`, h: t.ramChangeH },
    ];
    if (e.during.eveningShare != null && e.before.eveningShare != null) stats.push({ l: t.ramEvening, v: pct(e.during.eveningShare), h: t.ramEveningH(pct(e.before.eveningShare)) });
    if (e.eid) stats.push({ l: t.ramEid, v: e.eid.open ? __state.fmtMad(e.eid.revenue) : t.ramEidClosed, h: __state.fmtDay(e.eid.day) });
    const nxt = ramadanNext();
    return {
      text: t.ramText(e.hijriYear, __state.fmtDay(e.start), __state.fmtDay(e.end)),
      stats,
      verdict: { tone: e.change >= 0 ? 'good' : 'warn', text: e.change >= 0 ? t.ramUp(pct(e.change)) : t.ramDown(pct(-e.change)) },
      note: t.ramNote + (nxt ? t.ramNext(nxt) : ''),
      follow: [__state.tr().chips.breakeven, __state.tr().chips.forecast],
    };
  }

function sSeason(q) {
    if (/ramadan|ramdan|رمضان/.test(q) && !__state.CLOSE_RX.test(q) && !__state.EXTRA_DAY_RX.test(q)) { const r = sRamadan(); if (r) return r; }
    if (__state.B.partial || __state.B.contribRatio == null || __state.B.netProfit == null) return partialReply();
    const t = __state.xt();
    const d = parseDays(q);
    const contribDay = __state.B.dailyRev * __state.B.contribRatio;
    if (d != null && (__state.CLOSE_RX.test(q) || __state.EXTRA_DAY_RX.test(q))) {
      const opening = __state.EXTRA_DAY_RX.test(q) && !__state.CLOSE_RX.test(q);
      const margin = contribDay * d;
      if (opening) {
        return {
          text: t.openText(d),
          stats: [
            { l: t.openGain, v: `+${__state.fmtMad(margin)}`, h: t.openGainH(d) },
            { l: t.openRev, v: __state.fmtMad(__state.B.dailyRev * d), h: t.openRevH() },
            { l: t.closeNet, v: __state.fmtMad(__state.B.netProfit + margin), h: t.closeNetH() },
            { l: t.openShare, v: `+${__state.fmt1(margin / __state.B.netProfit * 100)} %`, h: t.openShareH },
          ],
          verdict: { tone: 'good', text: t.openV(__state.fmtMad(margin)) },
          note: t.openNote,
          follow: [__state.tr().chips.breakeven, __state.tr().chips.forecast],
        };
      }
      const after = __state.B.netProfit - margin;
      const share = __state.fmt1(margin / __state.B.netProfit * 100);
      return {
        text: t.closeText(d),
        stats: [
          { l: t.closeLost, v: `−${__state.fmtMad(margin)}`, h: t.closeLostH(d) },
          { l: t.closeFixed, v: __state.fmtMad(__state.B.totalOpex / __state.B.daysOpen * d), h: t.closeFixedH },
          { l: t.closeNet, v: __state.fmtMad(after), h: t.closeNetH() },
          { l: t.closeDay, v: __state.fmtMad(contribDay), h: t.closeDayH },
        ],
        verdict: after <= 0
          ? { tone: 'bad', text: t.closeVHard(__state.fmtMad(margin)) }
          : { tone: margin > __state.B.netProfit * 0.25 ? 'warn' : 'good', text: t.closeV(__state.fmtMad(margin), share) },
        note: t.closeNote,
        follow: [__state.tr().chips.breakeven, __state.tr().chips.charges],
      };
    }
    /* No duration stated — answer the sensitivity, which is the honest core. */
    const lead = /ramadan|رمضان/.test(q) ? t.seasRamadan + ((n) => n ? t.ramNext(n) : '')(ramadanNext())
      : /\bete\b|summer|صيف|chaleur|aout|juillet/.test(q) ? t.seasSummer
      : /touriste|tourist|saison|season|سياح|موسم/.test(q) ? t.seasTourist
      : t.seasGeneric;
    const at = (p) => __state.B.netProfit + __state.B.revenue * (p / 100) * __state.B.contribRatio;
    return {
      text: lead,
      stats: [-30, -15, 15, 30].map((p) => ({ l: t.swingL(p), v: __state.fmtMad(at(p)), h: t.swingH })),
      verdict: {
        tone: 'good',
        text: t.seasV(__state.fmtMad(__state.B.revenue * 0.01 * __state.B.contribRatio), __state.fmt1(__state.B.marginOfSafety)),
      },
      note: t.seasNote,
      follow: [__state.tr().chips.breakeven, __state.tr().chips.forecast],
    };
  }

function sGoal(q) {
    if (__state.B.partial || __state.B.contribRatio == null) return partialReply();
    const t = __state.xt();
    const amounts = parseAllAmounts(q).filter((v) => v >= 500);
    if (!amounts.length) return sOverview();
    let target = Math.max.apply(null, amounts);
    if (/\bpar\s+an\b|\/\s*an\b|annuel|per\s+year|a\s+year|yearly|في\s*السنة|سنوي/.test(q)) target /= 12;
    const reqRev = (target + __state.B.totalOpex) / __state.B.contribRatio;
    const gapPct = (reqRev - __state.B.revenue) / __state.B.revenue * 100;
    const reqOrders = reqRev / __state.B.avgBasket / __state.B.daysOpen;
    const pricePct = (target - __state.B.netProfit) / __state.B.revenue * 100;
    /* Already past the target: the same two figures are still exactly right,
     * but "activité à gagner : −6,5 %" reads as a mistake. It is slack, and
     * labelling it as slack is the difference between a number and an answer. */
    const done = target <= __state.B.netProfit;
    const tone = done ? 'good' : gapPct <= 25 ? 'good' : gapPct <= 100 ? 'warn' : 'bad';
    return {
      text: t.goalText(target),
      stats: [
        { l: t.goalRev, v: __state.fmtMad(reqRev), h: t.goalRevH() },
        { l: t.goalOrders, v: __state.fmt1(reqOrders), h: t.goalOrdersH() },
        { l: done ? t.goalSlack : t.goalGap, v: `${gapPct >= 0 ? '+' : ''}${__state.fmt1(gapPct)} %`, h: done ? t.goalSlackH : t.goalGapH },
        { l: done ? t.goalPriceDown : t.goalPrice, v: `${pricePct >= 0 ? '+' : ''}${__state.fmt1(pricePct)} %`, h: done ? t.goalPriceDownH : t.goalPriceH },
      ],
      verdict: {
        tone,
        text: done ? t.goalDone(target)
          : gapPct <= 25 ? t.goalNear(__state.fmt1(gapPct))
          : gapPct <= 100 ? t.goalFar(__state.fmt1(gapPct))
          : t.goalWild(__state.fmt1(gapPct)),
      },
      note: t.goalNote,
      follow: [__state.tr().chips.price5, __state.tr().chips.breakeven],
    };
  }

function windowStats(from, to) {
    let revenue = 0, count = 0;
    __state.ledger().forEach((e) => {
      const ts = +((e && e.ts) || 0);
      if (!ts || ts < from || ts >= to) return;
      revenue += Math.max(0, +e.amount || 0); count++;
    });
    return { revenue, count, basket: count ? revenue / count : 0 };
  }

function dayStart(ts) {
    try {
      const R = window.KiwiDayReport;
      if (R && R.dayBounds && R.businessDay) {
        const b = R.dayBounds(R.businessDay(ts));
        if (b && isFinite(b.from)) return b.from;
      }
    } catch (_) {}
    const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime();
  }

function metaLine(prov, spec) {
    if (!prov || !prov.mod) return '';
    /* La démo locale n'a qu'une source de vérité par construction : deux
       surfaces ne peuvent pas s'y contredire, il n'y a donc rien à tracer, et
       la démo reste identique au bit près. La ligne est pour les vrais
       commerçants, chez qui plusieurs magasins coexistent. */
    if (!__state.B.partial) return '';
    const p = __state.PROV_T[__state.L] || __state.PROV_T.fr;
    const bits = [__state.escHtml(__state.B.name || ''), (spec && spec.periodLabel) || __state.periodLabel(null), p[prov.mod] || prov.mod];
    if (prov.count != null) bits.push(prov.unit === 'entries' ? p.entries(prov.count) : p.tickets(prov.count));
    if (prov.total != null && prov.count != null && prov.total > prov.count) bits.push(p.part(prov.count, prov.total));
    const s = __state.syncBit(p);
    if (s) bits.push(s);
    return bits.filter(Boolean).join(' · ');
  }

function sLookup(spec) {
    const D = window.KiwiAgentData;
    if (spec) spec.periodLabel = __state.periodLabel(spec.period);
    let r = null;
    try { r = (D && D.reply) ? D.reply(spec, __state.L) : null; } catch (_) { r = null; }
    if (!r) return __state.sScoped();
    if (r.prov) { r.meta = metaLine(r.prov, spec); delete r.prov; }
    return r;
  }

function sDay(spec) {
    const t = __state.xt();
    const from = __state.midnight(spec.offset), to = from + __state.DAY_MS;
    const label = __state.dateLabel(from);
    if (!__state.B.partial) return { text: t.dayAggregate, follow: [__state.tr().chips.forecast, __state.tr().chips.breakeven] };
    const first = __state.firstSaleTs();
    if (first == null) return { text: t.dayNoSales(__state.escHtml(__state.B.name)) };
    if (to <= first) return { text: t.dayBeforeFirst(label, __state.dateLabel(first)) };
    const firstDay = __state.midnight(0) - Math.round((__state.midnight(0) - dayStart(first)) / __state.DAY_MS) * __state.DAY_MS;
    const spanDays = Math.max(1, Math.round((__state.midnight(0) - firstDay) / __state.DAY_MS) + 1);
    const avg = windowStats(firstDay, Infinity).revenue / spanDays;
    const cur = windowStats(from, to);
    const prev = windowStats(from - __state.DAY_MS, from);
    const prevStat = { l: t.dayPrev, v: prev.count ? __state.fmtMad(prev.revenue) : t.dayNone, h: __state.dateLabel(from - __state.DAY_MS) };
    const avgStat = { l: t.dayAvg, v: __state.fmtMad(avg), h: t.dayAvgH(spanDays) };
    const dayProv = { mod: 'sales', count: cur.count };
    if (!cur.count) {
      return {
        text: t.dayZero(label), stats: [prevStat, avgStat], note: t.dayNote,
        meta: metaLine(dayProv, { periodLabel: label }),
        follow: [__state.tr().chips.forecast, __state.tr().chips.breakeven],
      };
    }
    const r = {
      text: t.dayText(label),
      stats: [
        { l: t.dayRev, v: __state.fmtMad(cur.revenue), h: t.dayRevH(cur.count) },
        { l: t.dayBasket, v: __state.fmtMad(cur.basket), h: t.dayBasketH },
        prevStat,
        avgStat,
      ],
      note: spec.offset === 0 ? t.dayNoteToday : t.dayNote,
      meta: metaLine(dayProv, { periodLabel: label }),
      follow: [__state.tr().chips.forecast, __state.tr().chips.breakeven],
    };
    if (avg > 0) {
      const delta = (cur.revenue - avg) / avg * 100;
      r.verdict = delta >= 0
        ? { tone: 'good', text: t.dayVUp(__state.fmt1(delta)) }
        : { tone: 'warn', text: t.dayVDown(__state.fmt1(-delta)) };
    }
    return r;
  }

function sStock() {
    const t = __state.xt();
    const C = window.KiwiBoutiqueCatalog;
    const s = (C && typeof C.stats === 'function') ? C.stats() : null;
    if (!s || !s.products) {
      return { text: t.stockNone, open: [{ label: (__state.ACT[__state.L] || __state.ACT.fr).btn((__state.ACT[__state.L] || __state.ACT.fr).stock), handler: 'nav-stock' }] };
    }
    const partial = s.costed < s.products;
    return {
      text: t.stockText(s.products),
      stats: [
        { l: t.stockCost, v: __state.fmtMad(s.stockCost), h: t.stockCostH },
        { l: t.stockValue, v: __state.fmtMad(s.stockValue), h: t.stockValueH },
        { l: t.stockUnits, v: __state.fmt(s.totalStock), h: t.stockUnitsH(s.products) },
        { l: t.stockOut, v: `${__state.fmt(s.ruptures)} · ${__state.fmt(s.low)}`, h: t.stockOutH },
      ],
      verdict: s.ruptures
        ? { tone: 'warn', text: t.stockVOut(s.ruptures) }
        : { tone: 'good', text: t.stockVOk },
      note: partial ? t.stockPartial : '',
      open: [{ label: (__state.ACT[__state.L] || __state.ACT.fr).btn((__state.ACT[__state.L] || __state.ACT.fr).stock), handler: 'nav-stock' }],
    };
  }

function sClients() {
    const t = __state.xt();
    const K = window.KiwiClients;
    const has = K && typeof K.hasBook === 'function' && K.hasBook();
    const c = (has && typeof K.segmentCounts === 'function') ? K.segmentCounts() : null;
    if (!c || !c.total) return { text: t.cliNone };
    const repeat = (c.total - c.new) / c.total * 100;
    return {
      text: t.clientText(c.total),
      stats: [
        { l: t.cliRepeat, v: `${__state.fmt1(repeat)} %`, h: t.cliRepeatH },
        { l: t.cliLoyal, v: `${__state.fmt(c.reg + c.vip)} · ${__state.fmt(c.vip)}`, h: t.cliLoyalH },
        { l: t.cliNew, v: __state.fmt(c.new), h: t.cliNewH },
        { l: t.cliLost, v: __state.fmt(c.win), h: t.cliLostH },
      ],
      verdict: repeat >= 40
        ? { tone: 'good', text: t.cliVGood(__state.fmt1(repeat)) }
        : { tone: 'warn', text: t.cliVLow(__state.fmt1(repeat)) },
      note: t.cliNote,
    };
  }

function sOverview() {
    if (__state.B.partial || __state.B.netProfit == null) return partialReply();
    const t = __state.xt();
    const months = __state.B.cashBuffer / (__state.B.totalOpex + __state.B.cogs);
    const tone = __state.B.netProfit <= 0 ? 'bad' : __state.B.marginOfSafety < 15 ? 'warn' : 'good';
    return {
      text: t.ovText,
      stats: [
        { l: t.ovRev, v: __state.fmtMad(__state.B.revenue), h: t.ovRevH() },
        { l: t.ovNet, v: __state.fmtMad(__state.B.netProfit), h: t.ovNetH() },
        { l: t.ovSafe, v: `${__state.fmt1(__state.B.marginOfSafety)} %`, h: t.ovSafeH },
        { l: t.ovCash, v: __state.fmtMad(__state.B.cashBuffer), h: t.ovCashH(months) },
      ],
      verdict: {
        tone,
        text: tone === 'bad' ? t.ovBad : tone === 'warn' ? t.ovWarn
          : months < 1.5 ? t.ovThin(months) : t.ovGood,
      },
      follow: [__state.tr().chips.charges, __state.tr().chips.forecast, __state.tr().chips.breakeven],
    };
  }

function sFinancing() {
    if (__state.B.partial || __state.B.netProfit == null) return partialReply();
    const t = __state.xt();
    return {
      text: t.finText,
      stats: [
        { l: t.finNet, v: __state.fmtMad(__state.B.netProfit), h: t.finNetH() },
        { l: t.finAnnual, v: __state.fmtMad(__state.B.netProfit * 12), h: t.finAnnualH },
        { l: t.finSafe, v: `${__state.fmt1(__state.B.marginOfSafety)} %`, h: t.finSafeH },
        { l: t.finCash, v: __state.fmtMad(__state.B.cashBuffer), h: t.finCashH },
      ],
      verdict: { tone: __state.B.netProfit > 0 ? 'good' : 'warn', text: t.finV },
      note: t.finNote,
      follow: [__state.tr().chips.breakeven, __state.tr().chips.charges],
    };
  }

function sExpansion() {
    if (__state.B.partial || __state.B.netProfit == null) return partialReply();
    const t = __state.xt();
    return {
      text: t.expText,
      stats: [
        { l: t.expCash, v: __state.fmtMad(__state.B.cashBuffer), h: t.expCashH },
        { l: t.expMonth, v: __state.fmtMad(__state.B.netProfit), h: t.expMonthH },
        { l: t.expYear, v: __state.fmtMad(__state.B.netProfit * 12), h: t.expYearH },
        { l: t.expBe, v: __state.fmtMad(__state.B.breakEvenRev), h: t.expBeH },
      ],
      verdict: { tone: 'warn', text: t.expV },
      note: t.expNote,
      follow: [__state.tr().chips.breakeven, __state.tr().chips.forecast],
    };
  }

function sValuation() {
    if (__state.B.partial || __state.B.netProfit == null) return partialReply();
    const t = __state.xt();
    return {
      text: t.valText,
      stats: [
        { l: t.valYear, v: __state.fmtMad(__state.B.netProfit * 12), h: t.valYearH },
        { l: t.valMonth, v: __state.fmtMad(__state.B.netProfit), h: t.valMonthH() },
        { l: t.valCash, v: __state.fmtMad(__state.B.cashBuffer), h: t.valCashH },
        { l: t.valFixed, v: __state.fmtMad(__state.B.totalOpex), h: t.valFixedH },
      ],
      verdict: { tone: 'warn', text: t.valV },
      note: t.valNote,
      follow: [__state.tr().chips.forecast, __state.tr().chips.charges],
    };
  }

function sAccounting(q) {
    const D = window.KiwiComptable && window.KiwiComptable.data;
    const a = __state.tr().acct;
    let handler = 'open-comptabilite', btn = __state.acctLabel('open'), text;
    if (D && /\btva\b|\bvat\b|impot|\btax\b|fiscal|declarat|acompte|\bdgi\b|\bis\b/.test(q)) {
      handler = 'acct-tva'; btn = __state.acctLabel('tva'); text = a.tva(D);
    } else if (D && /cnss|\bpaie\b|payroll|payslip|fiche|bulletin|salair|salary|wage/.test(q)) {
      handler = 'acct-paie'; btn = __state.acctLabel('paie'); text = a.paie(D);
    } else if (D && /bilan|balance|result|\betats?\b|statement|financial|cloture|comptes/.test(q)) {
      handler = 'acct-etats'; btn = __state.acctLabel('etats'); text = a.etats(D);
    } else if (D && /livre|ledger|ecritur|entries|journal|bookkeep|comptabilis/.test(q)) {
      handler = 'acct-livre'; btn = __state.acctLabel('livre'); text = a.livre(D);
    } else {
      text = a.hub;
    }
    return { text, open: [{ label: btn, handler }] };
  }

function sCalc(expr, result) {
    return {
      text: __state.tr().calc.title,
      stats: [{
        l: expr.trim(),
        v: __state.fmt1(Math.round(result * 100) / 100).replace(/,0$/, ''),
        h: Math.abs(result) > 999 ? __state.tr().calc.result : '',
      }],
    };
  }

function sCompound(raw) {
    if (__state.B.partial) return partialReply();
    const c = __state.CMP[__state.L] || __state.CMP.fr;
    const pct = __state.parsePercent(raw);
    let p = pct == null ? 5 : pct;
    if (/baiss|rédui|reduir|diminu|lower|cut|reduc|decrease|خفض|تخفيض/.test(__state.norm(raw))) p = -Math.abs(p);
    /* Separate the salary from the percent: a hire cost is a salary-scale
     * figure (≥ 1800 MAD), so the 8 in "8%" can never be mistaken for it. */
    const salaries = parseAllAmounts(raw).filter((n) => n >= 1800);
    const hireCost = salaries.length ? Math.max.apply(null, salaries) : 7200;
    const deltaPrice = __state.B.revenue * p / 100;
    const deltaHire = -hireCost;
    const newNet = __state.B.netProfit + deltaPrice + deltaHire;
    const newRev = __state.B.revenue * (1 + p / 100);
    const annual = (deltaPrice + deltaHire) * 12;
    const tone = newNet <= 0 ? 'bad' : (newNet >= __state.B.netProfit ? 'good' : 'warn');
    return {
      text: c.title,
      stats: [
        { l: p >= 0 ? c.priceUp(__state.fmt1(Math.abs(p))) : c.priceDown(__state.fmt1(Math.abs(p))), v: `${deltaPrice >= 0 ? '+' : ''}${__state.fmtMad(deltaPrice)}`, h: c.pm },
        { l: c.hire, v: __state.fmtMad(deltaHire), h: c.pm },
        { l: c.newNet, v: __state.fmtMad(newNet), h: `${__state.fmt1(newNet / newRev * 100)} %` },
        { l: c.annual, v: `${annual >= 0 ? '+' : ''}${__state.fmtMad(annual)}`, h: '' },
      ],
      verdict: { tone, text: tone === 'good' ? c.vGood(__state.fmtMad(annual)) : tone === 'warn' ? c.vWarn : c.vBad },
      follow: [__state.tr().chips.breakeven, __state.tr().chips.forecast],
    };
  }

function matchAction(q) {
    if (!__state.ACTION_VERB.test(q)) {
      /* "un lien de paiement" and "nouvelle vente" name a thing to create; the
       * noun IS the instruction, so these two need no imperative in front. */
      for (const t of __state.NAV_TARGETS) if ((t.key === 'paymentLink' || t.key === 'newSale' || t.noun) && t.rx.test(q) && !__state.navOff(t)) return t;
      return null;
    }
    for (const t of __state.NAV_TARGETS) if (t.rx.test(q) && !__state.navOff(t)) return t;
    return null;
  }

function opWhy(o, code, number) {
    const c = String(code || '');
    if (c.indexOf('already-') === 0) return o.already(number, o.state[c.slice(8)] || c.slice(8));
    if (c.indexOf('bad-transition:') === 0) return o.bad(number, o.state[c.slice(15)] || c.slice(15));
    if (c === 'order-unknown' || c === 'order-id-required') return o.unknown(number);
    if (c === 'orders-unavailable') return o.off;
    if (c === 'permission-denied' || c === 'forbidden' || c === 'role-forbidden') return o.denied;
    return o.fail(c || '?');
  }

function sOperation(op, said) {
    const o = __state.opCopy();
    const K = window.KiwiOperations;
    if (!K || typeof K.agentRun !== 'function' || typeof K.orders !== 'function') return { text: o.absent };
    /* Le même droit que le même travail fait à la main. Un écran qui ne peut
       pas faire avancer une commande ne doit pas afficher le bouton. */
    let may = false;
    try { may = K.agentAllowed('update-order-status'); } catch (_) { may = false; }
    if (!may) return { text: o.denied };
    const verb = o.verb[op.status] || op.status;
    return {
      text: o.lead(verb, op.number),
      note: o.pending,
      run: { action: 'update-order-status', status: op.status, number: op.number, said: said, label: o.btn(verb, op.number) },
    };
  }

function namedDay(q) {
    if (__state.CLIENTS_RX.test(q)) return null;
    const offset = __state.DAY_PREV2_RX.test(q) ? 2 : __state.DAY_YEST_RX.test(q) ? 1 : __state.DAY_TODAY_RX.test(q) ? 0 : null;
    if (offset == null) return null;
    if (__state.DAY_ASK_RX.test(q) || __state.bareDay(q)) return { offset };
    /* "venets d'hier" — the day word survived the typo, the takings word did
     * not. Correct once here, or the trend guard refuses a question we can
     * read: it owns "hier" and runs long before the corrector does. */
    const f = fuzz(q);
    return (f !== q && __state.DAY_ASK_RX.test(f)) ? { offset } : null;
  }

function periodWindow(q) {
    const now = new Date();
    const t0 = __state.midnight(0), day = __state.DAY_MS;
    if (__state.DAY_PREV2_RX.test(q)) return { id: 'prev2', from: t0 - 2 * day, to: t0 - day };
    if (__state.DAY_YEST_RX.test(q)) return { id: 'yesterday', from: t0 - day, to: t0 };
    if (__state.DAY_TODAY_RX.test(q)) return { id: 'today', from: t0, to: t0 + day };
    /* Deux jours nommés, c'est une comparaison, pas une fenêtre : on n'en
       choisit pas un au hasard. */
    const wd = __state.WEEKDAY_RX.filter((w) => w.rx.test(q));
    if (wd.length === 1) {
      const back = (new Date(t0).getDay() - wd[0].dow + 7) % 7;
      return { id: 'weekday', from: t0 - back * day, to: t0 - back * day + day };
    }
    const prev = __state.LAST_RX.test(q);
    if (__state.WEEK_RX.test(q) || __state.WEEK_AR_RX.test(q)) {
      const mon = t0 - ((new Date(t0).getDay() + 6) % 7) * day;   /* lundi = début */
      return prev ? { id: 'lastweek', from: mon - 7 * day, to: mon } : { id: 'week', from: mon, to: t0 + day };
    }
    if (__state.MONTH_RX.test(q)) {
      const y = now.getFullYear(), m = now.getMonth(), first = new Date(y, m, 1).getTime();
      return prev ? { id: 'lastmonth', from: new Date(y, m - 1, 1).getTime(), to: first }
                  : { id: 'month', from: first, to: t0 + day };
    }
    if (__state.YEAR_RX.test(q)) {
      const y = now.getFullYear(), first = new Date(y, 0, 1).getTime();
      return prev ? { id: 'lastyear', from: new Date(y - 1, 0, 1).getTime(), to: first }
                  : { id: 'year', from: first, to: t0 + day };
    }
    return null;
  }

function hoursSpec(q, raw) {
    if (__state.NOT_HOURS_RX.test(q)) return null;
    if (!__state.HOURS_RX.test(q) && !(__state.HOURS_EXC_RX.test(q) && /heure|horaire|hour|ساع/.test(q))) return null;
    if (__state.HOURS_UNTIL_RX.test(q)) return { entity: 'hours', agg: 'until', raw };
    if (__state.HOURS_EXC_RX.test(q)) {
      const m = /ramadan|ramdan|رمضان/.test(q) ? 'ramadan'
        : /\ba[iï]d\b|\beid\b|العيد/.test(q) ? 'aid'
        : /ferie|holiday|عطلة/.test(q) ? 'ferie' : '';
      return { entity: 'hours', agg: 'exception', term: m, raw };
    }
    /* « peut-on réserver demain à 21h » : une heure explicite ET un jour. */
    const hm = __state.HOURS_AT_RX.exec(q);
    if (hm && /\bdemain\b|\btomorrow\b|\baujourd|\btoday\b|\blundi\b|\bmardi\b|\bmercredi\b|\bjeudi\b|\bvendredi\b|\bsamedi\b|\bdimanche\b|\bmonday\b|\btuesday\b|\bwednesday\b|\bthursday\b|\bfriday\b|\bsaturday\b|\bsunday\b|غدا|اليوم/.test(q)) {
      const base = new Date();
      const DOWQ = [['dimanche', 'sunday', 'الأحد'], ['lundi', 'monday', 'الإثنين'], ['mardi', 'tuesday', 'الثلاثاء'],
                    ['mercredi', 'wednesday', 'الأربعاء'], ['jeudi', 'thursday', 'الخميس'],
                    ['vendredi', 'friday', 'الجمعة'], ['samedi', 'saturday', 'السبت']];
      let target = new Date(base.getFullYear(), base.getMonth(), base.getDate());
      if (/\bdemain\b|\btomorrow\b|غدا/.test(q)) target.setDate(target.getDate() + 1);
      else {
        for (let i = 0; i < 7; i++) {
          if (DOWQ[i].some((w) => q.indexOf(w) >= 0)) {
            const delta = (i - target.getDay() + 7) % 7 || 7;
            target.setDate(target.getDate() + delta);
            break;
          }
        }
      }
      target.setHours(+hm[1], +(hm[2] || 0), 0, 0);
      return { entity: 'hours', agg: 'at', when: target.getTime(), raw };
    }
    if (__state.HOURS_CLOSE_RX.test(q)) return { entity: 'hours', agg: 'close', raw };
    return { entity: 'hours', agg: 'open', raw };
  }

function matchLookupKind(q, raw) {
    /* Les horaires d'abord : ils portent des mots (« quelle heure »,
     * « combien de temps ») que les règles chiffrées attrapent sinon. */
    const hrs = hoursSpec(q, raw);
    if (hrs) return hrs;

    /* Products: a superlative plus something that names an item. "combien j'ai
     * vendu" has no superlative and stays a revenue question. */
    const sup = __state.SUP_TOP_RX.test(q) ? 'top' : __state.SUP_LOW_RX.test(q) ? 'bottom' : null;
    if (sup && __state.PRODUCT_RX.test(q) && !__state.CLIENT_TOP_RX.test(q) && !__state.STAFF_RX.test(q)) {
      return { entity: 'product', agg: sup, raw };
    }
    /* One client, by name: "combien de points a Salma Bennani". */
    if (__state.POINTS_RX.test(q) && !__state.NOT_POINTS_RX.test(q) && !__state.PRODUCT_RX.test(q)) return { entity: 'client', agg: 'points', raw };
    if (__state.CLIENT_TOP_RX.test(q)) return { entity: 'client', agg: 'top', raw };
    if (__state.DORMANT_RX.test(q) && /clients?\b|customers?\b|زب/.test(q)) return { entity: 'client', agg: 'dormant', raw };
    /* The team: headcount, or who is on today. */
    if (__state.ON_SHIFT_RX.test(q) && (__state.STAFF_RX.test(q) || /\bqui\b|\bwho\b|من\b/.test(q))) {
      return { entity: 'staff', agg: 'today', raw };
    }
    /* "combien coûte un serveur" is what a hire would cost, not how many I
     * have — the hiring simulation owns it. */
    if (__state.STAFF_RX.test(q) && !/\bcoute\w*|\bcout\b|\bcost\w*|\bembauch\w*|\brecrut\w*|\bhir(?:e|ing)\b|\bsalaire\b|يكلف|توظيف/.test(q)) {
      /* "qui est mon meilleur serveur" — no per-employee sales reach this
       * screen, so the module says so rather than let the hiring simulation
       * answer a question about people who already work here. */
      if (sup) return { entity: 'staff', agg: 'top', raw };
      if (/\bcombien\b|how\s+many|\bcount\b|\beffectif\b|كم|شحال/.test(q)) return { entity: 'staff', agg: 'count', raw };
    }
    /* Stock only when the merchant asks WHICH — "combien de références" is a
     * total and the stock scenario already answers it well. */
    if (__state.OUT_RX.test(q) && __state.WHICH_RX.test(q)) return { entity: 'stock', agg: 'out', raw };
    return null;
  }

function namedBusiness(raw) {
    const txt = String(raw);
    const shouting = txt === txt.toUpperCase() && /[A-ZÀ-Þ]{3}/.test(txt);
    const m = txt.match(shouting ? __state.NAMED_DATA_CAPS_RX : __state.NAMED_DATA_RX);
    if (!m) return null;
    const who = __state.norm(m[1]).trim();
    if (who.length < 3 || __state.PERIOD_WORD.test(who)) return null;
    return who;
  }

function within1(a, b) {
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0, j = 0, diff = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++diff > 1) return false;
      if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
    }
    return diff + (la - i) + (lb - j) <= 1;
  }

function transposed(a, b) {
    if (a.length !== b.length || a.length < 4) return false;
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    if (i >= a.length - 1) return false;
    if (a[i] !== b[i + 1] || a[i + 1] !== b[i]) return false;
    for (let j = i + 2; j < a.length; j++) if (a[j] !== b[j]) return false;
    return true;
  }

function fuzz(q) {
    return q.split(/(\s+)/).map((tok) => {
      if (!tok || /^\s+$/.test(tok) || /\d/.test(tok)) return tok;
      const w = tok.replace(/[^a-z']/g, '');
      if (!w) return tok;
      if (__state.SMS_ALIAS[w] != null) return tok.replace(w, __state.SMS_ALIAS[w]);
      if (w.length < 4) return tok;
      if (__state.FUZZ_LEX.indexOf(w) >= 0) return tok;
      // A truncated word: "gagn" → "gagne", "stoc" → "stock". Shortest wins.
      let pref = null;
      if (!__state.FUZZ_STOP[w]) {
        for (const k of __state.FUZZ_LEX) {
          if (k.length > w.length && k.indexOf(w) === 0 && (!pref || k.length < pref.length)) pref = k;
        }
      }
      if (pref) return tok.replace(w, pref);
      if (w.length >= 5 && !__state.FUZZ_STOP[w]) for (const k of __state.FUZZ_LEX) if (within1(w, k) || transposed(w, k)) return tok.replace(w, k);
      return tok;
    }).join('');
  }

function classify(q, raw) {
    const ctx = { pct: __state.parsePercent(raw), amt: parseAmount(raw) };
    const ranked = [];
    __state.INTENTS.forEach((it, idx) => {
      let s = 0;
      for (const pair of it.sig) if (pair[0].test(q)) s += pair[1];
      if (it.boost) s += it.boost(q, ctx);
      if (s > 0) ranked.push({ id: it.id, idx, score: s, run: it.run });
    });
    ranked.sort((a, b) => b.score - a.score || a.idx - b.idx);
    return ranked;
  }

function decideRoute(rawIn, retry) {
    const raw = __state.fixDigits(rawIn);
    const q = retry || __state.norm(raw);
    if (!retry) {
      const bare = q.replace(__state.GREET_LEAD, '');
      if (bare !== q && /[a-z0-9؀-ۿ]{2}/.test(bare)) {
        const sentence = bare.split(/\s+/).filter(Boolean).length >= 3 || bare.length >= 12;
        let handoff = null;
        for (const cand of [bare, fuzz(bare)]) {
          if (!cand) continue;
          const alt = decideRoute(rawIn, cand);
          if (alt.kind !== null && alt.kind !== 'unclear' && alt.kind !== 'greet') { alt.raw = raw; return alt; }
          if (alt.kind === null && sentence) handoff = alt;
        }
        /* Nothing here answers it, but a whole sentence followed the salutation
         * — hand it on rather than greeting over it. Decided AFTER the
         * spell-corrected attempt, or "bonjour, kombien je gagn" would be
         * handed off before the typo was ever corrected. */
        if (handoff) { handoff.raw = raw; return handoff; }
      }
    }
    /* Nothing to answer. Offering to download a 1,2 Go model because the
     * merchant hit Enter on an empty box is absurd; greet them instead. */
    if (!/[a-z0-9؀-ۿ]/.test(q)) return { kind: 'greet', raw, q, run: () => sHelp() };
    if (__state.looksLikeMath(raw)) {
      /* "1/0" reads as arithmetic but has no finite result. Saying so beats
       * falling through to a model that will answer something about zero. */
      return evalMath(raw) != null ? { kind: 'math', raw, q } : { kind: 'calcerr', raw, q };
    }
    /* ─── Guards, ahead of the classifier ───────────────────────────────
     * Each of these would otherwise score highly on some intent and return a
     * confident simulation of the wrong thing. They are checked here rather
     * than inside an intent because each has to beat EVERY intent, not one.
     * Order is deliberate: safety first, then explicit refusal by the
     * merchant, then "I don't have that" before anything gets computed. */
    /* ─── UNE FAUTE DE FRAPPE NE DÉSARME PAS UN GARDE ────────────────────
     * Le correcteur ne tournait qu'en tête de phrase (après une salutation)
     * et en tout dernier recours, quand plus rien n'avait matché. Une lettre
     * en moins au milieu suffisait donc à faire basculer une demande
     * dangereuse dans une route serviable : « aide-moi à ne pas délarer la
     * TVA » cessait d'être une demande de fraude et devenait une question de
     * comptabilité — Kiwi ouvrait la page au lieu de refuser.
     *
     * Les gardes de sûreté sont donc évalués sur la phrase ET sur sa version
     * corrigée. Le sens est à UNE SEULE direction : cela peut ajouter un
     * refus, jamais transformer un refus en réponse. Le reste du routage
     * n'y passe pas — corriger partout inventerait des intentions. */
    const qf = fuzz(q);
    const anyQ = (rx) => rx.test(q) || (qf !== q && rx.test(qf));
    if (anyQ(__state.INJECT_RX)) return { kind: 'inject', raw, q };
    if (anyQ(__state.ILLICIT_RX)) return { kind: 'illicit', raw, q };
    if (anyQ(__state.SECRET_RX)) return { kind: 'secret', raw, q };
    if (__state.MARKET_RX.test(q)) return { kind: 'market', raw, q };
    if (anyQ(__state.THEFT_RX)) return { kind: 'theft', raw, q };
    /* A dated closure is a holiday, not a bankruptcy — and STRAIN_RX owns
     * "je vais fermer". The duration is what tells them apart. */
    if (__state.CLOSE_RX.test(q) && parseDays(q) != null) return { kind: 'season', raw, q };
    if (__state.STRAIN_RX.test(q)) return { kind: 'runway', raw, q };
    if (__state.NEG_RX.test(q)) return { kind: 'negated', raw, q };
    if (__state.IDENTITY_RX.test(q)) return { kind: 'identity', raw, q };
    if (__state.CANTDO_RX.test(q)) return { kind: 'cantdo', raw, q };
    if (__state.FINANCE_RX.test(q)) return { kind: 'financing', raw, q };
    /* Write me / translate this / tell me a joke. These are the one thing the
     * model is genuinely better at, and a deterministic answer would be the
     * worse failure: "write a thank you note" was answered "avec plaisir". */
    if (__state.COMPOSE_RX.test(q)) return { kind: null, raw, q };
    /* Avant matchAction : « valide la commande 12 » nomme une destination
       (les commandes) autant qu'un ordre, et ouvrir la page serait une réponse
       à côté. Le verbe d'état tranche. */
    const op = __state.matchOperation(q);
    if (op) return { kind: 'operation', raw, q, op };
    const act = matchAction(q);
    if (act) return { kind: 'action', raw, q, action: act };
    if (__state.META_RX.test(q)) return { kind: 'meta', raw, q };
    if (anyQ(__state.LAYOFF_RX)) return { kind: 'layoff', raw, q };
    /* A lookup is stronger than a date: "le plat le plus vendu hier" is a
     * ranking question that happens to mention a day. */
    const look = __state.matchLookup(q, raw);
    if (look) return { kind: 'lookup', raw, q, spec: look };
    /* Ahead of TREND_RX, which owns "hier" and "yesterday" and would refuse
     * them as a comparison across periods. */
    const dNear = namedDay(q) || (qf !== q ? namedDay(qf) : null);
    if (dNear) return { kind: 'day', raw, q, day: dNear };
    if (__state.TREND_RX.test(q)) return { kind: 'notrend', raw, q };
    /* « effet de Raadan sur mes ventes » répondait par le chiffre d'affaires
       du mois : le mot Ramadan cassé, il ne restait que « ventes ». Une
       saisonnalité mal lue vaut un stock mal commandé. */
    if (anyQ(__state.EXTRA_DAY_RX) || anyQ(__state.SEASON_RX)) return { kind: 'season', raw, q };
    /* After the season guard, which owns "ouvrir le samedi" — opening an extra
     * day is a simulation, not a day that has already happened. */
    /* « les ventes de amedi » répondait par TOUT l'historique du commerce
       présenté comme un samedi — le pire des chiffres faux, celui qui a l'air
       juste. Le jour cassé est relu sur la phrase corrigée : la correction ne
       peut ici que RESSERRER la fenêtre, jamais l'élargir. */
    const dWeek = __state.namedWeekday(q) || (qf !== q ? __state.namedWeekday(qf) : null);
    if (dWeek) return { kind: 'day', raw, q, day: dWeek };
    /* "les chiffres de <Nom>" — their own business is a request for the
     * overview; anyone else's is a request this screen will not serve.
     * Checked after the season guard so "les ventes de Ramadan" is a period. */
    const named = namedBusiness(raw);
    if (named) return { kind: __state.namesOtherBusiness(raw) ? 'othershop' : 'overview', raw, q };
    /* Stock before valuation: "combien vaut mon stock" is an inventory
     * question, and VALUATION_RX owns "combien vaut mon…". */
    if (__state.STOCK_RX.test(q) && !(__state.BUY_RX.test(q) && parseAllAmounts(raw).some((v) => v >= 500))) {
      return { kind: 'stock', raw, q };
    }
    if (__state.VALUATION_RX.test(q) && !__state.WORKER_RX.test(q)) return { kind: 'valuation', raw, q };
    if (__state.EXPANSION_RX.test(q)) return { kind: 'expansion', raw, q };
    /* "combien de clients" is the client book; "combien de clients aujourd'hui"
     * is today's footfall, which a static 30-day window simply does not hold.
     * Answering the first for the second would be a confident wrong number. */
    if (__state.CLIENTS_RX.test(q)) {
      return /aujourd[' ]?hui|ce\s+matin|ce\s+soir|\btoday\b|this\s+(?:morning|evening)|اليوم/.test(q)
        ? { kind: 'scoped', raw, q } : { kind: 'clients', raw, q };
    }
    /* A goal needs a figure. "je veux gagner du temps" and "je veux faire 3
     * embauches" both matched the phrasing and neither is a profit target. */
    if (__state.GOAL_RX.test(q) && parseAllAmounts(raw).some((v) => v >= 500)) return { kind: 'goal', raw, q };
    if (__state.OVERVIEW_RX.test(q)) return { kind: 'overview', raw, q };
    if (__state.SCOPE_ENTITY_RX.test(q)) return { kind: 'scoped', raw, q };
    if (__state.SCOPE_ITEM_RX.test(q) && !__state.WORKER_RX.test(q) && !__state.ADD_VERB.test(q) && !__state.OPEX_NOUN_RX.test(q)) {
      return { kind: 'scoped', raw, q };
    }
    const ranked = classify(q, raw);
    /* Out of domain — but only once nothing in-domain has answered strongly.
     * As an early guard this fired on "ma femme travaille au café, je la paie
     * combien", a payroll question that happens to mention a wife. */
    if (!(ranked.length && ranked[0].score >= 3) && __state.OUTSIDE_RX.test(q)) return { kind: 'outside', raw, q };
    /* A qualifier like "sur le thé à la menthe" or "le samedi" only matters
     * when the winning intent reports a GLOBAL total — handing back the
     * whole-business margin as if it were one product's is the failure. */
    /* Et le qualificatif casse à la moindre faute : « combien je fais le
       endredi » perdait son vendredi et repartait avec le chiffre d'affaires
       entier. Relu sur la phrase corrigée — là encore, la correction ne peut
       que RESSERRER la portée, jamais l'élargir. */
    if (ranked.length && __state.GLOBAL_SCENARIOS[ranked[0].id] && anyQ(__state.SCOPE_QUAL_RX)) {
      return { kind: 'scoped', raw, q };
    }
    /* "je monte les tarifs de 10% et je prends un serveur" is two decisions, but
     * "un serveur" alone only ever scores 2 — demanding 3 from both halves made
     * the compound sim unreachable for the way owners actually phrase it. */
    const combos = ranked.filter((r) => (r.id === 'hire' || r.id === 'price') && r.score >= 2);
    if (combos.length >= 2 && __state.CONJ_RX.test(' ' + q + ' ')) return { kind: 'compound', raw, q };
    /* "ma marge et mon seuil de rentabilité et combien je gagne par jour" is
     * three questions in one message. A single-intent router answered one and
     * silently dropped two; the four-figure overview answers all of them. */
    const infos = ranked.filter((r) => __state.INFO_SCENARIOS[r.id] && r.score >= 3);
    if (infos.length >= 2 && __state.CONJ_RX.test(' ' + q + ' ')) return { kind: 'overview', raw, q };
    // Conversational refinement: a correction carrying a new number right after an
    // amount-driven scenario re-runs THAT scenario ("non ça va nous coûter 3000 dh",
    // "plutôt 5000", "et à 4000 ?") — unless the message states a new strong intent.
    const strong = ranked.length && ranked[0].score >= 3;
    /* "et avec la CNSS ça fait combien" scores 3 on `accounting` (RX_ACCT owns
     * "cnss"), so the generic !strong guard below sent it to the accounting
     * blurb. Right after a hire it is unambiguously a refinement of that hire,
     * so it is allowed to win. Kept deliberately narrow — it needs the refine
     * lead AND a loaded-cost word AND hire as the last scenario. */
    if (__state.lastScenario === 'hire' && __state.LOADED_RX.test(q) && __state.REFINE_LEAD.test(q)) {
      const hi = __state.INTENTS.find((i) => i.id === 'hire');
      if (hi) return { kind: 'hire', raw, q, run: hi.run, refine: true };
    }
    if (__state.lastScenario && !strong && __state.isRefinement(raw, q)) {
      if (__state.lastScenario === 'compound') return { kind: 'compound', raw, q, refine: true };
      const it = __state.INTENTS.find((i) => i.id === __state.lastScenario);
      if (it) return { kind: __state.lastScenario, raw, q, run: it.run, refine: true };
    }
    /* « puis-je me permettre un erveur de plus » : le poste cassé, il restait
       une question générique de capacité d'achat, et l'assistant répondait sur
       un montant au lieu de chiffrer un salaire chargé. Deux réponses, deux
       décisions. Si la phrase corrigée nomme un poste que la phrase tapée ne
       nommait pas, c'est une embauche. */
    if (ranked.length && ranked[0].id === 'afford' && !__state.WORKER_RX.test(q) && qf !== q && __state.WORKER_RX.test(qf)) {
      const hi = __state.INTENTS.find((i) => i.id === 'hire');
      if (hi) return { kind: 'hire', raw, q, run: hi.run };
    }
    if (ranked.length && ranked[0].score >= __state.MIN_SCORE) return { kind: ranked[0].id, raw, q, run: ranked[0].run };
    /* Thanks — but only once every intent has had its chance and lost. "merci,
     * et ma marge ?" is a margin question that happens to be polite, and a
     * word-count heuristic answered it with "avec plaisir". */
    if (__state.THANKS_RX.test(q)) return { kind: 'thanks', raw, q };
    if (evalMath(raw) != null) return { kind: 'math', raw, q };
    /* Nothing matched. If it reads as Darija, answering honestly beats handing
     * it to a model that invents dirham figures in this exact register. */
    const ownEarly = __state.matchOwnData(q);
    if (ownEarly) return { kind: 'nodata', raw, q, action: ownEarly };
    if (__state.DARIJA_RX.test(q)) return { kind: 'unclear', raw, q };
    /* Last resort before giving up: retry once on the spell-corrected form.
     * Only reached when the query as typed matched nothing, so this can only
     * turn a non-answer into an answer, never overwrite a good route. */
    if (!retry) {
      const f = fuzz(q);
      if (f !== q) {
        const alt = decideRoute(rawIn, f);
        if (alt.kind !== null && alt.kind !== 'unclear') { alt.raw = raw; return alt; }
      }
    }
    /* Their own data, no scenario for it: name the page and open it. Never
     * the model — it has never seen this shop and can only deflect or invent. */
    const own = __state.matchOwnData(q);
    if (own) return { kind: 'nodata', raw, q, action: own };
    if (__state.isNoise(q)) return { kind: 'unclear', raw, q };
    return { kind: null, raw, q };
  }

function featureCanTake(raw, decided) {
    try {
      const guide = window.KiwiFeatureGuide;
      if (!guide || !guide.canHandle(raw)) return false;
      if (guide.isPending && guide.isPending()) return !decided || decided.kind !== 'illicit';
      if (!decided || decided.kind === null) return true;
      if (decided.kind === 'help' || decided.kind === 'greet') return true;
      if (decided.kind === 'price') {
        const priceQ = __state.norm(__state.fixDigits(raw));
        return !/[\d%]/.test(priceQ) && (/(?:ou|where).{0,24}(?:modifier|change|edit|renomm)/.test(priceQ)
          || /(?:configur|parametr|setup).{0,24}(?:service|tarif|price|prix)/.test(priceQ));
      }
      /* Stock/client words are also data intents. "How many customers?" must
       * return the ledger count; "how do I configure loyalty?" needs the
       * product guide. No feature explainer may outrank finance, permissions,
       * action routing or the integrity refusal. */
      if (decided.kind !== 'stock' && decided.kind !== 'clients') return false;
      const q = __state.norm(__state.fixDigits(raw));
      if (/\b(?:combien|how many|how much|total|nombre|aujourd|today|this month|ce mois|right now|maintenant)\b/.test(q)) return false;
      return /\b(?:configur|parametr|activer|utiliser|integr|comment fonctionne|how (?:does|to)|ou (?:modifier|regler)|where (?:to|can))\b/.test(q);
    } catch (_) { return false; }
  }

function respond(rawIn) {
    __state.syncProfile();  // reason off whatever venue is active right now
    try {
      const briefing = window.KiwiBriefing;
      if (briefing && briefing.canHandle && briefing.canHandle(rawIn)) {
        __state.lastRouteKind = 'briefing';
        return briefing.reply(rawIn, { lang: detectQLang(rawIn), role: __state.accessTier() });
      }
    } catch (_) {}
    const d = decideRoute(rawIn);
    /* Operational state has its own deterministic lane. It runs before the
     * feature explainer and the finance model, but never before integrity or a
     * restricted-books route. Thus “combien de commandes pressing sont en
     * retard ?” cannot become a finance question, and “comment fonctionne le
     * pressing ?” remains a product explanation rather than a fake live read. */
    try {
      const ops = window.KiwiAgentOps;
      if (ops && d.kind !== 'illicit' && !__state.BOOKS_ROUTES[d.kind] && ops.canHandle(rawIn)) {
        const operational = ops.reply(rawIn, { lang: detectQLang(rawIn), role: __state.accessTier() });
        if (operational) { __state.lastRouteKind = 'ops-' + (window.KiwiFeatureTruth && window.KiwiFeatureTruth.intent ? window.KiwiFeatureTruth.intent(rawIn) : 'live'); return operational; }
      }
    } catch (_) {}
    /* Product questions must not fall through to the generic finance model.
     * The guide reads the same trade/workspace registries as the dashboard, so
     * it explains only features this merchant actually owns and hands setup
     * back to the real validated page. */
    try {
      const guide = window.KiwiFeatureGuide;
      if (guide && featureCanTake(rawIn, d)) {
        const guided = guide.reply(rawIn, { lang: detectQLang(rawIn), role: __state.accessTier() });
        if (guided) { __state.lastRouteKind = 'feature'; return guided; }
      }
    } catch (_) {}
    __state.lastRouteKind = d.kind === null ? 'llm' : d.kind;
    /* Permission is checked BEFORE the scenario runs — a refusal must never be
     * computed from figures this reader is not allowed to see, or the numbers
     * end up in the object even when the sentence declines. */
    if (__state.BOOKS_ROUTES[d.kind] && !__state.seesBooks()) return __state.sForbidden();
    /* And by TOPIC, not only by route. "Quelle est ma trésorerie" does not
     * match a scenario cleanly, so it fell through to the model — where the
     * restricted prompt withholds the books, but the merchant gets a vague
     * paragraph instead of a straight answer about why. One vocabulary, one
     * reply, whichever way the question is phrased. Owners never reach this
     * line, so routing for them is untouched. */
    if (!__state.seesBooks() && __state.BOOKS_TOPIC_RX.test(__state.norm(__state.fixDigits(rawIn)))) return __state.sForbidden();
    /* The staff badge has no Équipe page; it gets no roster lookups either —
     * and no client book. Both by route and by topic: a name, a spend and a
     * phone number are the same disclosure whichever sentence carries them. */
    if (d.kind === 'lookup' && d.spec && __state.accessTier() === 'staff'
        && (d.spec.entity === 'staff' || d.spec.entity === 'client')) return __state.sForbidden('data');
    if (__state.accessTier() === 'staff') {
      const nq = __state.norm(__state.fixDigits(rawIn));
      if (__state.CONTACT_RX.test(nq) && __state.CLIENT_WORD_RX.test(nq)) return __state.sForbidden('data');
    }
    // Remember amount-driven scenarios so the next correction can refine them.
    if (d.kind === 'hire' || d.kind === 'afford' || d.kind === 'price' || d.kind === 'compound') __state.lastScenario = d.kind;
    if (d.kind === 'math') return sCalc(d.raw, evalMath(d.raw));
    if (d.kind === 'action') return __state.sAction(d.action);
    if (d.kind === 'operation') return sOperation(d.op, d.raw);
    if (d.kind === 'compound') return sCompound(d.raw);
    if (d.kind === 'illicit') return __state.sIllicit();
    if (d.kind === 'negated') return __state.sNegated();
    if (d.kind === 'meta') return __state.sMeta();
    if (d.kind === 'layoff') return __state.sLayoff();
    if (d.kind === 'scoped') return __state.sScoped();
    if (d.kind === 'lookup') return sLookup(d.spec);
    if (d.kind === 'day') return sDay(d.day);
    if (d.kind === 'notrend') return __state.sNoTrend();
    if (d.kind === 'unclear') return __state.sUnclear();
    if (d.kind === 'runway') return sRunway();
    if (d.kind === 'market') return __state.sMarket();
    if (d.kind === 'secret') return __state.sSecret();
    if (d.kind === 'season') return sSeason(d.q);
    if (d.kind === 'goal') return sGoal(d.q);
    if (d.kind === 'stock') return sStock();
    if (d.kind === 'clients') return sClients();
    if (d.kind === 'overview') return sOverview();
    if (d.kind === 'financing') return sFinancing();
    if (d.kind === 'expansion') return sExpansion();
    if (d.kind === 'valuation') return sValuation();
    if (d.kind === 'theft') return __state.sTheft();
    if (d.kind === 'thanks') return __state.sThanks();
    if (d.kind === 'identity') return __state.sIdentity();
    if (d.kind === 'outside') return __state.sOutside();
    if (d.kind === 'cantdo') return __state.sCantDo();
    if (d.kind === 'inject') return __state.sInject();
    if (d.kind === 'othershop') return __state.sOtherShop();
    if (d.kind === 'calcerr') return __state.sCalcErr();
    if (d.kind === 'nodata') return __state.sNoData(d.action);
    if (d.kind === null) return null;  // unmatched → routed to the in-browser LLM
    return d.run(d.raw, d.q);
  }

function runEval() {
    __state.lastScenario = null;  // stateless harness — never inherit conversation context
    /* tools/agent-corpus.js carries 830 more merchant questions in fr / en / ar
     * / darija. No page references it, so it costs a merchant nothing to load
     * the dashboard; add the script beside this one and the same call runs the
     * full 1 000-case set instead of the 170 that ship here. */
    const extra = (typeof window !== 'undefined' && window.KiwiAgentCorpus) || [];
    const set = extra.length ? __state.EVAL_SET.concat(extra) : __state.EVAL_SET;
    const fails = [];
    set.forEach((row) => { const got = __state.routeLabel(row[0]); if (got !== row[1]) fails.push({ q: row[0], expected: row[1], got }); });
    const pass = set.length - fails.length;
    return { total: set.length, pass, accuracy: Math.round(pass / set.length * 1000) / 10, fails };
  }

function runConvoTest() {
    const cases = [];
    const check = (setup, q, expected) => { __state.lastScenario = setup; const got = __state.routeLabel(q); cases.push({ q, expected, got, ok: got === expected }); };
    check('hire', 'non ça va nous coûter 3000 dh par mois', 'hire');
    check('hire', 'plutôt 5000', 'hire');
    check('hire', 'et à 4000 ?', 'hire');
    check('afford', 'non plutôt 90000', 'afford');
    check('hire', "et si j'augmente les prix de 5%", 'price'); // new strong intent wins
    check('hire', 'montre mes charges', 'charges');            // no number → not a refinement
    /* The two commonest hiring follow-ups, both dead before: neither carries a
     * digit, so the old isRefinement (which required one) sent "deux" to the
     * model and "CNSS" to the accounting blurb (RX_ACCT owns that word). */
    check('hire', "et si j'en prends deux", 'hire');
    check('hire', 'et avec la CNSS ça fait combien', 'hire');
    check('price', 'non', 'llm');                              // correction without a number can't hijack
    check(null, 'ça va aujourd’hui ?', 'llm');                 // standalone "ça va" is not revenue
    __state.lastScenario = null;
    const fails = cases.filter((c) => !c.ok);
    return { total: cases.length, pass: cases.length - fails.length, fails };
  }

function runGuardTest() {
    const cases = [];
    const t = (name, ok) => cases.push({ name, ok: !!ok });
    t('extract integer MAD', JSON.stringify(extractMad('TVA à payer 38 309 MAD')) === '[38309]');
    t('extract decimal MAD', JSON.stringify(extractMad('total 1 234,50 MAD')) === '[1234.5]');
    t('extract dh suffix', extractMad('café 15 dh')[0] === 15);
    t('ignore bare percent', extractMad('marge 22,3%').length === 0);
    t('grounding figure passes', auditNumbers('votre chiffre d’affaires est 842 300 MAD').uncited.length === 0);
    t('rounded restatement passes', auditNumbers('environ 842 000 MAD').uncited.length === 0);
    t('fabricated figure flagged', auditNumbers('vous gagnez 999 000 MAD ce mois').uncited.length === 1);
    /* Les taux légaux — contrôle à sens unique : on retire l'impossible, on ne
       certifie pas le plausible, et on renvoie à la source officielle. */
    const R = (s) => redactUnsupported(s, 'fr');
    t('impossible VAT rate removed', /retiré/.test(R('La TVA au Maroc est de 25 %.').text));
    t('legal VAT rate survives', !/retiré/.test(R('La TVA au Maroc est de 20 %.').text));
    t('a rate answer carries the verification caveat', !!R('La TVA est de 20 %.').caveat);
    t('no caveat when no rate is named', !R('Votre panier moyen est de 142 MAD.').caveat);
    t('impossible minimum wage removed', /retiré/.test(R('Le SMIG est de 900 MAD par mois.').text));
    t('plausible minimum wage survives', !/retiré/.test(R('Le SMIG est de 3 111 MAD par mois.').text));
    t('impossible CNSS rate removed', /retiré/.test(R('La CNSS coûte 60 % du salaire.').text));
    t('an English sentence is not read as a corporate-tax rate',
      !/removed|retiré/.test(redactUnsupported('This is 42 % better than before.', 'en').text));
    const fails = cases.filter((c) => !c.ok);
    return { total: cases.length, pass: cases.length - fails.length, fails };
  }

function llmChunkText(o) {
    if (!o || typeof o !== 'object') return '';
    if (typeof o.response === 'string' && o.response) return o.response;
    var c = Array.isArray(o.choices) && o.choices[0];
    if (!c) return '';
    var d = c.delta || c.message || null;
    if (d && typeof d.content === 'string' && d.content) return d.content;
    return '';
  }

function stripThink(s) {
    return String(s)
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<think>[\s\S]*$/i, '')
      /* gpt-oss met les chiffres en **gras** et titre en ### : une bulle de
       * chat n'est pas une page markdown. On retire la syntaxe, pas le texte. */
      .replace(/\*\*/g, '')
      .replace(/^#{1,4}\s+/gm, '')
      .replace(/^\s+/, '');
  }

function noteTurnEvidence(name, args, out) {
    if (!out || out.error || out.available === false) return;
    const sourceByTool = { sales_between: 'KiwiSales.totals', top_products: 'KiwiSales.list', stock_level: 'catalogue stock', stock_summary: 'registre stock', tables_now: 'plan de salle', reservations_today: 'réservations du plan', orders_open: 'commandes ouvertes' };
    const openByTool = { sales_between: 'nav-ventes', top_products: 'nav-ventes', stock_level: 'nav-stock', stock_summary: 'nav-stock', tables_now: 'nav-plan-salle', reservations_today: 'nav-reservations', orders_open: 'nav-commandes' };
    const source = String(out.source || sourceByTool[name] || '');
    if (!source) return;
    const period = args && args.from ? (args.from + (args.to && args.to !== args.from ? ' → ' + args.to : '')) : '';
    const volume = out.tickets != null ? String(out.tickets) + ' tickets' : Array.isArray(out.items) ? String(out.items.length) + ' lignes' : Array.isArray(out.orders) ? String(out.orders.length) + ' commandes' : '';
    const key = [source, period, volume].join('|');
    if (__state.TURN_EVIDENCE.some((x) => x.key === key)) return;
    __state.TURN_EVIDENCE.push({ key, source, period, volume, open: openByTool[name] || '' });
  }

function noteTurnFacts(anything) {
    let str = '';
    try { str = typeof anything === 'string' ? anything : JSON.stringify(anything || ''); } catch (_) { str = String(anything || ''); }
    str = str.replace(/<[^>]+>/g, ' ');
    const seen = str.match(/\d[\d  . ]*(?:[.,]\d+)?/g) || [];
    seen.forEach((raw) => {
      const a = parseFloat(String(raw).replace(/[\s  . ]/g, '').replace(',', '.'));
      const b = parseFloat(String(raw).replace(/[\s  ]/g, '').replace(/,/g, ''));
      [a, b].forEach((v) => {
        if (!isFinite(v)) return;
        __state.TURN_FACTS.money.add(Math.round(v));
        __state.TURN_FACTS.counts.add(Math.round(v));
        __state.TURN_FACTS.pct.add(Math.round(v * 10) / 10);
      });
    });
  }

function runTool(name, args) {
    const a = args && typeof args === 'object' ? args : {};
    const S = window.KiwiSales, T = window.KiwiAgentTruth;
    const vid = (window.KiwiVenue && window.KiwiVenue.getCurrentVenueId) ? window.KiwiVenue.getCurrentVenueId() : undefined;
    try {
      if (name === 'sales_between' || name === 'top_products') {
        if (!__state.TOOL_DATE_RX.test(a.from || '') || !__state.TOOL_DATE_RX.test(a.to || '')) return { error: 'dates YYYY-MM-DD requises' };
        const lo = __state.toolDayBounds(a.from).from, hi = __state.toolDayBounds(a.to).to;
        if (!S || !S.totals) return { error: 'ventes indisponibles' };
        if (name === 'sales_between') {
          const t = S.totals(vid, lo, hi);
          return { from: a.from, to: a.to, total_mad: Math.round(t.revenue * 100) / 100, tickets: t.count, basket_mad: Math.round(t.basket * 100) / 100, source: 'KiwiSales.totals', day_cutoff: '5h' };
        }
        const by = Object.create(null);
        (S.list ? S.list(vid) : []).forEach((x) => {
          const ts = +(x && x.ts) || 0; if (ts < lo || ts >= hi || !Array.isArray(x.lines)) return;
          x.lines.forEach((l) => { const k = String(l.name || 'Article'); const o = by[k] || (by[k] = { name: k, qty: 0, total_mad: 0 }); o.qty += +l.qty || 0; o.total_mad += +l.total || 0; });
        });
        const n = Math.max(1, Math.min(10, parseInt(a.n, 10) || 5));
        const rows = Object.values(by).sort((x, y) => y.qty - x.qty).slice(0, n).map((o) => ({ name: o.name, qty: Math.round(o.qty * 1000) / 1000, total_mad: Math.round(o.total_mad * 100) / 100 }));
        return { from: a.from, to: a.to, items: rows, source: 'KiwiSales.list', note: rows.length ? undefined : 'aucune ligne détaillée sur la période' };
      }
      if (name === 'stock_summary') { const r = T && T.read ? T.read('inventory') : null; return r && r.available ? { source: r.source, data: r.data } : { available: false }; }
      if (name === 'tables_now') { const r = T && T.read ? T.read('tables') : null; return r && r.available ? { source: r.source, data: r.data } : { available: false }; }
      if (name === 'reservations_today') { const r = T && T.read ? T.read('reservations') : null; return r && r.available ? { source: r.source, data: r.data, limited: !!r.limited } : { available: false }; }
      if (name === 'stock_level') {
        const q = __state.toolNorm(a.query); if (!q) return { error: 'query requise' };
        const pools = [];
        try { if (window.KiwiRestaurantStock && window.KiwiRestaurantStock.items) pools.push(window.KiwiRestaurantStock.items() || []); } catch (_) {}
        try { if (window.KiwiBoutiqueCatalog && window.KiwiBoutiqueCatalog.listProducts) pools.push(window.KiwiBoutiqueCatalog.listProducts() || []); } catch (_) {}
        const hits = [];
        pools.forEach((rows) => (Array.isArray(rows) ? rows : []).forEach((it) => {
          const nm = String((it && (it.name || it.label || it.title)) || ''); const nn = __state.toolNorm(nm); if (!nn) return;
          const score = nn === q ? 3 : nn.indexOf(q) >= 0 ? 2 : q.split(' ').every((w) => nn.indexOf(w) >= 0) ? 1 : 0;
          if (!score) return;
          const stock = [it.stock, it.qty, it.quantity, it.onHand].find((v) => typeof v === 'number');
          hits.push({ id: String((it && it.id) || ''), name: nm, stock: stock == null ? null : stock, unit: it.unit || it.stockUnit || '', threshold: it.threshold == null ? undefined : it.threshold, score });
        }));
        hits.sort((x, y) => y.score - x.score);
        return { query: a.query, found: hits.length > 0, items: hits.slice(0, 5).map((h) => { delete h.score; return h; }) };
      }
      if (name === 'orders_open') {
        const I = window.KiwiOrderInbox; if (!I || typeof I.orders !== 'function') return { available: false };
        const raw = I.orders() || {}; const rows = Array.isArray(raw) ? raw : Object.keys(raw).map((k) => raw[k]);
        const open = rows.filter((o) => o && !/^(served|rejected|cancelled|closed)$/.test(String(o.status || ''))).slice(0, 20)
          .map((o) => ({ id: String(o.id || ''), number: o.number == null ? undefined : o.number, status: String(o.status || ''), total_mad: o.total == null ? undefined : +o.total, table: o.table || o.tableNum || undefined }));
        return { available: true, orders: open };
      }
      if (name === 'propose_action') {
        const A = window.KiwiAgentActions;
        if (!A || typeof A.request !== 'function') return { error: 'actions indisponibles' };
        const act = String(a.name || '');
        if (!__state.ACTION_NAME_RX.test(act)) return { error: 'action inconnue' };
        const args = Object.assign({}, a.args && typeof a.args === 'object' ? a.args : {});
        const summary = String(a.summary || '').slice(0, 200);
        args.said = summary || act;
        /* Un id de commande par proposition : le sas d'idempotence de
         * KiwiAgentActions est à lui — on ne le contourne pas, on le nourrit. */
        args.commandId = 'llm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        const req = A.request(act, args);
        if (!req || !req.ok) return { proposed: false, action: act, reason: (req && req.reason) || 'refused' };
        if (req.replayed) return (req.result && req.result.outcome === 'draft-opened')
          ? { executed: false, draft_opened: true, sent: false, replayed: true, action: act }
          : { executed: true, replayed: true, action: act, result: req.result };
        if (__state.autoActOn()) {
          let res;
          try { res = A.confirm(req.token); } catch (_) { return { executed: false, action: act, summary, reason: 'failed' }; }
          /* A WhatsApp draft is opened, never sent: reporting it as executed let
             the model say « message envoyé ». Its own state goes back as is. */
          const shape = (r) => (r && r.outcome === 'draft-opened')
            ? { executed: false, draft_opened: true, sent: false, action: act, summary, note: 'Brouillon ouvert dans WhatsApp, non envoyé par Kiwi.' }
            : { executed: !!(r && r.ok), action: act, summary, result: r };
          if (res && typeof res.then === 'function') return res.then(shape, () => ({ executed: false, action: act, summary, reason: 'failed' }));
          return shape(res);
        }
        __state.LLM.proposals.push({ token: req.token, action: act, summary, args: req.summary });
        return { proposed: true, action: act, summary, awaiting_confirmation: true, note: 'Le commerçant doit confirmer par le bouton affiché sous la réponse.' };
      }
    } catch (e) { return { error: 'lecture impossible' }; }
    return { error: 'outil inconnu' };
  }

function extractMad(text) {
    const out = [];
    const re = /(\d[\d  .  ]*(?:,\d+)?)\s*(?:mad|dhs?|dirhams?|درهم|د\.?\s?م)\b/gi;
    for (const m of String(text).matchAll(re)) {
      const n = parseFloat(m[1].replace(/[  .  ]/g, '').replace(',', '.'));
      if (isFinite(n)) out.push(n);
    }
    return out;
  }

function knownFigures() {
    const s = new Set();
    const add = (n) => { if (typeof n === 'number' && isFinite(n)) s.add(Math.round(n)); };
    /* A reader without the books has no cited books figures. So if the model
     * produces one anyway — from a stale context, from a guess that happens to
     * land — the redactor removes it instead of waving it through as "known".
     * Defence in depth: the prompt already withholds them. */
    if (!__state.B.partial && __state.seesBooks()) {
      [__state.B.revenue, __state.B.cogs, __state.B.grossProfit, __state.B.totalOpex, __state.B.netProfit, __state.B.cashBuffer, __state.B.avgBasket,
       __state.B.dailyRev, __state.B.dailyNet, __state.B.netPerOrder, __state.B.breakEvenRev, __state.B.mtdRevenue,
       __state.B.revenue * 12, __state.B.netProfit * 12].forEach(add);
      Object.values(__state.B.opex || {}).forEach(add);
    } else {
      [__state.B.revenue, __state.B.avgBasket].forEach(add);
    }
    (window.KiwiVenue && window.KiwiVenue.getMenuItems ? window.KiwiVenue.getMenuItems() : []).forEach((it) => add(it.price));
    Object.values(window.__kiwiFeedOrders || {}).forEach((o) => add(o.amtRaw != null ? o.amtRaw
      : parseFloat(String(o.total || o.amt || '').replace(/[  .  ]/g, '').replace(',', '.'))));
    const sim = window.KiwiDemoClock && window.KiwiDemoClock.getSimState && window.KiwiDemoClock.getSimState();
    if (sim) add(sim.cumRevenue);
    return s;
  }

function auditNumbers(text) {
    const known = Array.from(knownFigures());
    const uncited = [];
    for (const v of extractMad(text)) {
      if (v < 100) continue;
      const cited = known.some((k) => Math.abs(k - v) <= Math.max(50, v * 0.01));
      if (!cited) uncited.push(v);
    }
    return { uncited };
  }

function knownPercents() {
    const s = new Set();
    const add = (n) => { if (typeof n === 'number' && isFinite(n)) s.add(Math.round(n * 10) / 10); };
    if (!__state.B.partial) {
      [__state.B.grossMargin, __state.B.netMargin, 100 - __state.B.grossMargin, __state.B.contribRatio * 100, __state.B.marginOfSafety].forEach(add);
      return s;
    }
    try {
      const rows = __state.ledger();
      if (!rows.length) return s;
      /* Le mix de paiement, part par part — et son complément, parce que
         « 60 % en espèces » et « 40 % par carte » disent la même chose. */
      const byMethod = {}; let tot = 0;
      rows.forEach((e) => {
        const amt = Math.max(0, +((e && e.amount) || 0));
        if (!amt) return;
        tot += amt;
        const m = String((e && (e.method || e.m)) || 'autre').toLowerCase();
        byMethod[m] = (byMethod[m] || 0) + amt;
      });
      if (tot > 0) Object.keys(byMethod).forEach((m) => { const p = byMethod[m] / tot * 100; add(p); add(100 - p); });
      /* La croissance d'un mois sur l'autre — la seule tendance qu'un journal
         de ventes suffit à établir. */
      const { cur, prev: prevStart } = __state.monthEdges();
      let a = 0, b = 0;
      rows.forEach((e) => {
        const ts = +((e && e.ts) || 0), amt = Math.max(0, +((e && e.amount) || 0));
        if (ts >= cur) a += amt; else if (ts >= prevStart) b += amt;
      });
      if (b > 0) { const g = (a - b) / b * 100; add(g); add(-g); }
      /* La complétude du panier : quelle part des tickets porte son détail.
         C'est une proportion que l'assistant énonce lui-même en provenance. */
      const lined = rows.filter((e) => e && Array.isArray(e.lines) && e.lines.length).length;
      add(lined / rows.length * 100);
      add(100 - lined / rows.length * 100);
    } catch (_) { /* un garde-fou ne tombe pas parce qu'une lecture a échoué */ }
    return s;
  }

function knownCounts(kind) {
    const s = new Set();
    const add = (n) => { if (typeof n === 'number' && isFinite(n)) s.add(Math.round(n)); };
    [__state.B.daysOpen, __state.B.mtdDays, __state.B.daysInMonth].forEach(add);   // calendar, always fair
    if (kind === 'sale') [__state.B.ordersPerMonth, __state.B.ordersPerDay].forEach(add);
    if (kind === 'staff') add(__state.B.staffCount);
    if (kind === 'item') {
      try {
        (window.KiwiMenu && window.KiwiMenu.items ? window.KiwiMenu.items() : []).forEach((it) => add(it.units));
      } catch (_) {}
    }
    if (kind === 'customer') {
      try {
        const KC = window.KiwiClients;
        if (KC && KC.count) add(KC.count());
        if (KC && KC.list) add((KC.list() || []).length);
      } catch (_) {}
    }
    return s;
  }

function redactUnsupported(text, lang) {
    const L2 = __state.REDACTED[lang] ? lang : 'fr';
    const mark = __state.REDACTED[L2];
    let n = 0, rateSeen = false;
    try {
      const knownM = Array.from(knownFigures()).concat(Array.from(__state.TURN_FACTS.money));
      const knownP = Array.from(knownPercents()).concat(Array.from(__state.TURN_FACTS.pct));
      const citedM = (v) => knownM.some((k) => Math.abs(k - v) <= Math.max(50, v * 0.01));
      const citedP = (v) => knownP.some((k) => Math.abs(k - v) <= 0.6);
      /* Per namespace: a dish sold 312 times does not make 312 CLIENTS a
       * figure we hold. */
      const citedC = (v, kind) => Array.from(knownCounts(kind)).concat(Array.from(__state.TURN_FACTS.counts)).some((k) => Math.abs(k - v) <= Math.max(1, v * 0.01));
      const num = (raw) => parseFloat(String(raw).replace(/[\s  . ]/g, '').replace(',', '.'));

      /* Sentence by sentence — "is this a hypothesis?" is only answerable
       * inside the clause that carries the number. */
      const out = String(text).split(/(?<=[.!?\n؟])/).map((clause) => {
        let c = clause;
        const claim = __state.METRIC_RX.test(c) && !__state.HYPO_RX.test(c);
        const rate = __state.RATE_RX.test(c);
        const wage = rate && __state.SMIG_RX.test(c);
        if (rate) rateSeen = true;

        // a · money, always checkable — sauf le SMIG, qui n'est pas un montant
        //     de CE commerce et relève du contrôle d'enveloppe ci-dessous.
        if (!wage) {
          c = c.replace(/(\d[\d  . ]*(?:,\d+)?)\s*(mad|dhs?|dirhams?|درهم|د\.?\s?م)\b/gi, (m, d, unit) => {
            const v = num(d);
            if (!isFinite(v) || v < 100 || citedM(v)) return m;
            n++; return mark + ' ' + unit;
          });
        } else {
          c = c.replace(/(\d[\d  . ]*(?:,\d+)?)\s*(mad|dhs?|dirhams?|درهم|د\.?\s?م)\b/gi, (m, d, unit) => {
            const v = num(d);
            if (!isFinite(v) || !__state.smigImpossible(v, c)) return m;
            n++; return mark + ' ' + unit;
          });
        }

        // a-bis · les taux légaux, contrôle à sens unique (voir RATE_BAND).
        //   Hors METRIC_RX à dessein : « la TVA au Maroc est de 25 % » ne
        //   nomme aucune métrique du commerce et passait donc intact.
        if (rate) {
          const band = __state.RATE_BAND.filter((b) => b.rx.test(c));
          if (band.length) {
            c = c.replace(/(\d+(?:[.,]\d+)?)\s*(%|٪)/g, (m, d, unit) => {
              const v = parseFloat(String(d).replace(',', '.'));
              if (!isFinite(v) || band.some((b) => b.ok(v))) return m;
              n++; return mark + ' ' + unit;
            });
          }
        }
        if (!claim) return c;

        // b · percentages asserted about a metric
        c = c.replace(/(\d+(?:[.,]\d+)?)\s*(%|٪|pour\s?cent|percent)/gi, (m, d, unit) => {
          const v = parseFloat(String(d).replace(',', '.'));
          if (!isFinite(v) || citedP(v)) return m;
          n++; return mark + ' ' + unit;
        });

        // c · counts in front of a countable business noun
        c = c.replace(new RegExp('(\\d[\\d  . ]*)\\s+((?:[a-zà-ÿ\'’]+\\s+){0,1}(?:' + __state.COUNTABLE_RX.source + '))', 'gi'),
          (m, d, noun) => {
            const v = num(d);
            if (!isFinite(v) || v < 20 || citedC(v, __state.countKind(noun))) return m;
            n++; return mark + ' ' + noun;
          });
        return c;
      }).join('');
      return { text: out, redacted: n, caveat: rateSeen ? (__state.RATE_NOTE[L2] || __state.RATE_NOTE.fr) : '' };
    } catch (_) {
      /* Detector blew up on some input we didn't foresee. Fail CLOSED: an
       * answer we could not check is an answer we do not show. */
      return { text: '', redacted: -1, caveat: '' };
    }
  }

const T = {
    fr: {
      ui: {
        title: 'Assistant financier',
        subtitle: 'Il connaît votre café, revenus, charges, marges, trésorerie',
        placeholder: 'Posez une question, embauche, prix, investissement, prévision…',
        calc: 'Calculatrice', enterToSend: 'Entrée pour envoyer', send: 'Envoyer',
        kpError: 'Erreur', kpUse: 'Utiliser ce résultat',
        ctxEyebrow: 'Ce que je sais',
        ctxSub: '30 derniers jours · cliquez pour insérer',
        ctxNote: 'Cliquez un chiffre pour l’ajouter à votre message, l’assistant raisonnera dessus.',
        ctxTrust: 'Tout s’exécute en local. Aucune donnée ne quitte cet appareil.',
        gActivity: 'Activité', gProfit: 'Rentabilité', gFixed: 'Charges fixes', gCash: 'Trésorerie & équipe',
        perMonth: '/ mois', days: 'j', employees: (n) => `${n} employés`,
      },
      facts: {
        revenue: 'Chiffre d’affaires', revPerDay: 'CA par jour', mtdRev: 'CA du mois en cours',
        ordersMonth: 'Commandes / mois', ordersDay: 'Commandes / jour', basket: 'Panier moyen',
        grossMargin: 'Marge brute', cogs: 'Coût matière', profitPerOrder: 'Bénéfice par commande',
        breakEven: 'Seuil de rentabilité', cashAvail: 'Trésorerie disponible', headcount: 'Effectif',
        netProfit: 'Bénéfice net', netMarginLine: (m) => `marge nette ${m} %`,
      },
      opex: {
        salaries: 'Masse salariale', rent: 'Loyer', utilities: 'Eau · électricité · gaz',
        marketing: 'Marketing & divers', maintenance: 'Entretien & équipement',
        insurance: 'Assurances & taxes', financing: 'Amortissement & prêt', subscription: 'Abonnement Kiwi POS',
      },
      chips: {
        hire: 'Puis-je embaucher un serveur ?', price5: 'Et si j’augmente mes prix de 5 % ?',
        breakeven: 'Quel est mon seuil de rentabilité ?', forecast: 'Prévision de bénéfice ce mois',
        charges: 'Décompose mes charges', invest80: 'Puis-je investir 80 000 MAD ?',
        invest150: 'Puis-je investir 150 000 MAD ?',
      },
      hire: {
        text: (c, per, n) => n > 1
          ? `<b>${n} embauches</b> à ${__state.fmtMad(per)}/mois chacune, soit <b>${__state.fmtMad(c)}/mois</b> en coût chargé, représentent <b>${__state.fmtMad(c * 12)}/an</b>.`
          : `Une embauche à <b>${__state.fmtMad(c)}/mois</b> en coût chargé représente <b>${__state.fmtMad(c * 12)}/an</b>.`,
        s1l: 'Pour s’autofinancer', s1v: (o) => `${__state.fmt1(o / 30)} cmd/jour`, s1h: (o) => `soit ${__state.fmt(o)} commandes/mois`,
        s2l: 'CA additionnel requis', s2h: 'au panier moyen actuel',
        s3l: 'Bénéfice net après', s3h: () => `vs ${__state.fmtMad(__state.B.netProfit)} aujourd’hui`,
        s4l: 'Part du bénéfice', s4h: 'de votre résultat mensuel',
        vGood: (o) => `Favorable, il suffit de ${__state.fmt1(o / 30)} commandes en plus par jour pour absorber ce poste. Votre marge le permet largement.`,
        vWarn: 'Faisable, mais ce poste pèse lourd dans le résultat. Assurez-vous que l’embauche génère bien du chiffre additionnel.',
        vBad: 'Prudence, ce coût dépasse votre marge de manœuvre actuelle. À envisager seulement avec une hausse d’activité confirmée.',
        note: 'Hypothèse : 7 200 MAD/mois en coût chargé pour un serveur (salaire net + CNSS + primes). Indiquez un montant précis pour affiner.',
        noteLoaded: (per, n) => `Je compte ${__state.fmtMad(per)}/mois ${n > 1 ? 'par personne ' : ''}en coût <i>chargé</i>. Si c’est le salaire net, ajoutez environ 21 % de CNSS et AMO employeur avant de décider.`,
        noteCnss: (per, n) => `J’ai ajouté environ 21 % de CNSS et AMO employeur : ${__state.fmtMad(per)}/mois ${n > 1 ? 'par personne ' : ''}en coût réellement supporté. Le taux exact dépend du plafond CNSS et de votre convention, votre comptable le confirmera.`,
      },
      price: {
        text: (p) => `Une ${p >= 0 ? 'hausse' : 'baisse'} de <b>${__state.fmt1(Math.abs(p))} %</b> sur l’ensemble de la carte, à volume constant, ne touche pas le coût matière, l’écart tombe presque entièrement dans le résultat.`,
        s1l: 'Bénéfice net /mois', s1h: (d) => `${d >= 0 ? '+' : ''}${__state.fmtMad(d)}`,
        s2l: 'Effet sur 12 mois', s2h: 'à activité égale',
        s3l: 'Nouvelle marge nette', s3h: () => `vs ${__state.fmt1(__state.B.netMargin)} % aujourd’hui`,
        s4l: 'Nouveau CA /mois', s4h: (b) => `panier moyen ${__state.fmtMad(b)}`,
        vUp: (p, d) => `Levier puissant, ${__state.fmt1(p)} % de prix en plus = ${__state.fmtMad(d)} de bénéfice mensuel sans dépense supplémentaire.`,
        vDown: (need) => `Une baisse de prix ne se finance que par du volume : il faudrait +${__state.fmt1(need)} % de commandes pour préserver le résultat.`,
        vFlat: 'Aucun changement de prix, votre résultat reste identique. Indiquez un pourcentage pour voir l’effet.',
        textDegenerate: (p, cogs) => `À −${__state.fmt1(p)} %, votre chiffre d’affaires passerait sous votre coût matière (${__state.fmtMad(cogs)}) : vous vendriez à perte sur chaque commande. Je ne simule pas au-delà, le résultat n’aurait aucun sens.`,
        note: 'Calcul à volume constant. En pratique une hausse de prix réduit souvent la fréquentation de 2 à 4 %, surveillez le nombre de commandes les deux semaines suivantes.',
        noteAssumed: ' (Hypothèse : 5 %.)',
        noteClamped: ' Pourcentage ramené dans une plage réaliste (−100 % à +200 %) : au-delà, l’hypothèse « à volume constant » n’a plus de sens.',
      },
      afford: {
        ask: 'Indiquez le montant de l’investissement et je vous dis s’il est à votre portée, par exemple : <i>« puis-je investir 80 000 MAD dans une terrasse ? »</i>',
        text: (a) => `Un investissement de <b>${__state.fmtMad(a)}</b> se compare à votre trésorerie disponible (${__state.fmtMad(__state.B.cashBuffer)}) et à votre bénéfice net (${__state.fmtMad(__state.B.netProfit)}/mois).`,
        s1l: 'Récupéré en', s1v: (m) => `${__state.fmt1(m)} mois`, s1h: 'avec le bénéfice net actuel',
        s2l: 'Trésorerie après', s2hOk: (p) => `${__state.fmt1(p)} % engagés`, s2hNo: 'financement nécessaire',
        s3l: 'Équivalent', s3v: (d) => `${__state.fmt1(d)} jours`, s3h: 'de bénéfice d’exploitation',
        s4l: 'Poids annuel', s4h: 'du bénéfice sur 12 mois',
        vGood: (m, cash) => `Abordable, payable comptant, amorti en ${__state.fmt1(m)} mois, et il reste ${__state.fmtMad(cash)} de trésorerie.`,
        vWarn: (m, p) => `Payable comptant, mais l’amortissement prend ${__state.fmt1(m)} mois et mobilise ${__state.fmt1(p)} % de votre trésorerie, gardez un coussin de sécurité.`,
        vBad: () => `Au-delà de votre trésorerie disponible (${__state.fmtMad(__state.B.cashBuffer)}). Un financement, ou un étalement, serait nécessaire.`,
      },
      forecast: {
        text: (run) => `Sur vos <b>${__state.B.mtdDays} premiers jours du mois</b> (${__state.fmtMad(__state.B.mtdRevenue)} encaissés), le rythme est de <b>${__state.fmtMad(run)}/jour</b>.`,
        s1l: 'CA projeté · mois', s1h: () => `${__state.B.daysInMonth} jours`,
        s2l: 'Bénéfice projeté · mois', s2h: () => `marge nette ${__state.fmt1(__state.B.netMargin)} %`,
        s3l: 'CA projeté · 12 mois', s3h: 'au rythme actuel',
        s4l: 'Bénéfice · 12 mois', s4h: 'avant impôt sur les sociétés',
        vGood: (v) => `Tendance positive, le mois dépasse votre moyenne 30 jours de ${__state.fmt1(v)} %. Si le rythme tient, c’est votre meilleur mois.`,
        vWarn: (v) => `Le mois est ${__state.fmt1(v)} % sous votre moyenne 30 jours, un coup d’accélérateur sur les soirs de week-end remettrait la barre.`,
        note: 'Projection linéaire : un jour férié, un week-end pluvieux ou une opération spéciale peuvent faire varier le résultat réel.',
      },
      breakeven: {
        text: () => `Votre point mort, le chiffre d’affaires qui couvre exactement vos charges fixes (${__state.fmtMad(__state.B.totalOpex)}) avec une marge sur coûts variables de ${__state.fmt1(__state.B.contribRatio * 100)} %.`,
        s1l: 'Seuil · CA mensuel', s1h: () => `vs ${__state.fmtMad(__state.B.revenue)} réalisé`,
        s2l: 'Seuil · commandes/jour', s2h: () => `vs ${__state.fmt(__state.B.ordersPerDay)} aujourd’hui`,
        s3l: 'Marge de sécurité', s3h: 'chute d’activité absorbable',
        s4l: 'Seuil · CA journalier', s4h: () => `vs ${__state.fmtMad(__state.B.dailyRev)} réalisé`,
        vGood: () => `Position solide, vous opérez ${__state.fmt1(__state.B.marginOfSafety)} % au-dessus du point mort. Il faudrait perdre près d’un tiers de l’activité pour être à l’équilibre.`,
      },
      margin: {
        text: 'Vos deux marges, sur les 30 derniers jours :',
        s1l: 'Marge brute', s1h: () => `${__state.fmtMad(__state.B.grossProfit)} après coût matière`,
        s2l: 'Marge nette', s2h: () => `${__state.fmtMad(__state.B.netProfit)} après toutes charges`,
        s3l: 'Coût matière', s3h: () => __state.fmtMad(__state.B.cogs),
        s4l: 'Bénéfice par commande', s4h: () => `panier moyen ${__state.fmtMad(__state.B.avgBasket)}`,
        vGood: () => `Marge nette de ${__state.fmt1(__state.B.netMargin)} %, nettement au-dessus de la moyenne du secteur café-restauration (8 à 12 %). Votre coût matière est bien tenu.`,
        note: 'La marge brute mesure la rentabilité de la carte ; la marge nette, celle de toute l’exploitation.',
      },
      charges: {
        text: () => `Vos charges fixes mensuelles totalisent <b>${__state.fmtMad(__state.B.totalOpex)}</b>, auxquelles s’ajoute le coût matière (${__state.fmtMad(__state.B.cogs)}).`,
        share: (p) => `${__state.fmt1(p)} % des charges`,
        verdict: (name, p) => `« ${name} » est votre premier poste (${__state.fmt1(p)} % des charges), c’est là que se trouve votre principal levier d’optimisation.`,
      },
      revenue: {
        text: 'Votre activité sur les 30 derniers jours :',
        s1l: 'Chiffre d’affaires', s1h: '30 derniers jours',
        s2l: 'CA moyen /jour', s2h: () => `${__state.fmt(__state.B.ordersPerDay)} commandes`,
        s3l: 'Commandes /mois', s3h: () => `panier moyen ${__state.fmtMad(__state.B.avgBasket)}`,
        s4l: 'Bénéfice net /mois', s4h: () => `marge nette ${__state.fmt1(__state.B.netMargin)} %`,
      },
      profit: {
        text: 'Votre résultat, une fois toutes les charges payées :',
        s1l: 'Bénéfice net /mois', s1h: () => `marge nette ${__state.fmt1(__state.B.netMargin)} %`,
        s2l: 'Bénéfice net /jour', s2h: () => `${__state.B.daysOpen} jours d’ouverture`,
        s3l: 'Bénéfice par commande', s3h: () => `sur ${__state.fmtMad(__state.B.avgBasket)} de panier`,
        s4l: 'Bénéfice projeté /an', s4h: 'au rythme actuel',
        vGood: () => `Café rentable et sain : vous dégagez ${__state.fmtMad(__state.B.dailyNet)} de bénéfice net par jour d’ouverture.`,
      },
      help: {
        text: 'Bonjour Rachid. Je suis votre assistant financier, je connais Café Atlas : chiffre d’affaires, coût matière, charges, marges et trésorerie. Posez-moi une question chiffrée et je calcule l’impact réel sur votre résultat ; pour une question ouverte sur la gestion de votre café, je peux activer un assistant IA dans votre navigateur. Par exemple :',
      },
      /* Replies for the six guard patterns. Each says plainly what it will
       * NOT do and why, then offers the nearest thing it can actually do. */
      runway: {
        textOk: (m) => `Vous êtes bénéficiaire aujourd'hui, donc votre trésorerie n'est pas un compte à rebours mais un matelas : elle couvre <b>${__state.fmt1(m)} mois</b> de charges totales si le chiffre d'affaires tombait à zéro du jour au lendemain.`,
        textLoss: (m) => `Au rythme de perte actuel, votre trésorerie tient <b>${__state.fmt1(m)} mois</b>. C'est le temps dont vous disposez pour redresser, pas une réserve.`,
        s1l: 'Trésorerie disponible', s1h: 'ce que vous avez devant vous',
        s2lOk: 'Bénéfice net /mois', s2hOk: 'ce que l\u2019activité ajoute',
        s2lLoss: 'Perte nette /mois', s2hLoss: 'ce que l\u2019activité consomme',
        s3l: 'Sorties mensuelles', s3h: 'charges fixes + coût matière',
        s4l: 'Premier poste', s4h: 'le levier le plus lourd',
        vOk: (m) => `Situation tenable : ${__state.fmt1(m)} mois de charges couverts sans une seule vente. Le risque n'est pas la trésorerie, c'est une baisse durable du chiffre.`,
        vLoss: (m) => `Urgence : ${__state.fmt1(m)} mois avant rupture. Agissez sur le premier poste de charges et sur le seuil de rentabilité, dans cet ordre.`,
        note: 'Calcul à charges constantes. Un délai fournisseur, un étalement CNSS ou un report de loyer allongent ce délai, parlez-en avant d\u2019être à court.',
      },
      guards: {
        negated: 'Compris, je ne lance pas cette simulation. Dites-moi ce que vous voulez examiner à la place, ou choisissez ci-dessous.',
        meta: 'Je ne devine rien : chaque chiffre vient de vos 30 derniers jours enregistrés dans Kiwi, et chaque simulation applique une règle simple à ces chiffres. Une hausse de prix s’applique au chiffre d’affaires sans toucher au coût matière ; une embauche se retranche du bénéfice net ; le seuil de rentabilité divise vos charges fixes par votre taux de marge. Ouvrez « Voir tous les chiffres » pour la base de départ.',
        layoff: 'Je ne peux pas chiffrer une réduction d’effectif : je connais votre masse salariale globale, pas le salaire de chaque personne. Voici ce que je peux vous montrer, le poids réel de la masse salariale dans vos charges. Pour un départ, la loi marocaine impose préavis et indemnités, faites valider le calcul par votre comptable.',
        scoped: 'Je n’ai pas ce détail. Je raisonne sur des totaux, pas par article, par jour de semaine ni par personne. Le chiffre global ne s’applique pas à un produit précis, ce serait vous induire en erreur de vous le donner comme tel. Le détail par article se trouve dans la page Menu, et le détail par vente dans Transactions.',
        notrend: 'Je ne peux pas comparer deux périodes : je travaille sur une seule fenêtre de 30 jours, sans historique. Je ne sais donc pas mesurer après coup l’effet d’une décision déjà prise. Ce que je peux faire, c’est simuler ce qu’une décision changerait à partir d’aujourd’hui.',
        illicit: 'Je ne vous aiderai pas sur ce point. Kiwi tient aussi votre comptabilité, je ne vais pas vous aider à dissimuler des recettes, à contourner la CNSS ou à payer sous le minimum légal, et vous exposer à un redressement. En revanche je peux réduire vos coûts par des moyens légaux, voici où votre argent part réellement.',
        unclear: 'Je n’ai pas bien saisi votre question. Je comprends le français, l’anglais et l’arabe, et une bonne partie de la darija, mais pas encore tout. Reformulez-la, ou posez-la autrement : je calcule une embauche, une hausse de prix, un investissement, votre seuil de rentabilité, vos marges, vos charges et votre prévision du mois.',
        strainPartial: 'Je n’ai pas encore votre trésorerie ni vos charges, je ne peux donc pas calculer combien de temps vous tenez. Renseignez vos charges dans Marges et votre trésorerie dès qu’elle sera suivie, et je vous donne ce chiffre, c’est le plus important quand ça se tend.',
        market: 'Je ne donne pas de conseil de placement, ni en bourse, ni en crypto : ce n’est pas mon métier et vous engageriez de l’argent sur un avis que je ne peux pas justifier. Ce que je sais faire, c’est vous dire ce que votre commerce rapporte et ce qu’un investissement dedans changerait.',
        secret: 'Je ne donne ni code, ni mot de passe, ni les données d’un autre commerçant. Je ne vois que votre établissement, et c’est volontaire. Pour vos propres accès, passez par Réglages, ou par Équipe pour les codes de vos employés.',
      },
      calc: { title: 'Calcul', result: 'résultat' },
      llm: {
        runErr: 'Une erreur est survenue côté assistant IA. Réessayez, ou demandez-moi un calcul précis.',
        stop: 'Arrêter',
        unfitTail: 'Ce que je calcule reste entier : embauche, prix, seuil de rentabilité, prévisions, marges, charges, trésorerie, et vos ventes par article, par client et par jour.',
        privateLead: 'Mode privé : cette question sort de mes calculs, et vous avez choisi que rien ne quitte cet appareil. Vous pouvez activer l’IA serveur dans le panneau de droite.',
        unavailable: 'Cette question sort de mes calculs, et le serveur Kiwi n’est pas joignable pour l’instant.',
        cloudLead: 'Cette question sort de mes calculs prédéfinis. Kiwi peut y répondre depuis ses serveurs.',
        cloudPrivacy: 'À dire franchement : dans ce mode, votre question et les chiffres de votre établissement nécessaires à la réponse sont envoyés à Kiwi pour être traités, de façon sécurisée. En mode privé, rien ne sort et mes calculs restent entiers. Vous choisissez une fois ; c’est modifiable dans le panneau.',
        cloudActivate: 'Répondre depuis les serveurs Kiwi',
        cloudDecline: 'Non merci, garder mes calculs seuls',
        cloudQuota: 'L’assistant serveur a atteint sa limite du jour pour votre établissement. Il repart demain ; d’ici là mes calculs restent entiers.',
        cloudAuth: 'Cette question sort de mes calculs. Les réponses du serveur demandent un compte Kiwi connecté, la démo ne les propose pas.',
        privateNative: 'Cette question sort de mes calculs et Kiwi AI est désactivé. Réactivez-le dans le menu ☰ › Confidentialité Kiwi AI.',
      },
      acct: {
        hub: 'Je suis aussi votre comptable, teneur de livres, fiscaliste et gestionnaire de paie, tout est réuni dans votre Comptabilité : livre, états financiers, TVA & impôts, et paie.',
        tva: (D) => `Je m'occupe de votre fiscalité. Pour ${D.period} : TVA à payer <b>${__state.fmtMad(D.tva.aPayer)}</b>, échéance ${D.tva.echeance}. IS estimé sur l'exercice : ${__state.fmtMad(D.is.estimeAnnuel)}. J'ouvre le module pour préparer la déclaration.`,
        paie: (D) => `Côté paie : <b>${D.payroll.headcount} salariés</b>, ${__state.fmtMad(D.payroll.totalNet)} net à verser pour ${D.period}. La déclaration CNSS est due le ${D.payroll.echeance}, je peux générer les fiches.`,
        etats: (D) => `Vos états de ${D.period} : résultat net <b>${__state.fmtMad(D.netProfit)}</b>, trésorerie ${__state.fmtMad(D.cash)}, bilan équilibré. J'ouvre vos états financiers.`,
        livre: (D) => `<b>${__state.fmt(D.entriesThisMonth)} écritures</b> ce mois, chaque vente et chaque dépense, enregistrée et catégorisée automatiquement.`,
      },
    },

    en: {
      ui: {
        title: 'Financial assistant',
        subtitle: 'It knows your café, revenue, costs, margins, cash',
        placeholder: 'Ask a question, hiring, pricing, investment, forecast…',
        calc: 'Calculator', enterToSend: 'Enter to send', send: 'Send',
        kpError: 'Error', kpUse: 'Use this result',
        ctxEyebrow: 'What I know',
        ctxSub: 'Last 30 days · click to insert',
        ctxNote: 'Click any figure to add it to your message, the assistant will reason on it.',
        ctxTrust: 'Everything runs locally. No data leaves this device.',
        gActivity: 'Activity', gProfit: 'Profitability', gFixed: 'Fixed costs', gCash: 'Cash & team',
        perMonth: '/ month', days: 'd', employees: (n) => `${n} employees`,
      },
      facts: {
        revenue: 'Revenue', revPerDay: 'Revenue per day', mtdRev: 'Month-to-date revenue',
        ordersMonth: 'Orders / month', ordersDay: 'Orders / day', basket: 'Average basket',
        grossMargin: 'Gross margin', cogs: 'Cost of goods', profitPerOrder: 'Profit per order',
        breakEven: 'Break-even point', cashAvail: 'Cash available', headcount: 'Headcount',
        netProfit: 'Net profit', netMarginLine: (m) => `net margin ${m} %`,
      },
      opex: {
        salaries: 'Payroll', rent: 'Rent', utilities: 'Water · electricity · gas',
        marketing: 'Marketing & misc.', maintenance: 'Maintenance & equipment',
        insurance: 'Insurance & taxes', financing: 'Depreciation & loan', subscription: 'Kiwi POS subscription',
      },
      chips: {
        hire: 'Can I hire a waiter?', price5: 'What if I raise prices 5%?',
        breakeven: 'What is my break-even point?', forecast: 'Profit forecast this month',
        charges: 'Break down my costs', invest80: 'Can I invest 80,000 MAD?',
        invest150: 'Can I invest 150,000 MAD?',
      },
      hire: {
        text: (c, per, n) => n > 1
          ? `<b>${n} hires</b> at ${__state.fmtMad(per)}/month each, i.e. <b>${__state.fmtMad(c)}/month</b> loaded cost, work out to <b>${__state.fmtMad(c * 12)}/year</b>.`
          : `A hire at <b>${__state.fmtMad(c)}/month</b> loaded cost works out to <b>${__state.fmtMad(c * 12)}/year</b>.`,
        s1l: 'To pay for itself', s1v: (o) => `${__state.fmt1(o / 30)} orders/day`, s1h: (o) => `i.e. ${__state.fmt(o)} orders/month`,
        s2l: 'Extra revenue needed', s2h: 'at the current average basket',
        s3l: 'Net profit after', s3h: () => `vs ${__state.fmtMad(__state.B.netProfit)} today`,
        s4l: 'Share of profit', s4h: 'of your monthly result',
        vGood: (o) => `Favourable, just ${__state.fmt1(o / 30)} more orders a day cover this role. Your margin allows it comfortably.`,
        vWarn: 'Doable, but this role weighs heavily on the result. Make sure the hire genuinely drives extra revenue.',
        vBad: 'Caution, this cost exceeds your current room to manoeuvre. Only consider it with a confirmed rise in activity.',
        note: 'Assumption: 7,200 MAD/month loaded cost for a waiter (net pay + CNSS + bonuses). Give a precise figure to refine.',
        noteLoaded: (per, n) => `I'm counting ${__state.fmtMad(per)}/month ${n > 1 ? 'per person ' : ''}as <i>loaded</i> cost. If that's net pay, add roughly 21% employer CNSS and AMO before you decide.`,
        noteCnss: (per, n) => `I've added roughly 21% employer CNSS and AMO: ${__state.fmtMad(per)}/month ${n > 1 ? 'per person ' : ''}as the cost you actually carry. The exact rate depends on the CNSS ceiling and your agreement, your accountant will confirm it.`,
      },
      price: {
        text: (p) => `A <b>${__state.fmt1(Math.abs(p))}%</b> ${p >= 0 ? 'increase' : 'decrease'} across the whole menu, at constant volume, doesn't touch cost of goods, the difference falls almost entirely into your result.`,
        s1l: 'Net profit /month', s1h: (d) => `${d >= 0 ? '+' : ''}${__state.fmtMad(d)}`,
        s2l: 'Effect over 12 months', s2h: 'at equal activity',
        s3l: 'New net margin', s3h: () => `vs ${__state.fmt1(__state.B.netMargin)} % today`,
        s4l: 'New revenue /month', s4h: (b) => `average basket ${__state.fmtMad(b)}`,
        vUp: (p, d) => `Powerful lever, ${__state.fmt1(p)}% more on price = ${__state.fmtMad(d)} of monthly profit with no extra spend.`,
        vDown: (need) => `A price cut is only funded by volume: you'd need +${__state.fmt1(need)}% orders to keep the result steady.`,
        vFlat: 'No price change, your result stays exactly the same. Give me a percentage to see the effect.',
        textDegenerate: (p, cogs) => `At −${__state.fmt1(p)}%, your revenue would fall below your cost of goods (${__state.fmtMad(cogs)}): you'd sell at a loss on every order. I don't simulate past that, the result would be meaningless.`,
        note: 'Calculated at constant volume. In practice a price rise often trims footfall by 2–4%, watch order counts over the next two weeks.',
        noteAssumed: ' (Assumption: 5%.)',
        noteClamped: ' Percentage pulled back into a realistic range (−100% to +200%): beyond that, the constant-volume assumption stops meaning anything.',
      },
      afford: {
        ask: 'Tell me the investment amount and I\'ll say whether it\'s within reach, for example: <i>"can I invest 80,000 MAD in a terrace?"</i>',
        text: (a) => `An investment of <b>${__state.fmtMad(a)}</b> compares against your available cash (${__state.fmtMad(__state.B.cashBuffer)}) and your net profit (${__state.fmtMad(__state.B.netProfit)}/month).`,
        s1l: 'Recouped in', s1v: (m) => `${__state.fmt1(m)} months`, s1h: 'at the current net profit',
        s2l: 'Cash afterwards', s2hOk: (p) => `${__state.fmt1(p)} % committed`, s2hNo: 'financing required',
        s3l: 'Equivalent to', s3v: (d) => `${__state.fmt1(d)} days`, s3h: 'of operating profit',
        s4l: 'Annual weight', s4h: 'of profit over 12 months',
        vGood: (m, cash) => `Affordable, payable in cash, paid back in ${__state.fmt1(m)} months, with ${__state.fmtMad(cash)} of cash left.`,
        vWarn: (m, p) => `Payable in cash, but payback takes ${__state.fmt1(m)} months and ties up ${__state.fmt1(p)}% of your cash, keep a safety cushion.`,
        vBad: () => `Beyond your available cash (${__state.fmtMad(__state.B.cashBuffer)}). Financing, or spreading the cost, would be needed.`,
      },
      forecast: {
        text: (run) => `Over the <b>first ${__state.B.mtdDays} days of the month</b> (${__state.fmtMad(__state.B.mtdRevenue)} taken), the pace is <b>${__state.fmtMad(run)}/day</b>.`,
        s1l: 'Projected revenue · month', s1h: () => `${__state.B.daysInMonth} days`,
        s2l: 'Projected profit · month', s2h: () => `net margin ${__state.fmt1(__state.B.netMargin)} %`,
        s3l: 'Projected revenue · 12 mo.', s3h: 'at the current pace',
        s4l: 'Profit · 12 months', s4h: 'before corporate tax',
        vGood: (v) => `Positive trend, the month is running ${__state.fmt1(v)}% above your 30-day average. If the pace holds, it's your best month.`,
        vWarn: (v) => `The month is ${__state.fmt1(v)}% below your 30-day average, a push on weekend evenings would bring it back up.`,
        note: 'Linear projection: a public holiday, a rainy weekend or a special event can shift the real figure.',
      },
      breakeven: {
        text: () => `Your break-even, the revenue that exactly covers your fixed costs (${__state.fmtMad(__state.B.totalOpex)}) at a ${__state.fmt1(__state.B.contribRatio * 100)}% contribution margin.`,
        s1l: 'Break-even · monthly rev.', s1h: () => `vs ${__state.fmtMad(__state.B.revenue)} achieved`,
        s2l: 'Break-even · orders/day', s2h: () => `vs ${__state.fmt(__state.B.ordersPerDay)} today`,
        s3l: 'Margin of safety', s3h: 'drop in activity you can absorb',
        s4l: 'Break-even · daily rev.', s4h: () => `vs ${__state.fmtMad(__state.B.dailyRev)} achieved`,
        vGood: () => `Solid position, you operate ${__state.fmt1(__state.B.marginOfSafety)}% above break-even. You'd have to lose nearly a third of activity to reach it.`,
      },
      margin: {
        text: 'Your two margins, over the last 30 days:',
        s1l: 'Gross margin', s1h: () => `${__state.fmtMad(__state.B.grossProfit)} after cost of goods`,
        s2l: 'Net margin', s2h: () => `${__state.fmtMad(__state.B.netProfit)} after all costs`,
        s3l: 'Cost of goods', s3h: () => __state.fmtMad(__state.B.cogs),
        s4l: 'Profit per order', s4h: () => `average basket ${__state.fmtMad(__state.B.avgBasket)}`,
        vGood: () => `Net margin of ${__state.fmt1(__state.B.netMargin)}%, well above the café-restaurant sector average (8 to 12%). Your cost of goods is well controlled.`,
        note: 'Gross margin measures how profitable the menu is; net margin, how profitable the whole operation is.',
      },
      charges: {
        text: () => `Your monthly fixed costs total <b>${__state.fmtMad(__state.B.totalOpex)}</b>, on top of which comes the cost of goods (${__state.fmtMad(__state.B.cogs)}).`,
        share: (p) => `${__state.fmt1(p)} % of costs`,
        verdict: (name, p) => `"${name}" is your biggest line (${__state.fmt1(p)}% of costs), that's where your main optimisation lever sits.`,
      },
      revenue: {
        text: 'Your activity over the last 30 days:',
        s1l: 'Revenue', s1h: 'last 30 days',
        s2l: 'Avg. revenue /day', s2h: () => `${__state.fmt(__state.B.ordersPerDay)} orders`,
        s3l: 'Orders /month', s3h: () => `average basket ${__state.fmtMad(__state.B.avgBasket)}`,
        s4l: 'Net profit /month', s4h: () => `net margin ${__state.fmt1(__state.B.netMargin)} %`,
      },
      profit: {
        text: 'Your result, once every cost is paid:',
        s1l: 'Net profit /month', s1h: () => `net margin ${__state.fmt1(__state.B.netMargin)} %`,
        s2l: 'Net profit /day', s2h: () => `${__state.B.daysOpen} opening days`,
        s3l: 'Profit per order', s3h: () => `on a ${__state.fmtMad(__state.B.avgBasket)} basket`,
        s4l: 'Projected profit /year', s4h: 'at the current pace',
        vGood: () => `A healthy, profitable café: you clear ${__state.fmtMad(__state.B.dailyNet)} of net profit per opening day.`,
      },
      help: {
        text: 'Hello Rachid. I\'m your financial assistant, I know Café Atlas: revenue, cost of goods, costs, margins and cash. Ask me a numbers question and I\'ll compute the real impact on your result; for an open question about running your café, I can switch on an AI assistant right in your browser. For example:',
      },
      runway: {
        textOk: (m) => `You're profitable today, so your cash isn't a countdown but a cushion: it covers <b>${__state.fmt1(m)} months</b> of total costs if revenue stopped dead tomorrow.`,
        textLoss: (m) => `At the current rate of loss, your cash lasts <b>${__state.fmt1(m)} months</b>. That's the time you have to turn things around, not a reserve.`,
        s1l: 'Cash available', s1h: 'what you have in front of you',
        s2lOk: 'Net profit /month', s2hOk: 'what trading adds',
        s2lLoss: 'Net loss /month', s2hLoss: 'what trading consumes',
        s3l: 'Monthly outgoings', s3h: 'fixed costs + cost of goods',
        s4l: 'Largest line', s4h: 'your heaviest lever',
        vOk: (m) => `Sustainable: ${__state.fmt1(m)} months of costs covered without a single sale. Your risk isn't cash, it's a lasting drop in revenue.`,
        vLoss: (m) => `Urgent: ${__state.fmt1(m)} months before you run out. Act on the largest cost line and on break-even, in that order.`,
        note: 'Calculated at constant costs. Supplier terms, a CNSS instalment plan or a deferred rent all extend this, raise them before you run short.',
      },
      guards: {
        negated: 'Understood, I won\'t run that simulation. Tell me what you\'d like to look at instead, or pick one below.',
        meta: 'Nothing here is guesswork: every figure comes from your last 30 days recorded in Kiwi, and every simulation applies one simple rule to those figures. A price rise applies to revenue without touching cost of goods; a hire is subtracted from net profit; break-even divides your fixed costs by your margin rate. Open "See all the figures" for the starting point.',
        layoff: 'I can\'t put a number on cutting headcount: I know your total payroll, not what each person earns. Here\'s what I can show you, the real weight of payroll in your costs. For a departure, Moroccan law requires notice and severance, have your accountant check the calculation.',
        scoped: 'I don\'t have that breakdown. I reason on totals, not per item, per weekday or per person. The global figure doesn\'t apply to one specific product, and handing it to you as if it did would mislead you. Per-item detail is on the Menu page, per-sale detail in Transactions.',
        notrend: 'I can\'t compare two periods: I work from a single 30-day window with no history. So I can\'t measure after the fact what a decision you already took actually did. What I can do is simulate what a decision would change from today.',
        illicit: 'I won\'t help with that. Kiwi also keeps your books, so I\'m not going to help you hide takings, get around CNSS or pay below the legal minimum, and expose you to a tax reassessment. What I can do is cut your costs by lawful means, here is where your money actually goes.',
        unclear: 'I didn’t quite catch that. I understand French, English and Arabic, and a good deal of Darija, but not all of it yet. Try rephrasing, or ask another way: I can work out a hire, a price rise, an investment, your break-even point, your margins, your costs and this month’s forecast.',
        strainPartial: 'I don’t have your cash position or your costs yet, so I can’t work out how long you can last. Enter your costs in Margins and your cash once it is tracked, and I’ll give you that figure, it’s the one that matters most when things get tight.',
        market: 'I don’t give investment advice, in equities or crypto: it isn’t my job and you’d be committing money on a view I can’t justify. What I can do is tell you what your business earns and what investing in it would change.',
        secret: 'I don’t hand out codes, passwords, or another merchant’s data. I only ever see your own business, and that’s deliberate. For your own access go to Settings, or Team for your staff’s codes.',
      },
      calc: { title: 'Calculation', result: 'result' },
      llm: {
        runErr: 'Something went wrong on the AI assistant side. Try again, or ask me for a precise calculation.',
        stop: 'Stop',
        unfitTail: 'What I calculate is untouched: hiring, pricing, break-even, forecasts, margins, costs, cash, and your sales by item, by customer and by day.',
        privateLead: 'Private mode: this question is outside my calculations, and you chose that nothing leaves this device. You can enable server AI in the right-hand panel.',
        unavailable: 'This question is outside my calculations, and Kiwi’s server can’t be reached right now.',
        cloudLead: 'This question is beyond my preset calculations. Kiwi can answer it from its servers.',
        cloudPrivacy: 'Plainly: in this mode your question and the figures of your business needed for the answer are sent to Kiwi for processing, securely. In private mode nothing leaves, and my calculations stay untouched. You choose once; it can be changed in the panel.',
        cloudActivate: 'Answer from Kiwi’s servers',
        cloudDecline: 'No thanks, keep my calculations only',
        cloudQuota: 'The server assistant has reached today’s limit for your business. It resets tomorrow; until then my calculations are untouched.',
        cloudAuth: 'This question is outside my calculations. Server answers need a signed-in Kiwi account, and the demo does not offer them.',
        privateNative: 'This question is outside my calculations and Kiwi AI is off. Turn it on in the ☰ menu › Kiwi AI privacy.',
      },
      acct: {
        hub: 'I\'m also your accountant, bookkeeper, tax adviser and payroll manager, it\'s all together in your Accounting: ledger, financial statements, VAT & tax, and payroll.',
        tva: (D) => `I'll handle your taxes. For ${D.period}: VAT due <b>${__state.fmtMad(D.tva.aPayer)}</b>, deadline ${D.tva.echeance}. Estimated corporate tax for the year: ${__state.fmtMad(D.is.estimeAnnuel)}. I'm opening the module to prepare the return.`,
        paie: (D) => `On payroll: <b>${D.payroll.headcount} employees</b>, ${__state.fmtMad(D.payroll.totalNet)} net to pay for ${D.period}. The CNSS return is due ${D.payroll.echeance}, I can generate the payslips.`,
        etats: (D) => `Your ${D.period} statements: net result <b>${__state.fmtMad(D.netProfit)}</b>, cash ${__state.fmtMad(D.cash)}, balanced sheet. I'm opening your financial statements.`,
        livre: (D) => `<b>${__state.fmt(D.entriesThisMonth)} entries</b> this month, every sale and expense, recorded and categorised automatically.`,
      },
    },

    ar: {
      /* AR: best-effort MSA — needs native review */
      ui: {
        title: 'المساعد المالي',
        subtitle: 'يعرف مقهاك، المداخيل، التكاليف، الهوامش، الخزينة',
        placeholder: 'اطرح سؤالاً، توظيف، أسعار، استثمار، توقّعات…',
        calc: 'الآلة الحاسبة', enterToSend: 'اضغط Enter للإرسال', send: 'إرسال',
        kpError: 'خطأ', kpUse: 'استعمل هذه النتيجة',
        ctxEyebrow: 'ما أعرفه',
        ctxSub: 'آخر 30 يوماً · انقر للإدراج',
        ctxNote: 'انقر على أي رقم لإضافته إلى رسالتك، وسيحلّله المساعد.',
        ctxTrust: 'كل شيء يعمل محلياً. لا تغادر أي بيانات هذا الجهاز.',
        gActivity: 'النشاط', gProfit: 'الربحية', gFixed: 'التكاليف الثابتة', gCash: 'الخزينة والفريق',
        perMonth: '/ شهر', days: 'يوم', employees: (n) => `${n} موظفين`,
      },
      facts: {
        revenue: 'رقم المعاملات', revPerDay: 'المداخيل في اليوم', mtdRev: 'مداخيل الشهر الجاري',
        ordersMonth: 'الطلبات / شهر', ordersDay: 'الطلبات / يوم', basket: 'متوسط السلة',
        grossMargin: 'الهامش الإجمالي', cogs: 'تكلفة المواد', profitPerOrder: 'الربح لكل طلب',
        breakEven: 'نقطة التعادل', cashAvail: 'الخزينة المتاحة', headcount: 'عدد الموظفين',
        netProfit: 'الربح الصافي', netMarginLine: (m) => `هامش صافٍ ${m} %`,
      },
      opex: {
        salaries: 'كتلة الأجور', rent: 'الكراء', utilities: 'الماء · الكهرباء · الغاز',
        marketing: 'التسويق ومصاريف متنوعة', maintenance: 'الصيانة والمعدات',
        insurance: 'التأمينات والضرائب', financing: 'الإهلاك والقرض', subscription: 'اشتراك Kiwi POS',
      },
      chips: {
        hire: 'هل يمكنني توظيف نادل؟', price5: 'ماذا لو رفعت أسعاري 5%؟',
        breakeven: 'ما هي نقطة التعادل لدي؟', forecast: 'توقّع الربح هذا الشهر',
        charges: 'حلّل تكاليفي', invest80: 'هل يمكنني استثمار 80 000 MAD؟',
        invest150: 'هل يمكنني استثمار 150 000 MAD؟',
      },
      hire: {
        text: (c, per, n) => n > 1
          ? `<b>${n} توظيفات</b> بـ${__state.fmtMad(per)}/شهر لكل واحد، أي <b>${__state.fmtMad(c)}/شهر</b> بتكلفة محمّلة، تعادل <b>${__state.fmtMad(c * 12)}/سنة</b>.`
          : `توظيف بتكلفة محمّلة قدرها <b>${__state.fmtMad(c)}/شهر</b> يعادل <b>${__state.fmtMad(c * 12)}/سنة</b>.`,
        s1l: 'لتمويل نفسه', s1v: (o) => `${__state.fmt1(o / 30)} طلب/يوم`, s1h: (o) => `أي ${__state.fmt(o)} طلب/شهر`,
        s2l: 'المداخيل الإضافية المطلوبة', s2h: 'بمتوسط السلة الحالي',
        s3l: 'الربح الصافي بعد ذلك', s3h: () => `مقابل ${__state.fmtMad(__state.B.netProfit)} اليوم`,
        s4l: 'حصة من الربح', s4h: 'من نتيجتك الشهرية',
        vGood: (o) => `مناسب، يكفي ${__state.fmt1(o / 30)} طلب إضافي في اليوم لتغطية هذا المنصب. هامشك يسمح بذلك بأريحية.`,
        vWarn: 'ممكن، لكن هذا المنصب يثقل النتيجة. تأكد من أن التوظيف يولّد مداخيل إضافية فعلية.',
        vBad: 'حذار، هذه التكلفة تتجاوز هامش مناورتك الحالي. لا تأخذها بعين الاعتبار إلا مع ارتفاع مؤكد في النشاط.',
        note: 'افتراض: 7 200 MAD/شهر تكلفة محمّلة لنادل (الأجر الصافي + CNSS + المكافآت). حدّد مبلغاً دقيقاً للتحسين.',
        noteLoaded: (per, n) => `أحتسب ${__state.fmtMad(per)}/شهر ${n > 1 ? 'لكل شخص ' : ''}كتكلفة <i>محمّلة</i>. إن كان هذا هو الأجر الصافي، أضف نحو 21 % من مساهمات الضمان الاجتماعي والتأمين الصحي قبل أن تقرّر.`,
        noteCnss: (per, n) => `أضفتُ نحو 21 % من مساهمات الضمان الاجتماعي والتأمين الصحي: ${__state.fmtMad(per)}/شهر ${n > 1 ? 'لكل شخص ' : ''}كتكلفة تتحمّلها فعلاً. النسبة الدقيقة تتوقف على سقف الضمان الاجتماعي واتفاقيتك، ومحاسبك سيؤكدها.`,
      },
      price: {
        text: (p) => `${p >= 0 ? 'رفع' : 'خفض'} الأسعار بنسبة <b>${__state.fmt1(Math.abs(p))} %</b> على كامل القائمة، بحجم ثابت، لا يمسّ تكلفة المواد، والفارق يذهب كله تقريباً إلى النتيجة.`,
        s1l: 'الربح الصافي / شهر', s1h: (d) => `${d >= 0 ? '+' : ''}${__state.fmtMad(d)}`,
        s2l: 'الأثر على 12 شهراً', s2h: 'بنشاط مماثل',
        s3l: 'الهامش الصافي الجديد', s3h: () => `مقابل ${__state.fmt1(__state.B.netMargin)} % اليوم`,
        s4l: 'رقم المعاملات الجديد / شهر', s4h: (b) => `متوسط السلة ${__state.fmtMad(b)}`,
        vUp: (p, d) => `رافعة قوية، ${__state.fmt1(p)} % زيادة في السعر = ${__state.fmtMad(d)} ربحاً شهرياً دون أي إنفاق إضافي.`,
        vDown: (need) => `خفض السعر لا يموّله إلا الحجم: ستحتاج إلى +${__state.fmt1(need)} % من الطلبات للحفاظ على النتيجة.`,
        vFlat: 'لا تغيير في الأسعار، ونتيجتك تبقى كما هي. حدّد نسبة لترى الأثر.',
        textDegenerate: (p, cogs) => `عند −${__state.fmt1(p)} %، سينزل رقم معاملاتك تحت تكلفة المواد (${__state.fmtMad(cogs)}): ستبيع بخسارة في كل طلب. لا أحاكي أبعد من ذلك، فالنتيجة لن تعني شيئاً.`,
        note: 'حساب بحجم ثابت. عملياً، رفع الأسعار يقلّص الإقبال غالباً بنسبة 2 إلى 4%، راقب عدد الطلبات خلال الأسبوعين التاليين.',
        noteAssumed: ' (افتراض: 5%.)',
        noteClamped: ' تمّ إرجاع النسبة إلى مجال واقعي (−100% إلى +200%): أبعد من ذلك يفقد افتراض «الحجم الثابت» معناه.',
      },
      afford: {
        ask: 'حدّد مبلغ الاستثمار وسأخبرك إن كان في متناولك، مثلاً: <i>«هل يمكنني استثمار 80 000 MAD في تيراس؟»</i>',
        text: (a) => `استثمار قدره <b>${__state.fmtMad(a)}</b> يُقارَن بخزينتك المتاحة (${__state.fmtMad(__state.B.cashBuffer)}) وبربحك الصافي (${__state.fmtMad(__state.B.netProfit)}/شهر).`,
        s1l: 'يُسترَدّ في', s1v: (m) => `${__state.fmt1(m)} شهراً`, s1h: 'بالربح الصافي الحالي',
        s2l: 'الخزينة بعد ذلك', s2hOk: (p) => `${__state.fmt1(p)} % مُلتزَم بها`, s2hNo: 'يتطلب تمويلاً',
        s3l: 'ما يعادل', s3v: (d) => `${__state.fmt1(d)} يوماً`, s3h: 'من ربح التشغيل',
        s4l: 'الوزن السنوي', s4h: 'من الربح على 12 شهراً',
        vGood: (m, cash) => `في المتناول، يُدفع نقداً، ويُسترَدّ في ${__state.fmt1(m)} شهراً، ويبقى ${__state.fmtMad(cash)} في الخزينة.`,
        vWarn: (m, p) => `يُدفع نقداً، لكن الاسترداد يستغرق ${__state.fmt1(m)} شهراً ويجمّد ${__state.fmt1(p)} % من خزينتك، احتفظ بهامش أمان.`,
        vBad: () => `يتجاوز خزينتك المتاحة (${__state.fmtMad(__state.B.cashBuffer)}). سيلزم تمويل أو تقسيط للتكلفة.`,
      },
      forecast: {
        text: (run) => `خلال <b>الأيام الـ${__state.B.mtdDays} الأولى من الشهر</b> (${__state.fmtMad(__state.B.mtdRevenue)} محصّلة)، الوتيرة هي <b>${__state.fmtMad(run)}/يوم</b>.`,
        s1l: 'رقم معاملات متوقّع · الشهر', s1h: () => `${__state.B.daysInMonth} يوماً`,
        s2l: 'ربح متوقّع · الشهر', s2h: () => `هامش صافٍ ${__state.fmt1(__state.B.netMargin)} %`,
        s3l: 'رقم معاملات متوقّع · 12 شهراً', s3h: 'بالوتيرة الحالية',
        s4l: 'الربح · 12 شهراً', s4h: 'قبل الضريبة على الشركات',
        vGood: (v) => `اتجاه إيجابي، الشهر يتجاوز متوسط 30 يوماً بنسبة ${__state.fmt1(v)} %. إن صمدت الوتيرة، فهو أفضل شهر لك.`,
        vWarn: (v) => `الشهر أدنى بـ${__state.fmt1(v)} % من متوسط 30 يوماً، دفعة في أمسيات نهاية الأسبوع تعيد التوازن.`,
        note: 'توقّع خطّي: يوم عطلة أو نهاية أسبوع ممطرة أو عملية خاصة قد تغيّر النتيجة الفعلية.',
      },
      breakeven: {
        text: () => `نقطة تعادلك، رقم المعاملات الذي يغطّي تماماً تكاليفك الثابتة (${__state.fmtMad(__state.B.totalOpex)}) بهامش مساهمة قدره ${__state.fmt1(__state.B.contribRatio * 100)} %.`,
        s1l: 'العتبة · رقم معاملات شهري', s1h: () => `مقابل ${__state.fmtMad(__state.B.revenue)} مُحقّق`,
        s2l: 'العتبة · طلبات/يوم', s2h: () => `مقابل ${__state.fmt(__state.B.ordersPerDay)} اليوم`,
        s3l: 'هامش الأمان', s3h: 'تراجع في النشاط يمكن استيعابه',
        s4l: 'العتبة · رقم معاملات يومي', s4h: () => `مقابل ${__state.fmtMad(__state.B.dailyRev)} مُحقّق`,
        vGood: () => `وضع متين، تشتغل بنسبة ${__state.fmt1(__state.B.marginOfSafety)} % فوق نقطة التعادل. ستحتاج إلى خسارة ثُلث النشاط تقريباً للوصول إليها.`,
      },
      margin: {
        text: 'هامشاك، على مدى آخر 30 يوماً:',
        s1l: 'الهامش الإجمالي', s1h: () => `${__state.fmtMad(__state.B.grossProfit)} بعد تكلفة المواد`,
        s2l: 'الهامش الصافي', s2h: () => `${__state.fmtMad(__state.B.netProfit)} بعد كل التكاليف`,
        s3l: 'تكلفة المواد', s3h: () => __state.fmtMad(__state.B.cogs),
        s4l: 'الربح لكل طلب', s4h: () => `متوسط السلة ${__state.fmtMad(__state.B.avgBasket)}`,
        vGood: () => `هامش صافٍ قدره ${__state.fmt1(__state.B.netMargin)} %, أعلى بكثير من متوسط قطاع المقاهي والمطاعم (8 إلى 12%). تكلفة موادك مضبوطة جيداً.`,
        note: 'الهامش الإجمالي يقيس ربحية القائمة؛ والهامش الصافي يقيس ربحية الاستغلال بأكمله.',
      },
      charges: {
        text: () => `مجموع تكاليفك الثابتة الشهرية <b>${__state.fmtMad(__state.B.totalOpex)}</b>، تُضاف إليها تكلفة المواد (${__state.fmtMad(__state.B.cogs)}).`,
        share: (p) => `${__state.fmt1(p)} % من التكاليف`,
        verdict: (name, p) => `«${name}» هو أكبر بند لديك (${__state.fmt1(p)} % من التكاليف), وهنا تكمن رافعة التحسين الرئيسية.`,
      },
      revenue: {
        text: 'نشاطك على مدى آخر 30 يوماً:',
        s1l: 'رقم المعاملات', s1h: 'آخر 30 يوماً',
        s2l: 'متوسط المداخيل / يوم', s2h: () => `${__state.fmt(__state.B.ordersPerDay)} طلب`,
        s3l: 'الطلبات / شهر', s3h: () => `متوسط السلة ${__state.fmtMad(__state.B.avgBasket)}`,
        s4l: 'الربح الصافي / شهر', s4h: () => `هامش صافٍ ${__state.fmt1(__state.B.netMargin)} %`,
      },
      profit: {
        text: 'نتيجتك، بعد أداء كل التكاليف:',
        s1l: 'الربح الصافي / شهر', s1h: () => `هامش صافٍ ${__state.fmt1(__state.B.netMargin)} %`,
        s2l: 'الربح الصافي / يوم', s2h: () => `${__state.B.daysOpen} يوم عمل`,
        s3l: 'الربح لكل طلب', s3h: () => `على سلة قدرها ${__state.fmtMad(__state.B.avgBasket)}`,
        s4l: 'ربح متوقّع / سنة', s4h: 'بالوتيرة الحالية',
        vGood: () => `مقهى رابح وسليم: تحقّق ${__state.fmtMad(__state.B.dailyNet)} ربحاً صافياً عن كل يوم عمل.`,
      },
      help: {
        text: 'مرحباً رشيد. أنا مساعدك المالي، أعرف Café Atlas: رقم المعاملات، تكلفة المواد، التكاليف، الهوامش والخزينة. اطرح سؤالاً رقمياً وأحسب الأثر الفعلي على نتيجتك؛ ولسؤال مفتوح حول تسيير مقهاك، يمكنني تشغيل مساعد ذكاء اصطناعي داخل متصفّحك. مثلاً:',
      },
      /* ⚠ best-effort MSA, flagged for native review like the rest of the AR set. */
      runway: {
        textOk: (m) => `أنت رابح اليوم، لذا خزينتك ليست عدّاً تنازلياً بل وسادة: تغطي <b>${__state.fmt1(m)} شهراً</b> من مجموع التكاليف لو توقف رقم المعاملات فجأة.`,
        textLoss: (m) => `بوتيرة الخسارة الحالية، تكفي خزينتك <b>${__state.fmt1(m)} شهراً</b>. هذا هو الوقت المتاح للتصحيح، وليس احتياطاً.`,
        s1l: 'الخزينة المتاحة', s1h: 'ما هو أمامك',
        s2lOk: 'الربح الصافي /شهر', s2hOk: 'ما يضيفه النشاط',
        s2lLoss: 'الخسارة الصافية /شهر', s2hLoss: 'ما يستهلكه النشاط',
        s3l: 'المصروفات الشهرية', s3h: 'التكاليف الثابتة + تكلفة المواد',
        s4l: 'أكبر بند', s4h: 'أثقل رافعة لديك',
        vOk: (m) => `وضع محتمل: ${__state.fmt1(m)} شهراً من التكاليف مغطاة دون أي عملية بيع. خطرك ليس السيولة، بل انخفاض دائم في رقم المعاملات.`,
        vLoss: (m) => `حالة عاجلة: ${__state.fmt1(m)} شهراً قبل النفاد. تحرّك على أكبر بند تكاليف ثم على نقطة التعادل، بهذا الترتيب.`,
        note: 'حساب بتكاليف ثابتة. مهلة من مورّد أو جدولة مع الضمان الاجتماعي أو تأجيل الكراء تُطيل هذه المدة، تحدّث عنها قبل أن تنفد سيولتك.',
      },
      guards: {
        negated: 'مفهوم، لن أُجري هذه المحاكاة. قل لي ما الذي تريد دراسته بدل ذلك، أو اختر من الأسفل.',
        meta: 'لا شيء هنا تخمين: كل رقم يأتي من آخر 30 يوماً مسجّلة في Kiwi، وكل محاكاة تطبّق قاعدة بسيطة على تلك الأرقام. رفع الأسعار يُطبَّق على رقم المعاملات دون المساس بتكلفة المواد؛ والتوظيف يُطرح من الربح الصافي؛ ونقطة التعادل تقسم تكاليفك الثابتة على نسبة هامشك. افتح «كل الأرقام» لمعرفة نقطة الانطلاق.',
        layoff: 'لا أستطيع تقدير أثر تقليص العمالة: أعرف كتلة أجورك الإجمالية، لا أجر كل شخص. هذا ما يمكنني عرضه، الوزن الحقيقي لكتلة الأجور في تكاليفك. وفي حالة إنهاء عقد، يفرض القانون المغربي الإشعار والتعويض، فليتحقق محاسبك من الحساب.',
        scoped: 'ليس لديّ هذا التفصيل. أشتغل على المجاميع، لا حسب الصنف ولا حسب يوم الأسبوع ولا حسب الشخص. الرقم الإجمالي لا ينطبق على منتج بعينه، وإعطاؤه لك على هذا الأساس سيضلّلك. تفصيل الأصناف في صفحة القائمة، وتفصيل المبيعات في المعاملات.',
        notrend: 'لا أستطيع مقارنة فترتين: أعمل على نافذة واحدة من 30 يوماً بلا تاريخ سابق. لذلك لا أقدر على قياس أثر قرار اتخذته فعلاً. ما أستطيعه هو محاكاة ما سيغيّره قرار انطلاقاً من اليوم.',
        illicit: 'لن أساعدك في هذا. Kiwi يمسك محاسبتك أيضاً، ولن أساعدك على إخفاء مداخيل أو التحايل على الضمان الاجتماعي أو الأداء دون الحد الأدنى القانوني، وتعريض نفسك لتصحيح ضريبي. لكن يمكنني خفض تكاليفك بطرق قانونية، وهذا هو المسار الحقيقي لأموالك.',
        unclear: 'لم أفهم سؤالك جيداً. أفهم الفرنسية والإنجليزية والعربية، وجزءاً كبيراً من الدارجة، لكن ليس كل شيء بعد. أعد صياغته أو اطرحه بطريقة أخرى: أحسب لك التوظيف، ورفع الأسعار، والاستثمار، ونقطة التعادل، والهوامش، والمصاريف، وتوقّع الشهر.',
        strainPartial: 'ليست لديّ بعد خزينتك ولا تكاليفك، لذا لا أستطيع حساب المدة التي تصمد فيها. أدخل مصاريفك في الهوامش وخزينتك حين تُتابَع، وسأعطيك هذا الرقم، فهو الأهم حين تشتدّ الأمور.',
        market: 'لا أقدّم نصائح استثمارية، لا في البورصة ولا في العملات الرقمية: ليس هذا عملي، وستُخاطر بأموالك بناءً على رأي لا أستطيع تبريره. ما أُتقنه هو أن أخبرك بما يدرّه محلّك وبما سيغيّره استثمار فيه.',
        secret: 'لا أعطي رموزاً ولا كلمات سرّ ولا بيانات تاجر آخر. لا أرى سوى مؤسستك أنت، وهذا مقصود. للوصول إلى حسابك مرّ عبر الإعدادات، أو عبر «الفريق» لرموز موظفيك.',
      },
      calc: { title: 'حساب', result: 'النتيجة' },
      llm: {
        runErr: 'حدث خطأ من جهة مساعد الذكاء الاصطناعي. أعد المحاولة، أو اطلب مني حساباً دقيقاً.',
        stop: 'إيقاف',
        unfitTail: 'ما أحسبه يبقى كاملاً: التوظيف، الأسعار، عتبة الربحية، التوقّعات، الهوامش، المصاريف، الخزينة، ومبيعاتك حسب الصنف والزبون واليوم.',
        privateLead: 'الوضع الخاص: هذا السؤال خارج نطاق حساباتي، وقد اخترت ألا يغادر أي شيء هذا الجهاز. يمكنك تفعيل الذكاء الاصطناعي عبر الخادم من اللوحة الجانبية.',
        unavailable: 'هذا السؤال خارج نطاق حساباتي، وخادم Kiwi غير متاح حالياً.',
        cloudLead: 'هذا السؤال خارج حساباتي المعدّة مسبقاً. يمكن لـ Kiwi الإجابة عنه من خوادمه.',
        cloudPrivacy: 'بصراحة: في هذا الوضع يُرسل سؤالك وأرقام محلّك اللازمة للإجابة إلى Kiwi لمعالجتها بشكل آمن. في الوضع الخاص لا يغادر أي شيء، وتبقى حساباتي كاملة. تختار مرة واحدة، ويمكن تغييره من اللوحة.',
        cloudActivate: 'الإجابة من خوادم Kiwi',
        cloudDecline: 'لا، شكراً · الاكتفاء بحساباتي',
        cloudQuota: 'بلغ المساعد على الخادم حدّه اليومي لمحلّك. يُستأنف غداً، وحساباتي تبقى كاملة حتى ذلك الحين.',
        cloudAuth: 'هذا السؤال خارج حساباتي. إجابات الخادم تتطلب حساب Kiwi مسجّل الدخول، والعرض التجريبي لا يوفرها.',
        privateNative: 'هذا السؤال خارج حساباتي والذكاء الاصطناعي متوقف. فعّله من القائمة ☰ › خصوصية Kiwi AI.',
      },
      acct: {
        hub: 'أنا أيضاً محاسبك وماسك دفاترك ومستشارك الضريبي ومدير أجورك، كل ذلك مجتمع في قسم المحاسبة: الدفتر، القوائم المالية، الضريبة والرسوم، والأجور.',
        tva: (D) => `سأتكفّل بضرائبك. لـ ${D.period}: الضريبة المستحقة <b>${__state.fmtMad(D.tva.aPayer)}</b>، الأجل ${D.tva.echeance}. الضريبة على الشركات المقدّرة للسنة: ${__state.fmtMad(D.is.estimeAnnuel)}. أفتح الوحدة لتحضير التصريح.`,
        paie: (D) => `بخصوص الأجور: <b>${D.payroll.headcount} موظفين</b>، ${__state.fmtMad(D.payroll.totalNet)} صافٍ للدفع عن ${D.period}. تصريح CNSS مستحق في ${D.payroll.echeance}, يمكنني إنشاء كشوف الرواتب.`,
        etats: (D) => `قوائم ${D.period}: النتيجة الصافية <b>${__state.fmtMad(D.netProfit)}</b>، الخزينة ${__state.fmtMad(D.cash)}، ميزانية متوازنة. أفتح قوائمك المالية.`,
        livre: (D) => `<b>${__state.fmt(D.entriesThisMonth)} قيد</b> هذا الشهر، كل عملية بيع ونفقة، مسجّلة ومصنّفة تلقائياً.`,
      },
    },
  };
    return { menuContextLines, liveActivityContextLines, buildSystemPrompt, injectCss, replyHtml, open, salesWindowEvidence, detectQLang, parseAmount, parseAllAmounts, evalMath, partialReply, sHire, sPrice, sAfford, sForecast, sAdvice, sBreakEvenReal, sChargesReal, sBreakEven, sMargin, sCharges, sRevenue, sProfit, assistantUiCopy, renderHero, sHelp, sRunway, parseDays, ramadanNext, sRamadan, sSeason, sGoal, windowStats, dayStart, metaLine, sLookup, sDay, sStock, sClients, sOverview, sFinancing, sExpansion, sValuation, sAccounting, sCalc, sCompound, matchAction, opWhy, sOperation, namedDay, periodWindow, hoursSpec, matchLookupKind, namedBusiness, within1, transposed, fuzz, classify, decideRoute, featureCanTake, respond, runEval, runConvoTest, runGuardTest, llmChunkText, stripThink, noteTurnEvidence, noteTurnFacts, runTool, extractMad, knownFigures, auditNumbers, knownPercents, knownCounts, redactUnsupported, T };
  };
})();
