/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · pages-pro-spa-starter.js — sorti de pages-pro.js le 22 octobre 2026
 *
 * Section 2 spa · clients, puis les pages de départ des établissements créés
 * par le commerçant (enveloppe de chaque destination, posée à window.load).
 * Sections recopiées telles quelles, chacune dans son IIFE comme avant.
 * Chargé après pages-pro-boutique.js : ces deux IIFE fermaient pages-pro.js.
 * ─────────────────────────────────────────────────────────────────────────── */

/* ═══ Section 2 spa · clients ═══ */
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Spa Bahia · sidebar handler · nav-clients
 * Mindbody / Booksy / Vagaro CRM-tier client list with profile drawer.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  const Kiwi = window.Kiwi || {};
  const handlers = Kiwi.handlers;
  if (!handlers) return;
  const { toast, modal, drawer, confetti } = Kiwi;

  /* ─── Inject local CSS once ─── */
  if (!document.getElementById('spa-clients-css')) {
    const s = document.createElement('style');
    s.id = 'spa-clients-css';
    s.textContent = `
    .sc-pills { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 14px; padding: 4px; background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 12px; }
    html[data-theme="dark"] .sc-pills { background: var(--paper-muted); }
    .sc-pill { flex: 0 0 auto; padding: 8px 14px; border-radius: 9px; font-size: 12.5px; font-weight: 500; color: var(--n-500); cursor: pointer; transition: background 150ms, color 150ms; display: inline-flex; align-items: center; gap: 7px; border: 0; background: none; font-family: var(--sans); }
    .sc-pill:hover { color: var(--ink); }
    .sc-pill.on { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    html[data-theme="dark"] .sc-pill.on { background: var(--ink-soft); color: var(--paper); }
    .sc-pill .ct { font-family: var(--mono); font-size: 11px; color: var(--n-500); background: var(--n-100); padding: 1px 7px; border-radius: 999px; letter-spacing: 0.04em; }
    .sc-pill.on .ct { background: var(--mint-soft); color: var(--atlas); }

    .sc-flag { display: inline-block; width: 12px; height: 8px; border-radius: 2px; vertical-align: middle; margin-right: 7px; box-shadow: inset 0 0 0 1px rgba(10,15,13,0.08); }
    .sc-flag.ma { background: linear-gradient(180deg, #C1272D 50%, #C1272D 50%); }
    .sc-flag.fr { background: linear-gradient(90deg, #002395 33%, #fff 33% 66%, #ED2939 66%); }
    .sc-flag.es { background: linear-gradient(180deg, #AA151B 25%, #F1BF00 25% 75%, #AA151B 75%); }
    .sc-flag.us { background: linear-gradient(180deg, #B22234 50%, #fff 50%); }
    .sc-flag.de { background: linear-gradient(180deg, #000 33%, #DD0000 33% 66%, #FFCE00 66%); }

    .sc-tier { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; font-family: var(--mono); letter-spacing: 0.06em; text-transform: uppercase; }
    .sc-tier.bronze { background: rgba(217,154,43,0.16); color: var(--warn-ink); }
    .sc-tier.argent { background: var(--n-100); color: var(--n-600); }
    .sc-tier.or { background: var(--mint-soft); color: var(--atlas); }
    .sc-tier.platine { background: var(--riad); color: var(--mint); }
    html[data-theme="dark"] .sc-tier.argent { background: rgba(255,255,255,0.06); color: var(--paper); }

    .sc-bday { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px; background: rgba(217,154,43,0.18); color: var(--warn-ink); font-size: 11px; font-weight: 500; font-family: var(--mono); letter-spacing: 0.04em; margin-left: 6px; }
    html[data-theme="dark"] .sc-bday { background: rgba(217,154,43,0.22); color: #E5B764; }

    .sc-bday-panel { background: linear-gradient(135deg, rgba(217,154,43,0.14), rgba(217,154,43,0.04)); border: 1px solid rgba(217,154,43,0.32); border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
    .sc-bday-panel .ic { width: 40px; height: 40px; border-radius: 10px; background: rgba(217,154,43,0.22); color: var(--warn-ink); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .sc-bday-panel .body { flex: 1; min-width: 220px; }
    .sc-bday-panel .body .t { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
    .sc-bday-panel .body .d { font-size: 12px; color: var(--n-600); margin-top: 3px; line-height: 1.45; }

    .sc-empty { padding: 40px 20px; text-align: center; color: var(--n-500); font-size: 13px; }

    .sc-prof-head { display: grid; grid-template-columns: 56px 1fr auto; gap: 16px; align-items: center; padding: 4px 0 14px; border-bottom: 1px solid var(--n-200); margin-bottom: 14px; }
    .sc-prof-av { width: 56px; height: 56px; border-radius: 50%; background: var(--atlas); color: var(--paper); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 20px; letter-spacing: -0.02em; }
    .sc-prof-av.platine { background: var(--riad); color: var(--mint); }
    .sc-prof-av.or { background: var(--atlas); }
    .sc-prof-av.argent { background: var(--n-500); }
    .sc-prof-av.bronze { background: #D99A2B; }
    .sc-prof-meta { font-family: var(--mono); font-size: 11px; color: var(--n-500); margin-top: 4px; letter-spacing: 0.04em; }

    .sc-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; font-size: 13px; margin-top: 4px; }
    .sc-info-grid dt { color: var(--n-500); padding: 6px 0; border-bottom: 1px solid var(--n-200); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; font-family: var(--mono); }
    .sc-info-grid dd { margin: 0; padding: 6px 0; border-bottom: 1px solid var(--n-200); text-align: right; font-weight: 500; }

    .sc-allergy { background: rgba(195,49,33,0.08); border: 1px solid rgba(195,49,33,0.2); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; display: flex; gap: 10px; align-items: flex-start; }
    .sc-allergy .ic { width: 28px; height: 28px; border-radius: 8px; background: rgba(195,49,33,0.16); color: #9B2F22; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .sc-allergy .b { flex: 1; }
    .sc-allergy .b .t { font-size: 13px; font-weight: 600; color: #9B2F22; letter-spacing: -0.01em; }
    .sc-allergy .b .d { font-size: 12px; color: var(--n-600); margin-top: 3px; line-height: 1.45; }

    .sc-history-row { display: grid; grid-template-columns: 80px 1fr 110px 70px; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--n-200); font-size: 12.5px; }
    .sc-history-row:first-of-type { border-top: 0; }
    .sc-history-row .dt { font-family: var(--mono); font-size: 11px; color: var(--n-500); letter-spacing: 0.04em; }
    .sc-history-row .svc { font-weight: 500; font-size: 13px; }
    .sc-history-row .pr { font-family: var(--mono); font-weight: 600; text-align: right; font-feature-settings: "tnum" 1; }
    .sc-history-row .pra { font-size: 11.5px; color: var(--n-500); }

    .sc-gift { background: linear-gradient(135deg, var(--inverse-surface), #15201A); color: var(--inverse-ink); border-radius: 14px; padding: 18px; margin-bottom: 12px; position: relative; overflow: hidden; }
    .sc-gift::after { content: ""; position: absolute; right: -50px; top: -50px; width: 160px; height: 160px; background: radial-gradient(circle, var(--mint), transparent 60%); opacity: 0.18; pointer-events: none; }
    .sc-gift .l { font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; color: var(--mint); }
    .sc-gift .v { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; margin-top: 4px; font-feature-settings: "tnum" 1; }
    .sc-gift .s { font-size: 12px; color: #c6ead4; margin-top: 4px; }
    .sc-gift .ac { display: flex; gap: 8px; margin-top: 12px; position: relative; z-index: 1; }
    /* Climat sombre : la carte cadeau ne peut plus « descendre » vers le noir·
     * la page l'est déjà, et l'arrivée opaque #15201A pose un bloc mat au milieu
     * d'un panneau translucide. Elle monte à la place, comme tous les inverses
     * de ce climat. En clair la règle de base reste la bonne : vert profond vers
     * presque-noir, texte bone par-dessus. */
    html[data-theme="dark"] .sc-gift { background: linear-gradient(135deg, var(--inverse-surface), var(--inverse-line)); }

    .sc-amounts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
    .sc-amount { padding: 12px 8px; background: var(--surface); border: 1px solid var(--n-200); border-radius: 10px; text-align: center; cursor: pointer; transition: transform 150ms, opacity 150ms, background-color 150ms, border-color 150ms, color 150ms, box-shadow 150ms; font-family: var(--mono); font-size: 13px; font-weight: 500; }
    html[data-theme="dark"] .sc-amount { background: var(--paper-soft); }
    .sc-amount:hover { border-color: var(--atlas); }
    .sc-amount.on { background: var(--atlas); color: var(--paper); border-color: var(--atlas); }

    .sc-wa-preview { background: #ECE5DD; border-radius: 14px; padding: 14px; margin: 12px 0; }
    html[data-theme="dark"] .sc-wa-preview { background: var(--paper-muted); }
    .sc-wa-bubble { background: #DCF8C6; border-radius: 8px 8px 8px 2px; padding: 10px 12px; max-width: 90%; font-size: 13px; color: #0A0F0D; line-height: 1.5; }
    html[data-theme="dark"] .sc-wa-bubble { background: rgba(125,242,176,0.18); color: var(--paper); }
    .sc-wa-time { font-size: 11px; color: var(--n-500); margin-top: 4px; text-align: right; font-family: var(--mono); }

    .sc-table tbody tr.sc-hide { display: none; }
    `;
    document.head.appendChild(s);
  }

  /* ─── Data ─── */
  const PRACTITIONERS = ['Nour', 'Salma', 'Yasmine', 'Imane'];
  const SERVICES = [
    'Hammam Royal',
    'Massage Argan 60min',
    'Massage Pierres Chaudes',
    'Soin Visage Hydratant',
    'Gommage Beldi',
    'Manucure Spa',
    'Pédicure Marrakchia',
    'Rituel Kessa',
    'Massage Californien',
    'Soin Anti-Âge',
  ];
  const CLIENTS = [
    { id: 1, fn: 'Lisa', ln: 'P.', flag: 'us', ltv: 38000, fav: 'Nour', last: "Aujourd'hui", tier: 'platine', bday: true, allergies: ['Allergie aux huiles essentielles d\'agrumes'], iban: 'US •• 8412' },
    { id: 2, fn: 'Anna', ln: 'M.', flag: 'de', ltv: 18200, fav: 'Nour', last: 'Hier', tier: 'or', bday: false, allergies: [] },
    { id: 3, fn: 'Sophie', ln: 'L.', flag: 'fr', ltv: 8400, fav: 'Salma', last: 'Il y a 3j', tier: 'argent', bday: true, allergies: [] },
    { id: 4, fn: 'Yasmine', ln: 'T.', flag: 'ma', ltv: 22100, fav: 'Yasmine', last: 'Il y a 1 sem', tier: 'or', bday: false, allergies: ['Peau sensible, éviter cire chaude'] },
    { id: 5, fn: 'Imane', ln: 'S.', flag: 'ma', ltv: 16800, fav: 'Nour', last: "Aujourd'hui", tier: 'or', bday: false, allergies: [] },
    { id: 6, fn: 'Karim', ln: 'L.', flag: 'ma', ltv: 6800, fav: 'Yasmine', last: 'Il y a 2 sem', tier: 'argent', bday: false, allergies: [] },
    { id: 7, fn: 'Camille', ln: 'R.', flag: 'fr', ltv: 9200, fav: 'Salma', last: 'Hier', tier: 'argent', bday: false, allergies: [] },
    { id: 8, fn: 'Lucia', ln: 'M.', flag: 'es', ltv: 7100, fav: 'Salma', last: 'Il y a 3j', tier: 'argent', bday: false, allergies: [] },
    { id: 9, fn: 'Diana', ln: 'K.', flag: 'us', ltv: 3200, fav: 'Yasmine', last: 'Il y a 1 mois', tier: 'bronze', bday: false, allergies: [] },
    { id: 10, fn: 'Karen', ln: 'B.', flag: 'us', ltv: 4200, fav: 'Salma', last: 'Il y a 2 sem', tier: 'bronze', bday: false, allergies: [] },
    { id: 11, fn: 'Manon', ln: 'B.', flag: 'fr', ltv: 5400, fav: 'Imane', last: 'Il y a 1 sem', tier: 'argent', bday: false, allergies: [] },
    { id: 12, fn: 'Hicham', ln: 'R.', flag: 'ma', ltv: 2800, fav: 'Yasmine', last: 'Il y a 3 mois', tier: 'bronze', bday: false, allergies: [] },
    { id: 13, fn: 'Salma', ln: 'O.', flag: 'ma', ltv: 19400, fav: 'Nour', last: 'Hier', tier: 'or', bday: false, allergies: [] },
    { id: 14, fn: 'Marion', ln: 'K.', flag: 'fr', ltv: 31600, fav: 'Salma', last: "Aujourd'hui", tier: 'platine', bday: true, allergies: ['Cicatrice récente, éviter zone lombaire'], iban: 'FR •• 2207' },
    { id: 15, fn: 'Aïcha', ln: 'B.', flag: 'ma', ltv: 8100, fav: 'Imane', last: 'Il y a 1 sem', tier: 'argent', bday: false, allergies: [] },
    { id: 16, fn: 'Mehdi', ln: 'C.', flag: 'ma', ltv: 1400, fav: 'Yasmine', last: 'Il y a 3 mois', tier: 'bronze', bday: false, allergies: [] },
    { id: 17, fn: 'Emma', ln: 'D.', flag: 'fr', ltv: 12700, fav: 'Nour', last: 'Hier', tier: 'argent', bday: false, allergies: [] },
    { id: 18, fn: 'Mariana', ln: 'V.', flag: 'es', ltv: 14800, fav: 'Salma', last: 'Il y a 3j', tier: 'argent', bday: false, allergies: [] },
    { id: 19, fn: 'Fatima', ln: 'Z.', flag: 'ma', ltv: 24600, fav: 'Nour', last: "Aujourd'hui", tier: 'or', bday: false, allergies: ['Hypertension, pression douce uniquement'] },
    { id: 20, fn: 'Léa', ln: 'G.', flag: 'fr', ltv: 6200, fav: 'Imane', last: 'Il y a 2 sem', tier: 'argent', bday: false, allergies: [] },
    { id: 21, fn: 'Helga', ln: 'W.', flag: 'de', ltv: 11400, fav: 'Salma', last: 'Il y a 1 sem', tier: 'argent', bday: false, allergies: [] },
    { id: 22, fn: 'Jessica', ln: 'H.', flag: 'us', ltv: 9800, fav: 'Yasmine', last: 'Il y a 3j', tier: 'argent', bday: false, allergies: [] },
    { id: 23, fn: 'Carolina', ln: 'F.', flag: 'es', ltv: 3700, fav: 'Imane', last: 'Il y a 1 mois', tier: 'bronze', bday: false, allergies: [] },
    { id: 24, fn: 'Nawal', ln: 'A.', flag: 'ma', ltv: 28400, fav: 'Nour', last: 'Hier', tier: 'or', bday: false, allergies: [] },
    { id: 25, fn: 'Olivier', ln: 'P.', flag: 'fr', ltv: 4900, fav: 'Yasmine', last: 'Il y a 2 sem', tier: 'bronze', bday: false, allergies: [] },
    { id: 26, fn: 'Rachel', ln: 'S.', flag: 'us', ltv: 17200, fav: 'Nour', last: "Aujourd'hui", tier: 'or', bday: false, allergies: ['Asthme, éviter huiles fortes'] },
    { id: 27, fn: 'Klaus', ln: 'B.', flag: 'de', ltv: 5600, fav: 'Salma', last: 'Il y a 1 sem', tier: 'argent', bday: false, allergies: [] },
    { id: 28, fn: 'Inès', ln: 'M.', flag: 'fr', ltv: 35200, fav: 'Nour', last: 'Hier', tier: 'platine', bday: false, allergies: [], iban: 'FR •• 7180' },
    { id: 29, fn: 'Soukaina', ln: 'E.', flag: 'ma', ltv: 13900, fav: 'Imane', last: 'Il y a 3j', tier: 'argent', bday: false, allergies: [] },
    { id: 30, fn: 'Pablo', ln: 'C.', flag: 'es', ltv: 2300, fav: 'Yasmine', last: 'Il y a 1 mois', tier: 'bronze', bday: false, allergies: [] },
  ];

  const fmtMAD = (n) => (window.KiwiNumber?.format(n, {}) ?? n.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}));
  const tierLabel = { bronze: 'Bronze', argent: 'Argent', or: 'Or', platine: 'Platine' };
  const isNew = (c) => c.last === "Aujourd'hui" || c.last === 'Hier';
  const isFidele = (c) => c.ltv >= 5000 && c.ltv < 30000;
  const isVIP = (c) => c.tier === 'or' || c.tier === 'platine';

  /* ─── History generator ─── */
  function buildHistory(c) {
    const out = [];
    const dates = ["Aujourd'hui", 'Il y a 5j', 'Il y a 12j', 'Il y a 3 sem', 'Il y a 1 mois', 'Il y a 2 mois', 'Il y a 3 mois', 'Il y a 5 mois'];
    let seed = c.id;
    for (let i = 0; i < 8; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const sv = SERVICES[Math.floor((seed / 233280) * SERVICES.length)];
      seed = (seed * 9301 + 49297) % 233280;
      const pr = 350 + Math.floor((seed / 233280) * 9) * 150;
      seed = (seed * 9301 + 49297) % 233280;
      const pra = PRACTITIONERS[Math.floor((seed / 233280) * PRACTITIONERS.length)];
      out.push({ d: dates[i], s: sv, pra, p: pr });
    }
    return out;
  }

  /* ─── Row renderer ─── */
  function rowHTML(c) {
    const bdayChip = c.bday ? `<span class="sc-bday">Anniv. avril</span>` : '';
    return `
      <tr data-spa-row data-spa-id="${c.id}" data-spa-tier="${c.tier}" data-spa-new="${isNew(c) ? 1 : 0}" data-spa-fid="${isFidele(c) ? 1 : 0}" data-spa-vip="${isVIP(c) ? 1 : 0}" data-spa-bday="${c.bday ? 1 : 0}">
        <td><span class="sc-flag ${c.flag}"></span><b>${c.fn} ${c.ln}</b>${bdayChip}</td>
        <td style="color:var(--n-600);">${c.last}</td>
        <td class="mono right">${fmtMAD(c.ltv)} <span style="color: var(--n-500); font-size:11px;">MAD</span></td>
        <td>${c.fav}</td>
        <td><span class="sc-tier ${c.tier}">${tierLabel[c.tier]}</span></td>
      </tr>
    `;
  }

  /* ─── Profile drawer ─── */
  function openProfile(id) {
    const c = CLIENTS.find((x) => x.id === id);
    if (!c) return;
    const history = buildHistory(c);
    const giftBalance = c.tier === 'platine' ? 1500 : c.tier === 'or' ? 800 : c.tier === 'argent' ? 250 : 0;
    const initials = (c.fn[0] + c.ln[0]).toUpperCase();
    const allergiesHTML = c.allergies.length
      ? c.allergies.map((a) => `
        <div class="sc-allergy">
          <div class="ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg></div>
          <div class="b"><div class="t">Contre-indication</div><div class="d">${a}</div></div>
        </div>
      `).join('')
      : `<div style="font-size:12.5px; color:var(--n-500); padding:8px 0;">Aucune allergie ou contre-indication signalée.</div>`;
    drawer({
      title: `${c.fn} ${c.ln}`,
      subtitle: `Membre ${tierLabel[c.tier]} · ${fmtMAD(c.ltv)} MAD à vie`,
      width: 560,
      body: `
        <div class="sc-prof-head">
          <div class="sc-prof-av ${c.tier}">${initials}</div>
          <div>
            <div style="font-size:15px; font-weight:600; letter-spacing:-0.01em;"><span class="sc-flag ${c.flag}"></span>${c.fn} ${c.ln} <span class="sc-tier ${c.tier}" style="margin-left:6px;">${tierLabel[c.tier]}</span></div>
            <div class="sc-prof-meta">CL-${String(c.id).padStart(4, '0')} · Praticienne fav. ${c.fav}${c.bday ? ' · Anniv. ce mois' : ''}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="kb ghost" data-action="spa-cli-block" data-arg="${c.id}" style="padding:7px 12px; font-size:12px;">Bloquer</button>
          </div>
        </div>

        <div class="p-card">
          <div class="head"><h4>Coordonnées</h4></div>
          <dl class="sc-info-grid">
            <dt>Téléphone</dt><dd class="mono">+212 6 ${20 + (c.id % 80)} ${10 + (c.id * 3) % 90} ${c.id * 7 % 100} ${c.id * 11 % 100}</dd>
            <dt>Email</dt><dd>${c.fn.toLowerCase()}.${c.ln[0].toLowerCase()}@mail.com</dd>
            <dt>Langue</dt><dd>${c.flag === 'fr' ? 'Français' : c.flag === 'ma' ? 'العربية / Français' : c.flag === 'es' ? 'Español' : c.flag === 'de' ? 'Deutsch' : 'English'}</dd>
            <dt>Source</dt><dd>${c.tier === 'platine' ? 'Concierge hôtel' : c.tier === 'or' ? 'Recommandation' : 'Walk-in'}</dd>
            ${c.iban ? `<dt>IBAN VIP</dt><dd class="mono">${c.iban}</dd>` : ''}
          </dl>
          <div style="display:flex; gap:8px; margin-top:14px;">
            <button class="kb atlas" data-action="spa-cli-wa" data-arg="${c.id}" style="flex:1; justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-9 8.5 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.2A8.38 8.38 0 013 11.5a8.5 8.5 0 0118 0z"/></svg>Rappel WhatsApp</button>
            ${c.bday ? `<button class="kb ghost" data-action="spa-cli-bday" data-arg="${c.id}" style="flex:1; justify-content:center;">Vœux + 15%</button>` : ''}
          </div>
        </div>

        ${c.allergies.length ? `<div class="p-card" style="background:rgba(195,49,33,0.04); border-color:rgba(195,49,33,0.2);"><div class="head"><h4 style="color:#9B2F22;">Allergies & contre-indications</h4></div>${allergiesHTML}</div>` : ''}

        <div class="p-card">
          <div class="head"><h4>Historique des soins</h4><span class="meta">${history.length} dernières séances</span></div>
          ${history.map((h) => `
            <div class="sc-history-row">
              <div class="dt">${h.d}</div>
              <div><div class="svc">${h.s}</div><div class="pra">avec ${h.pra}</div></div>
              <div class="pr">${fmtMAD(h.p)} MAD</div>
              <div style="text-align:right;"><span class="chip ok">Réglé</span></div>
            </div>
          `).join('')}
        </div>

        <div class="sc-gift">
          <div class="l">CARTE CADEAU</div>
          <div class="v">${fmtMAD(giftBalance)} <span style="font-size:14px; opacity:0.7;">MAD</span></div>
          <div class="s">${giftBalance > 0 ? 'Solde disponible · expire dans 11 mois' : 'Aucune carte active'}</div>
          <div class="ac">
            <button class="kb" style="background:var(--mint); color:var(--riad); padding:8px 14px; font-size:12.5px;" data-action="spa-cli-gift" data-arg="${c.id}">+ Émettre une carte</button>
          </div>
        </div>

        <div class="p-card">
          <div class="head"><h4>Recommandations à domicile</h4><button class="kb ghost" data-action="spa-cli-note" data-arg="${c.id}" style="padding:5px 10px; font-size:11.5px;">Modifier</button></div>
          <div style="font-size:13px; color:var(--n-700); line-height:1.55; padding:8px 0;">
            ${c.tier === 'platine' || c.tier === 'or' ? 'Application matin : sérum hyaluronique. Soir : crème argan + 3 gouttes huile de figue de Barbarie. Hammam maison 2× / semaine.' : 'Hydratation quotidienne, exfoliation hebdomadaire au gommage Beldi. Suivi dans 4 semaines.'}
          </div>
        </div>
      `,
      foot: `
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="kb ghost" data-action="dismiss-drawer">Fermer</button>
          <button class="kb primary" data-action="spa-cli-book" data-arg="${c.id}">Réserver une séance</button>
        </div>
      `,
    });
  }

  /* ─── Auxiliary handlers ─── */
  handlers['spa-cli-search'] = () => toast('Recherche client', { desc: 'Recherche en temps réel par nom, téléphone, email.', type: 'info' });
  handlers['spa-cli-add'] = () => {
    modal({
      title: 'Nouveau client',
      tag: 'CRM SPA BAHIA',
      desc: 'Fiche client minimale, détails complétés à la première visite.',
      width: 560,
      body: `
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Prénom</label><input class="kf-input" value="Camélia" /></div>
          <div class="kf-group"><label class="kf-label">Nom</label><input class="kf-input" value="Bensaid" /></div>
        </div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Téléphone</label><input class="kf-input" value="+212 6 12 34 56 78" /></div>
          <div class="kf-group"><label class="kf-label">Email</label><input class="kf-input" value="camelia.b@mail.com" /></div>
        </div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Langue préférée</label><select class="kf-input"><option>Français</option><option>العربية</option><option>English</option><option>Español</option><option>Deutsch</option></select></div>
          <div class="kf-group"><label class="kf-label">Source</label><select class="kf-input"><option>Walk-in</option><option>Concierge hôtel</option><option>Recommandation</option><option>Instagram</option></select></div>
        </div>
        <div class="kf-group"><label class="kf-label">Allergies / contre-indications</label><textarea class="kf-input" rows="3" placeholder="Ex : peau sensible, hypertension, allergie aux huiles d'agrumes…"></textarea></div>
      `,
      foot: `<button class="kb ghost" data-action="dismiss-modal">Annuler</button><button class="kb primary" data-action="spa-cli-add-confirm">Créer la fiche</button>`,
    });
  };
  handlers['spa-cli-add-confirm'] = () => {
    document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
    confetti();
    toast('Fiche client créée', { desc: 'Camélia Bensaid · ajoutée au CRM Spa Bahia.', type: 'success' });
  };
  handlers['spa-cli-row'] = (el) => openProfile(+el.dataset.arg);
  handlers['spa-cli-wa'] = (el) => {
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    modal({
      title: 'Rappel WhatsApp',
      tag: 'BAHIA SPA',
      desc: `Aperçu du message envoyé à ${c.fn} ${c.ln}.`,
      width: 480,
      body: `
        <div class="sc-wa-preview">
          <div class="sc-wa-bubble">
            Bonjour ${c.fn}, c'est Bahia Spa Hivernage. Votre praticienne ${c.fav} a un créneau libre demain à 15h pour votre soin habituel. Souhaitez-vous confirmer ?
            <div class="sc-wa-time">14:32 ✓✓</div>
          </div>
        </div>
        <textarea class="kf-input" rows="3">Bonjour ${c.fn}, c'est Bahia Spa Hivernage. Votre praticienne ${c.fav} a un créneau libre demain à 15h pour votre soin habituel.</textarea>
      `,
      foot: `<button class="kb ghost" data-action="dismiss-modal">Annuler</button><button class="kb atlas" data-action="spa-cli-wa-send" data-arg="${c.id}">Envoyer via WhatsApp Business</button>`,
    });
  };
  handlers['spa-cli-wa-send'] = (el) => {
    document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    toast('Message envoyé', { desc: `WhatsApp livré à ${c.fn} ${c.ln}. Lecture dans ~3 min en moyenne.`, type: 'success' });
  };
  handlers['spa-cli-bday'] = (el) => {
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    modal({
      title: 'Vœux d\'anniversaire',
      tag: 'CADEAU FIDÉLITÉ',
      desc: `Code -15% valable 30 jours · joint au message pour ${c.fn}.`,
      width: 480,
      body: `
        <div class="sc-wa-preview">
          <div class="sc-wa-bubble">
            Joyeux anniversaire ${c.fn} ! Toute l'équipe Bahia Spa vous offre <b>15% de réduction</b> sur votre prochaine séance, code BAHIA-${c.fn.toUpperCase().slice(0, 3)}15, valable 30 jours.
            <div class="sc-wa-time">15:08 ✓✓</div>
          </div>
        </div>
      `,
      foot: `<button class="kb ghost" data-action="dismiss-modal">Annuler</button><button class="kb atlas" data-action="spa-cli-bday-send" data-arg="${c.id}">Envoyer les vœux</button>`,
    });
  };
  handlers['spa-cli-bday-send'] = (el) => {
    document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
    confetti();
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    toast('Vœux envoyés', { desc: `Code -15% remis à ${c.fn}. Notification de réception dans 30s.`, type: 'success' });
  };
  handlers['spa-cli-bday-batch'] = () => {
    const list = CLIENTS.filter((c) => c.bday);
    modal({
      title: 'Vœux groupés · 3 clientes',
      tag: 'CAMPAGNE AVRIL',
      desc: 'Aperçu unique · personnalisé automatiquement par client.',
      width: 540,
      body: `
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:14px;">
          ${list.map((c) => `<div style="display:flex; gap:10px; align-items:center; padding:10px 12px; background:var(--paper-soft); border-radius:10px;"><div class="sc-prof-av ${c.tier}" style="width:36px; height:36px; font-size:13px;">${(c.fn[0] + c.ln[0]).toUpperCase()}</div><div style="flex:1;"><div style="font-weight:500; font-size:13.5px;">${c.fn} ${c.ln}</div><div style="font-size:11.5px; color:var(--n-500);">${tierLabel[c.tier]} · ${fmtMAD(c.ltv)} MAD à vie</div></div><span class="chip ok">Prêt</span></div>`).join('')}
        </div>
        <div class="sc-wa-preview">
          <div class="sc-wa-bubble">Joyeux anniversaire {Prénom} ! L'équipe Bahia Spa vous offre <b>15% de réduction</b> sur votre prochaine séance, code BAHIA-{XXX}15.<div class="sc-wa-time">15:08 ✓✓</div></div>
        </div>
      `,
      foot: `<button class="kb ghost" data-action="dismiss-modal">Annuler</button><button class="kb atlas" data-action="spa-cli-bday-batch-send">Envoyer aux 3 clientes</button>`,
    });
  };
  handlers['spa-cli-bday-batch-send'] = () => {
    document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
    confetti();
    toast('Campagne envoyée', { desc: '3 messages WhatsApp livrés · taux de lecture estimé 92%.', type: 'success' });
  };
  handlers['spa-cli-gift'] = (el) => {
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    modal({
      title: 'Émettre une carte cadeau',
      tag: c.fn.toUpperCase() + ' ' + c.ln.toUpperCase(),
      desc: 'Carte numérique livrée par WhatsApp + email avec QR de validation.',
      width: 480,
      body: `
        <label class="kf-label">Montant</label>
        <div class="sc-amounts">
          <div class="sc-amount">300</div>
          <div class="sc-amount on">500</div>
          <div class="sc-amount">1 000</div>
          <div class="sc-amount">2 500</div>
        </div>
        <div class="kf-help">MAD · valable 12 mois · transferable une fois</div>
        <div class="kf-group" style="margin-top:14px;"><label class="kf-label">Message personnalisé</label><textarea class="kf-input" rows="2" placeholder="De la part de…">Pour ta journée détente, l'équipe Bahia.</textarea></div>
      `,
      foot: `<button class="kb ghost" data-action="dismiss-modal">Annuler</button><button class="kb primary" data-action="spa-cli-gift-confirm" data-arg="${c.id}">Émettre · 500 MAD</button>`,
    });
    setTimeout(() => {
      document.querySelectorAll('.sc-amount').forEach((a) => {
        a.onclick = () => { document.querySelectorAll('.sc-amount').forEach((x) => x.classList.remove('on')); a.classList.add('on'); };
      });
    }, 0);
  };
  handlers['spa-cli-gift-confirm'] = () => {
    document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
    confetti();
    toast('Carte cadeau émise', { desc: 'QR + email livrés · solde 500 MAD activé.', type: 'success' });
  };
  handlers['spa-cli-block'] = (el) => {
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    modal({
      title: 'Bloquer ce client ?',
      desc: `${c.fn} ${c.ln} ne pourra plus réserver en ligne ni recevoir de campagnes. Action réversible.`,
      width: 440,
      body: `<div class="kf-group"><label class="kf-label">Motif (interne)</label><textarea class="kf-input" rows="3" placeholder="Comportement inapproprié, no-show répété…"></textarea></div>`,
      foot: `<button class="kb ghost" data-action="dismiss-modal">Annuler</button><button class="kb danger" data-action="spa-cli-block-confirm" data-arg="${c.id}">Confirmer le blocage</button>`,
    });
  };
  handlers['spa-cli-block-confirm'] = (el) => {
    document.querySelector('.kiwi-backdrop')?.querySelector('.kiwi-modal-close')?.click();
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    toast('Client bloqué', { desc: `${c.fn} ${c.ln} retiré des campagnes et de la réservation en ligne.`, type: 'warn' });
  };
  handlers['spa-cli-note'] = () => toast('Édition activée', { desc: 'Recommandations modifiables · auto-save 2s.', type: 'info' });
  handlers['spa-cli-book'] = (el) => {
    const c = CLIENTS.find((x) => x.id === +el.dataset.arg);
    toast('Calendrier ouvert', { desc: `Réservation pour ${c.fn} ${c.ln} · créneaux ${c.fav} affichés.`, type: 'info' });
  };
  handlers['spa-cli-filter'] = (el) => {
    const k = el.dataset.arg;
    const root = el.closest('.kiwi-drawer-body') || document;
    root.querySelectorAll('[data-spa-pill]').forEach((p) => p.classList.toggle('on', p.dataset.spaPill === k));
    root.querySelectorAll('[data-spa-row]').forEach((r) => {
      const ok =
        k === 'all' ||
        (k === 'new' && r.dataset.spaNew === '1') ||
        (k === 'fid' && r.dataset.spaFid === '1') ||
        (k === 'vip' && r.dataset.spaVip === '1') ||
        (k === 'bday' && r.dataset.spaBday === '1');
      r.classList.toggle('sc-hide', !ok);
    });
  };

  /* ─── Main handler ─── */
  handlers['nav-clients'] = () => {
    const totalLTV = CLIENTS.reduce((s, c) => s + c.ltv, 0);
    const bdayList = CLIENTS.filter((c) => c.bday);
    const counts = {
      all: CLIENTS.length,
      new: CLIENTS.filter(isNew).length,
      fid: CLIENTS.filter(isFidele).length,
      vip: CLIENTS.filter(isVIP).length,
      bday: bdayList.length,
    };
    const d = window.Kiwi.appPage('clients', {
      title: 'Fiches clients',
      subtitle: `${CLIENTS.length} clients · ${fmtMAD(totalLTV)} MAD à vie · Spa Bahia Hivernage`,
      body: `
        <div class="p-hero">
          <div class="l">CRM SPA BAHIA</div>
          <div class="big">${fmtMAD(totalLTV)} <span style="font-size:18px; opacity:0.7;">MAD à vie</span></div>
          <div class="sub">${CLIENTS.length} clients actifs · ${counts.vip} VIP · panier moyen ${fmtMAD(Math.round(totalLTV / CLIENTS.length))} MAD</div>
        </div>

        <div class="sc-bday-panel">
          <div class="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 19v-3a4 4 0 00-4-4H8a4 4 0 00-4 4v3M12 5v6M9 8h6"/><circle cx="12" cy="3" r="1.5"/></svg></div>
          <div class="body">
            <div class="t">${bdayList.length} anniversaires ce mois</div>
            <div class="d">${bdayList.map((c) => `${c.fn} ${c.ln}`).join(' · ')}, campagne WhatsApp + 15% prête à partir.</div>
          </div>
          <button class="kb atlas" data-action="spa-cli-bday-batch">Envoyer les vœux groupés</button>
        </div>

        <div class="p-toolbar">
          <div class="p-search" data-action="spa-cli-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
            Rechercher par nom, téléphone, email…
          </div>
          <button class="kb primary" data-action="spa-cli-add"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Nouveau client</button>
        </div>

        <div class="sc-pills">
          <button class="sc-pill on" data-spa-pill="all" data-action="spa-cli-filter" data-arg="all">Tous <span class="ct">${counts.all}</span></button>
          <button class="sc-pill" data-spa-pill="new" data-action="spa-cli-filter" data-arg="new">Nouveaux <span class="ct">${counts.new}</span></button>
          <button class="sc-pill" data-spa-pill="fid" data-action="spa-cli-filter" data-arg="fid">Fidèles <span class="ct">${counts.fid}</span></button>
          <button class="sc-pill" data-spa-pill="vip" data-action="spa-cli-filter" data-arg="vip">VIP <span class="ct">${counts.vip}</span></button>
          <button class="sc-pill" data-spa-pill="bday" data-action="spa-cli-filter" data-arg="bday">Anniv. ce mois <span class="ct">${counts.bday}</span></button>
        </div>

        <table class="p-table sc-table">
          <thead><tr><th>CLIENT</th><th>DERNIÈRE VISITE</th><th class="right">VALEUR À VIE</th><th>PRATICIENNE</th><th>NIVEAU</th></tr></thead>
          <tbody>
            ${CLIENTS.map(rowHTML).join('')}
          </tbody>
        </table>
      `,
    });
    setTimeout(() => {
      d.el.querySelectorAll('[data-spa-row]').forEach((r) => {
        r.addEventListener('click', () => openProfile(+r.dataset.spaId));
      });
    }, 0);
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · STARTER PAGES for custom venues
 * A merchant-created venue has no demo history. Before this layer, every
 * sidebar destination leaked ANOTHER venue's demo data (a fresh pharmacy
 * opened "Catégories" onto Maison Mansour's caftans). Here we wrap every
 * destination handler — whatever file registered it — at window.load (after
 * pages.js / pages-pro.js / finance.js / conformite.js have all finished
 * overriding each other): when the active venue is custom, the destination
 * renders an honest "this page builds itself from your real sales" starter,
 * titled in the trade's own vocabulary (subtype profile labels).
 * ═════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  const SPARK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z"/></svg>';

  /* What each destination will become — phrased to fit any trade. */
  const STARTERS_FR = {
    transactions:  { t: 'Ventes',             d: 'L\'historique complet de vos encaissements, en temps réel.',
                     b: ['Chaque vente apparaît ici à la seconde où elle est encaissée', 'Filtres par moyen de paiement, remboursements inclus', 'Annulations et remboursements tracés, avec leur auteur'] },
    reglements:    { t: 'Règlements',          d: 'Kiwi ne détient pas votre argent : vos paiements carte arrivent par votre banque ou votre TPE.',
                     b: ['Vos encaissements par moyen de paiement sont dans Ventes', 'Le Rapport journalier donne vos totaux espèces et carte, jour par jour', 'Le suivi des virements viendra avec Kiwi Pay, pas encore disponible'] },
    terminaux:     { t: 'Terminaux',          d: 'Les appareils connectés à votre compte Kiwi.',
                     b: ['Votre caisse appairée apparaît ici d\'elle-même', 'Kiwi fonctionne aussi sur votre matériel existant', 'Notez vos autres appareils pour garder la liste à jour'] },
    conformite:    { t: 'Conformité',         d: 'Vos clôtures de caisse et vos registres.',
                     b: ['Registres générés à partir de votre activité réelle', 'Clôtures de caisse conservées jour par jour', 'Exports à remettre à votre comptable'] },
    equipe:        { t: 'Équipe',             d: 'Vos employés, leurs rôles et leurs codes PIN.',
                     b: ['Un code PIN par personne sur la caisse', 'Rôles et permissions par poste', 'Performance individuelle dès les premières ventes'] },
    payroll:       { t: 'Planning',           d: 'Plannings, pointage et préparation de la paie.',
                     b: ['Plannings hebdomadaires par personne', 'Pointage directement sur la caisse', 'Heures cumulées prêtes pour la paie'] },
    reservations:  { t: 'Réservations & RDV', d: 'Votre agenda client, connecté à la caisse.',
                     b: ['Réservations et rendez-vous au même endroit', 'Réservations en ligne ou saisies par l\'équipe', 'Statut de chaque réservation : confirmée, arrivée, absente'] },
    finance:       { t: 'Marges',    d: 'Vos marges réelles, calculées depuis vos ventes.',
                     b: ['Marge brute par produit et par famille', 'Coût d\'achat renseigné par article', 'Tendances dès vos premières semaines'] },
    tables:        { t: 'Plan de salle',      d: 'Votre salle, vue de la caisse.',
                     b: ['Dessinez vos zones et vos tables', 'État en direct pendant le service', 'Encaissement directement depuis la table'] },
    menu:          { t: 'Menu',               d: 'Votre carte, vos prix et vos options.',
                     b: ['Produits, variantes et options', 'Prix modifiables en deux gestes', 'Disponibilité par créneau ou par jour'] },
    kds:           { t: 'Écran cuisine',      d: 'L\'écran cuisine s\'ouvre sur sa propre page, Kiwi Cuisine, sur la tablette de la cuisine.',
                     b: ['Ouvrez Kiwi Cuisine sur l\'écran de la cuisine et appairez-le avec un code', 'Les commandes envoyées depuis la caisse y arrivent en direct', 'Le tableau de bord n\'affiche pas les tickets en cours'] },
    stock:         { t: 'Stock',              d: 'Vos quantités, suivies à chaque vente.',
                     b: ['Le stock décompte automatiquement à la vente', 'Seuils d\'alerte avant rupture', 'Commande fournisseur préparée en un geste'] },
    inventory:     { t: 'Inventaire',         d: 'Vos références, leurs prix et leurs quantités.',
                     b: ['Ajoutez vos références une à une ou par import', 'Stock décompté automatiquement à la vente', 'Alertes avant rupture'] },
    categories:    { t: 'Catégories',         d: 'Vos familles d\'articles, telles que vous organisez votre activité.',
                     b: ['Créez vos propres familles et sous-familles', 'Elles structurent la caisse et les rapports', 'Réorganisables à tout moment'] },
    promos:        { t: 'Promotions',         d: 'Vos offres et leurs résultats, mesurés sur de vraies ventes.',
                     b: ['Créez des offres simples ou conditionnelles', 'Impact mesuré sur le chiffre réel', 'Activation et fin programmables'] },
    returns:       { t: 'Retours',            d: 'Vos retours et échanges, tracés proprement.',
                     b: ['Chaque retour relié à sa vente d\'origine', 'Remboursement, avoir ou échange', 'Politique de retour configurable'] },
    appointments:  { t: 'Agenda',             d: 'Votre planning, rempli par vos vraies réservations.',
                     b: ['Vue semaine par membre de l\'équipe', 'Chaque rendez-vous relié à sa prestation', 'Rendez-vous encaissés directement à la caisse'] },
    services:      { t: 'Prestations',        d: 'Votre catalogue de prestations et de formules.',
                     b: ['Créez vos prestations, durées et prix', 'Prix et durée repris à la caisse', 'Les plus vendues apparaissent dans vos ventes'] },
    practitioners: { t: 'Équipe',             d: 'Les personnes qui réalisent vos prestations.',
                     b: ['Profils, spécialités et plannings', 'Performance par personne dès les premières ventes', 'Ventes attribuées à la personne qui encaisse'] },
    clients:       { t: 'Fiches clients',     d: 'Votre fichier client, construit vente après vente.',
                     b: ['Une fiche créée automatiquement par client', 'Historique, préférences et notes', 'Fidélité par visites ou par tampons'] },
  };
  /* English and Arabic come from assets/starter-copy.js; French, or a missing
     entry, reads the table above. */
  const STARTERS = new Proxy(STARTERS_FR, {
    get(o, k) {
      const fr = o[k];
      if (!fr || typeof k !== 'string') return fr;
      const lang = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
      const tr = lang !== 'fr' && window.KiwiStarterCopy && window.KiwiStarterCopy[lang] && window.KiwiStarterCopy[lang][k];
      return tr && tr.t && tr.d && Array.isArray(tr.b) ? Object.assign({}, fr, tr) : fr;
    },
  });

  /* Destinations that now have a REAL per-venue, persistent UI — they render
     their functional page for custom (onboarded) venues too, NOT a starter
     placeholder. This set grows as more pages become per-venue functional. */
  /* 'menu' is now a real per-venue editor (assets/menu-catalog.js →
     window.KiwiMenuStore), so it renders functionally for custom venues.
     'practitioners' stays OUT: its handler still hardcodes demo staff (Spa
     Bahia's PRACS), so a custom venue must get the zeroed starter, not the demo
     roster, until it becomes genuinely per-venue. 'payroll' caught up: team.js
     now owns it for a real store, builds it from that store's own roster, and
     ships its own empty state ("Ajoutez votre équipe pour commencer"), so it
     belongs in the set outright — same reasoning as conformite/stock/finance. */
  /* 'conformite', 'stock' and 'finance' were building a correct per-venue page
     that nobody could reach: each module already detects a real/custom venue
     (conformite.js:877, stock.js:719, finance.js:866) and renders its own honest
     empty register instead of Café Atlas's fixtures — but this gate intercepted
     the nav first and swapped in the generic "Encore rien ici" starter. Their own
     empty state is strictly better: it names the register, keeps the tabs, and
     tells the merchant what will fill it. */
  const REAL_FOR_CUSTOM = new Set(['inventory', 'categories', 'promos', 'returns', 'equipe', 'menu', 'tables',
    'conformite', 'stock', 'finance', 'payroll']);

  /* Data-conditional destinations: a module that builds a real per-venue page but
     has NO empty state of its own belongs here rather than in the set above, so
     the starter still answers until there is something to show (payroll was
     here until team.js gave it a proper empty state). */
  const REAL_WHEN = {
    /* Terminaux : operations-ui.js porte la vraie page du parc (battements de
       cœur relus côté serveur, alarmes, ticket d'essai). Elle demande une
       session, donc un vrai compte ; un établissement créé localement, sans
       serveur derrière, garde le starter. Le rôle du propriétaire vient de
       GET /api/operations?view=whoami : sans lui, la page se fermait sur
       « Droit d'exploitation requis » pour tout le monde, propriétaire compris. */
    terminaux: () => !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()),
  };

  /* ── Actionable layer: let the client add their OWN data right here ──────
   * Config-type destinations (menu, team, devices…) get an "Add {noun}" button
   * that opens a guided modal; what they type persists per venue and shows back
   * on the page. Output destinations (ventes, marges, KDS…) build from real
   * sales, so their primary action is "record my first sale" (a real sale on a
   * custom venue — it lights the whole dashboard up). Nobody hits a dead end. */
  const LANG = () => (window.KiwiI18n?.getLang?.() || 'fr');
  const T = (o) => (o == null ? '' : (o[LANG()] ?? o.fr ?? ''));
  const escS = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const UI = {
    firstSale: { fr: 'Encaisser ma première vente', en: 'Record my first sale', ar: 'سجّل أول عملية بيع' },
    addMore:   { fr: 'Ajouter', en: 'Add', ar: 'إضافة' },
    done:      { fr: 'Terminé', en: 'Done', ar: 'تم' },
    saved:     { fr: 'Enregistré', en: 'Saved', ar: 'تم الحفظ' },
    started:   { fr: "Bien joué, c'est un début.", en: "Nice, that's a start.", ar: 'أحسنت، هذه بداية.' },
    normal:    { fr: "Encore rien ici, et c'est normal.", en: "Nothing here yet, and that's fine.", ar: 'لا شيء هنا بعد، وهذا طبيعي.' },
    nothing:   { fr: 'Rien encore.', en: 'Nothing yet.', ar: 'لا شيء بعد.' },
    addHint:   { fr: 'Ajoutez-en autant que vous voulez, enregistré pour votre établissement.', en: 'Add as many as you like, saved to your business.', ar: 'أضف ما تشاء، محفوظ لنشاطك.' },
    footSale:  { fr: 'Cette page se construit automatiquement avec vos données réelles, dès vos premières ventes sur la caisse.', en: 'This page builds itself from your real data, starting with your first sales on the register.', ar: 'تُبنى هذه الصفحة تلقائياً من بياناتك الحقيقية بمجرد أول عملية بيع.' },
    footAdd:   { fr: 'Ajoutez vos éléments maintenant, ou laissez-les se créer tout seuls dès la première vente.', en: 'Add your items now, or let them create themselves on the first sale.', ar: 'أضف عناصرك الآن، أو دعها تُنشأ تلقائياً عند أول عملية بيع.' },
    seeSales:  { fr: 'Voir mes ventes', en: 'View my sales', ar: 'عرض مبيعاتي' },
    footBuilt: { fr: 'Cette page se remplit automatiquement à mesure que vous encaissez.', en: 'This page fills itself as you keep taking payments.', ar: 'تمتلئ هذه الصفحة تلقائياً كلما واصلت البيع.' },
    openKds:   { fr: 'Ouvrir Kiwi Cuisine', en: 'Open Kiwi Cuisine', ar: 'فتح Kiwi Cuisine' },
  };
  const FOOT = {
    reglements: { fr: 'Kiwi ne fait pas transiter vos paiements : il n\'y a rien à rapprocher ici pour l\'instant.', en: 'Kiwi does not move your money, so there is nothing to reconcile here yet.', ar: 'لا يمرّ مالك عبر Kiwi، لذا لا يوجد ما يُطابَق هنا حالياً.' },
    terminaux:  { fr: 'Votre caisse s\'ajoute d\'elle-même une fois appairée. Les autres appareils, notez-les ici.', en: 'Your register adds itself once paired. Note your other devices here.', ar: 'يُضاف صندوقك تلقائياً بعد الربط. سجّل أجهزتك الأخرى هنا.' },
    kds:        { fr: 'Les tickets en cours s\'affichent sur Kiwi Cuisine, pas sur cette page.', en: 'Open tickets show on Kiwi Cuisine, not on this page.', ar: 'تظهر الطلبات الجارية على Kiwi Cuisine، لا في هذه الصفحة.' },
  };

  /* The one device Kiwi is CERTAIN about is the caisse the merchant paired: the
     sidebar chip already says "Caisse connectée" while Terminaux — the page whose
     entire job is listing devices — said "Encore rien ici". Read straight from the
     pairing and never written into the editable list, so unpairing removes it on
     its own and a "Terminé" in the add-modal cannot freeze a stale device in. */
  function pairedDeviceLines(nav) {
    if (nav !== 'terminaux') return [];
    let pv = null;
    try {
      pv = (window.KiwiPlatform && typeof window.KiwiPlatform.pairedVenue === 'function' && window.KiwiPlatform.pairedVenue())
        || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    } catch (_) { return []; }
    if (!pv || !pv.name) return [];
    return ['Caisse Kiwi · ' + pv.name + (pv.location ? ' · ' + pv.location : '') + ' · connectée'];
  }

  /* Direct-add destinations — trade-neutral noun/placeholder for each. */
  const ADD = {
    terminaux:    { title: { fr: 'Ajouter un appareil', en: 'Add a device', ar: 'إضافة جهاز' },        plural: { fr: 'Vos appareils', en: 'Your devices', ar: 'أجهزتك' },        ph: { fr: 'Ex. iPad caisse · comptoir', en: 'e.g. iPad · counter', ar: 'مثال: جهاز الكاونتر' } },
    equipe:       { title: { fr: 'Ajouter un membre', en: 'Add a member', ar: 'إضافة عضو' },           plural: { fr: 'Votre équipe', en: 'Your team', ar: 'فريقك' },             ph: { fr: 'Prénom · rôle (ex. Salma · caisse)', en: 'Name · role', ar: 'الاسم · الدور' } },
    practitioners:{ title: { fr: 'Ajouter un membre', en: 'Add a member', ar: 'إضافة عضو' },           plural: { fr: 'Votre équipe', en: 'Your team', ar: 'فريقك' },             ph: { fr: 'Prénom · spécialité', en: 'Name · specialty', ar: 'الاسم · التخصص' } },
    payroll:      { title: { fr: 'Ajouter un employé', en: 'Add an employee', ar: 'إضافة موظف' },      plural: { fr: 'Vos employés', en: 'Your employees', ar: 'موظفوك' },       ph: { fr: 'Prénom · poste', en: 'Name · position', ar: 'الاسم · المنصب' } },
    menu:         { title: { fr: 'Ajouter un produit', en: 'Add a product', ar: 'إضافة منتج' },        plural: { fr: 'Votre carte', en: 'Your menu', ar: 'قائمتك' },             ph: { fr: 'Ex. Café · 12 MAD', en: 'e.g. Coffee · 12 MAD', ar: 'مثال: قهوة · 12 درهم' } },
    services:     { title: { fr: 'Ajouter une prestation', en: 'Add a service', ar: 'إضافة خدمة' },    plural: { fr: 'Vos prestations', en: 'Your services', ar: 'خدماتك' },     ph: { fr: 'Ex. Coupe · 80 MAD', en: 'e.g. Haircut · 80 MAD', ar: 'مثال: قص · 80 درهم' } },
    tables:       { title: { fr: 'Ajouter une table', en: 'Add a table', ar: 'إضافة طاولة' },          plural: { fr: 'Votre salle', en: 'Your floor', ar: 'قاعتك' },             ph: { fr: 'Ex. Table 4 · terrasse', en: 'e.g. Table 4 · terrace', ar: 'مثال: طاولة 4' } },
    stock:        { title: { fr: 'Ajouter une référence', en: 'Add an item', ar: 'إضافة صنف' },        plural: { fr: 'Votre stock', en: 'Your stock', ar: 'مخزونك' },            ph: { fr: 'Ex. Lait · 40 unités', en: 'e.g. Milk · 40 units', ar: 'مثال: حليب · 40' } },
    inventory:    { title: { fr: 'Ajouter une référence', en: 'Add an item', ar: 'إضافة صنف' },        plural: { fr: 'Votre inventaire', en: 'Your inventory', ar: 'جردك' },     ph: { fr: 'Ex. Référence · quantité', en: 'e.g. Item · qty', ar: 'مثال: صنف · كمية' } },
    categories:   { title: { fr: 'Ajouter une catégorie', en: 'Add a category', ar: 'إضافة فئة' },     plural: { fr: 'Vos catégories', en: 'Your categories', ar: 'فئاتك' },     ph: { fr: 'Ex. Boissons chaudes', en: 'e.g. Hot drinks', ar: 'مثال: مشروبات ساخنة' } },
    promos:       { title: { fr: 'Créer une offre', en: 'Create an offer', ar: 'إنشاء عرض' },          plural: { fr: 'Vos offres', en: 'Your offers', ar: 'عروضك' },             ph: { fr: 'Ex. −10% sur la nouvelle collection', en: 'e.g. −10% on the new collection', ar: 'مثال: −10٪ على المجموعة الجديدة' } },
    clients:      { title: { fr: 'Ajouter un client', en: 'Add a customer', ar: 'إضافة عميل' },        plural: { fr: 'Vos clients', en: 'Your customers', ar: 'عملاؤك' },        ph: { fr: 'Nom · téléphone', en: 'Name · phone', ar: 'الاسم · الهاتف' } },
    reservations: { title: { fr: 'Ajouter une réservation', en: 'Add a booking', ar: 'إضافة حجز' },    plural: { fr: 'Vos réservations', en: 'Your bookings', ar: 'حجوزاتك' },   ph: { fr: 'Nom · date · couverts', en: 'Name · date · guests', ar: 'الاسم · التاريخ' } },
    appointments: { title: { fr: 'Ajouter un rendez-vous', en: 'Add an appointment', ar: 'إضافة موعد' }, plural: { fr: 'Vos rendez-vous', en: 'Your appointments', ar: 'مواعيدك' }, ph: { fr: 'Nom · date · prestation', en: 'Name · date · service', ar: 'الاسم · التاريخ' } },
  };

  const venueId = () => { const KV = window.KiwiVenue; return (KV && KV.getCurrentVenueData && KV.getCurrentVenueData() || {}).id || (KV && KV.getVenue && KV.getVenue()) || 'v'; };
  const skey = (nav) => 'kiwiStarter:' + venueId() + ':' + nav;
  function getItems(nav) { try { return JSON.parse(localStorage.getItem(skey(nav)) || '[]'); } catch (_) { return []; } }
  function setItems(nav, arr) {
    try { localStorage.setItem(skey(nav), JSON.stringify(arr)); } catch (_) {}
    const c = starterCloud(nav);
    if (c) c.push();
  }

  /* ── LA COPIE SERVEUR DES DESTINATIONS « STARTER » ─────────────────────────
   * Ces pages-là ne sont pas des maquettes : le commerçant y tape ses offres,
   * ses réservations, ses terminaux, et la liste lui est réaffichée. C'était de
   * la vraie saisie, rangée sous `kiwiStarter:<venueId>:<nav>` — donc perdue au
   * changement d'appareil comme le reste.
   *
   * Ne SONT PAS câblées ici :
   *   · les destinations de REAL_FOR_CUSTOM (équipe, carte, plan de salle,
   *     stock, inventaire, catégories, paie) — un vrai magasin ne voit jamais
   *     leur version starter, c'est leur module qui répond, et lui a déjà sa
   *     propre copie serveur. Deux miroirs sur une même donnée divergent ;
   *   · `clients`, qui appartient à assets/clients-store.js et à /api/clients.
   *     Le carnet est synchronisé À LA LIGNE, pas au document ; le doubler ici
   *     ferait deux carnets pour un seul commerçant. */
  const STARTER_CLOUD = {
    promos: 'promotions', reservations: 'reservations', services: 'services',
    terminaux: 'terminals', appointments: 'appointments', practitioners: 'practitioners',
  };
  const starterDocs = Object.create(null);
  const starterCarried = Object.create(null);
  let starterOpen = null;          // la destination starter actuellement à l'écran

  function starterCloud(nav) {
    const feature = STARTER_CLOUD[nav];
    if (!feature || !window.KiwiCloudDoc) return null;
    if (starterDocs[nav]) return starterDocs[nav];
    starterDocs[nav] = window.KiwiCloudDoc.attach({
      feature,
      slug: () => window.KiwiCloudDoc.slugFor(venueId()),
      /* Le starter range un TABLEAU nu ; store_docs veut un document. `list` est
       * la forme que /api/store attend déjà pour suppliers et expenses. */
      read: () => ({ list: getItems(nav) }),
      write: (d) => {
        const list = Array.isArray(d && d.list) ? d.list : [];
        // Écriture directe : passer par setItems() reprogrammerait une remontée
        // de ce qu'on vient tout juste de recevoir.
        try { localStorage.setItem(skey(nav), JSON.stringify(list)); } catch (_) {}
        if (starterOpen === nav && STARTERS[nav]) {
          try { renderStarter(nav, STARTERS[nav]); } catch (_) {}
        }
      },
      isEmpty: (d) => !d || !(d.list && d.list.length),
    });
    return starterDocs[nav];
  }

  function starterBind(nav) {
    const c = starterCloud(nav);
    if (!c || !window.KiwiCloudDoc) return;
    const vid = venueId();
    const slug = window.KiwiCloudDoc.slugFor(vid);
    if (slug && !starterCarried[nav]) {
      starterCarried[nav] = 1;
      window.KiwiCloudDoc.carryForward(nav, vid, slug, (raw) => {
        try { const a = JSON.parse(raw || 'null'); return Array.isArray(a) && a.length > 0; }
        catch (_) { return false; }
      }, { prefix: 'kiwiStarter:', suffix: ':' + nav });
    }
    c.bind();
  }

  /* Guided "add" modal — the client types their items; DOM-built list (no
   * innerHTML), persisted on Done, reflected back on the page. */
  function openAddModal(nav) {
    const cfg = ADD[nav]; if (!cfg || !window.Kiwi || !window.Kiwi.modal) return;
    const toast = window.Kiwi.toast;
    const m = window.Kiwi.modal({
      tag: ((window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {}).name || 'Kiwi',
      title: T(cfg.title),
      desc: T(UI.addHint),
      width: 460,
      body: `<input data-add-input type="text" placeholder="${escS(T(cfg.ph))}" style="width:100%;box-sizing:border-box;padding:13px 14px;border:1.5px solid var(--n-200);border-radius:12px;font-family:var(--sans);font-size:15px;color:var(--ink);background:var(--surface);outline:none;"/>
             <div class="gp-add-list" data-add-list></div>`,
      foot: `<button class="kb ghost" type="button" data-add-more style="flex:1;justify-content:center;">${T(UI.addMore)}</button>
             <button class="kb atlas" type="button" data-add-done style="flex:1.3;justify-content:center;">${T(UI.done)}</button>`,
    });
    const input = m.el.querySelector('[data-add-input]');
    const list = m.el.querySelector('[data-add-list]');
    const draft = getItems(nav).slice();
    function paint() {
      while (list.firstChild) list.removeChild(list.firstChild);
      if (!draft.length) {
        const e = document.createElement('div'); e.className = 'gp-add-empty'; e.textContent = T(UI.nothing); list.appendChild(e); return;
      }
      draft.forEach((txt, i) => {
        const row = document.createElement('div'); row.className = 'gp-add-item';
        const span = document.createElement('span'); span.textContent = txt; span.style.flex = '1'; span.style.minWidth = '0';
        const x = document.createElement('span'); x.className = 'x'; x.textContent = '×'; x.dataset.del = String(i);
        row.appendChild(span); row.appendChild(x); list.appendChild(row);
      });
    }
    function add() { const v = (input.value || '').trim(); if (!v) { input.focus(); return; } draft.push(v); input.value = ''; input.focus(); paint(); }
    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-add-more]')) { add(); return; }
      const x = e.target.closest('[data-del]'); if (x) { draft.splice(+x.dataset.del, 1); paint(); return; }
      if (e.target.closest('[data-add-done]')) {
        setItems(nav, draft);
        m.close();
        if ((window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()) || window.KiwiEnv?.isReal?.()) renderStarter(nav, STARTERS[nav]);
        if (toast) toast(T(UI.saved), { type: 'success', force: true, desc: draft.length + ' · ' + T(cfg.plural) });
        try { if (draft.length && window.Kiwi.confetti) window.Kiwi.confetti(); } catch (_) {}
        return;
      }
    });
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    paint();
    setTimeout(() => { try { input && input.focus(); } catch (_) {} }, 200);
  }

  function registerActions() {
    const H = window.Kiwi && window.Kiwi.handlers; if (!H) return;
    if (!H['starter-add']) H['starter-add'] = (_el, nav) => openAddModal(nav);
    H['sale-invoice-pdf'] = (_el, saleId) => {
      if (!saleId) {
        if (window.Kiwi && typeof window.Kiwi.toast === 'function') {
          window.Kiwi.toast('Facture disponible après synchronisation de la vente', { type: 'warning' });
        }
        return;
      }
      const sales = window.KiwiSales?.list?.() || [];
      const sale = sales.find((s) => (s.saleId === saleId || s.id === saleId));
      if (sale && window.KiwiInvoice) {
        window.KiwiInvoice.generate(sale, 'pdf');
      }
    };
    H['sale-invoice-print'] = (_el, saleId) => {
      if (!saleId) {
        if (window.Kiwi && typeof window.Kiwi.toast === 'function') {
          window.Kiwi.toast('Facture disponible après synchronisation de la vente', { type: 'warning' });
        }
        return;
      }
      const sales = window.KiwiSales?.list?.() || [];
      const sale = sales.find((s) => (s.saleId === saleId || s.id === saleId));
      if (sale && window.KiwiInvoice) {
        window.KiwiInvoice.generate(sale, 'print');
      }
    };
    H['sales-day'] = (_el, offset) => {
      const merchant = auditMerchant() || String(window.KiwiVenue?.getCurrentVenueData?.()?.id || 'venue');
      const R = window.KiwiDayReport;
      const today = R?.today?.(merchant);
      if (today) salesDayByMerchant[merchant] = R.shiftDay(today, -Math.max(0, Math.min(2, Number(offset) || 0)), merchant);
      renderRealTransactions('transactions', STARTERS.transactions);
    };
    H['sales-kind'] = (_el, kind) => {
      salesKindByMerchant[auditMerchant()] = ['sale', 'refund', 'cancel'].includes(kind) ? kind : 'all';
      renderRealTransactions('transactions', STARTERS.transactions);
    };
    H['sales-activity-retry'] = () => { loadCancelAudit(true); };
    H['sales-method'] = (_el, method) => {
      const merchant = auditMerchant() || String(window.KiwiVenue?.getCurrentVenueData?.()?.id || 'venue');
      const allowed = ['cash', 'card', 'delivery'];
      const current = (salesMethodsByMerchant[merchant] || []).filter((m) => allowed.includes(m));
      if (method === 'all' || !allowed.includes(method)) {
        salesMethodsByMerchant[merchant] = [];
      } else if (current.includes(method)) {
        salesMethodsByMerchant[merchant] = current.filter((m) => m !== method);
      } else if (current.length >= 2) {
        /* A third simultaneous type becomes the simpler, honest "Tout" view. */
        salesMethodsByMerchant[merchant] = [];
      } else {
        salesMethodsByMerchant[merchant] = current.concat(method);
      }
      renderRealTransactions('transactions', STARTERS.transactions);
    };
  }

  function starterTitle(nav, meta) {
    const KV = window.KiwiVenue;
    /* The trade's own label for this destination (subtype profile) wins. */
    const vd = KV?.getCurrentVenueData?.() || {};
    const prof = vd.subtype && KV?.getSubtypeProfile?.(vd.subtype);
    const item = prof && prof.items && prof.items.find(i => i.nav === nav);
    if (item && item.label) {
      const lang = window.KiwiI18n?.getLang?.() || 'fr';
      return item.label[lang] ?? item.label.fr;
    }
    if (nav === 'transactions') {
      const v = KV?.getVocab?.('navOrders');
      if (v) return v;
    }
    return meta.t;
  }

  /* Styles for the real per-venue Ventes list — injected once. */
  function ensureRtxStyles() {
    if (document.getElementById('kiwi-rtx-style')) return;
    const s = document.createElement('style');
    s.id = 'kiwi-rtx-style';
    s.textContent =
      '.rtx-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--n-200)}' +
      '.rtx-count{font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--n-500)}' +
      '.rtx-total{font-size:14px;color:var(--ink)}.rtx-total b{font-family:var(--mono)}' +
      '.rtx-day-host{padding:0 0 16px}' +
      '.rtx-methods{display:flex;gap:7px;flex-wrap:wrap;padding:0 0 16px}' +
      '.rtx-method{border:1px solid var(--n-200);background:var(--surface);color:var(--ink);border-radius:999px;padding:7px 12px;font:600 11px var(--sans);cursor:pointer}' +
      '.rtx-method.on{background:var(--atlas);border-color:var(--atlas);color:#fff}' +
      '.rtx-list{display:flex;flex-direction:column}' +
      '.rtx-row{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto auto;align-items:center;gap:12px;padding:14px 2px;border-bottom:1px solid var(--n-100)}' +
      '.rtx-row.is-refund .rtx-a{color:var(--danger)}.rtx-row.is-refund .rtx-m{background:color-mix(in srgb,var(--danger) 10%,transparent);color:var(--danger)}' +
      '.rtx-row.is-new{animation:rtx-in .45s cubic-bezier(.32,.72,0,1)}' +
      '@keyframes rtx-in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}' +
      '.rtx-t{font-family:var(--mono);font-size:12.5px;color:var(--n-500)}' +
      '.rtx-m{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:color-mix(in srgb,var(--atlas) 12%,transparent);color:var(--atlas);white-space:nowrap}' +
      '.rtx-products{display:flex;flex-direction:column;gap:5px;min-width:0}.rtx-product{display:flex;justify-content:space-between;gap:14px;font-size:14px;color:var(--ink)}' +
      '.rtx-identity{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:2px}.rtx-ref{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--ink)}.rtx-source{font-size:11px;color:var(--n-500)}' +
      '.rtx-product-name{overflow:hidden;text-overflow:ellipsis}.rtx-product-amount{font-family:var(--mono);font-size:12px;white-space:nowrap;color:var(--n-500)}' +
      '.rtx-products-missing{font-size:13px;color:var(--n-500)}' +
      '.rtx-a{font-family:var(--mono);font-size:14.5px;font-weight:600;color:var(--ink);white-space:nowrap}' +
      '.rtx-cur{font-size:11px;color:var(--n-500)}' +
      '.rtx-actions{display:flex;align-items:center;gap:6px;margin-inline-start:4px}' +
      '.rtx-act-btn{border:1px solid var(--n-200);background:var(--surface);color:var(--n-600);border-radius:6px;padding:5px 7px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .15s}' +
      '.rtx-act-btn:hover{background:var(--n-100);color:var(--ink);border-color:var(--n-300)}' +
      '.rtx-act-btn:disabled{opacity:.35;cursor:not-allowed}' +
      '.rtx-inv-badge{font-family:var(--mono);font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;background:var(--ok-bg,#ecfdf5);color:var(--ok-fg,#047857);margin-right:2px}' +
      '.rtx-voids{margin-top:26px;padding-top:18px;border-top:1px solid var(--n-200)}' +
      '.rtx-void-title{font-size:14px;font-weight:650;margin-bottom:4px}.rtx-void-sub{font-size:12px;color:var(--n-500);margin-bottom:10px}' +
      '.rtx-void-row{display:grid;grid-template-columns:auto minmax(120px,1fr) minmax(150px,2fr) auto;gap:12px;align-items:center;padding:11px 2px;border-bottom:1px solid var(--n-100)}' +
      '.rtx-void-who{font-size:13px;font-weight:600}.rtx-void-lines{font-size:12px;color:var(--n-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.rtx-void-amount{font-family:var(--mono);font-size:13px;font-weight:650;color:#b44338;white-space:nowrap}' +
      '.rtx-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0 24px}.rtx-summary>div{padding:18px;border:1px solid var(--n-200);border-radius:16px;background:var(--surface)}.rtx-summary span{display:block;font-size:12px;color:var(--n-500)}.rtx-summary strong{display:block;font-size:26px;color:var(--g-700,#087454);margin-top:7px}.rtx-summary small{font-size:12px;font-weight:500}.rtx-summary .is-refund strong{color:#b44338}html[data-theme="dark"] .rtx-summary strong{color:var(--mint)}html[data-theme="dark"] .rtx-summary .is-refund strong{color:#FCA597}' +
      '.rtx-activity-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:16px;padding:18px 0;border-bottom:1px solid var(--n-100);align-items:start}.rtx-activity-tag{font-size:11px;font-weight:650;color:#81501a;background:#fcf0da;padding:5px 9px;border-radius:7px}.rtx-activity-value{text-align:end;font-weight:650;font-size:15px}.rtx-activity-value small{display:block;font-size:11px;font-weight:400;color:var(--n-500);margin-top:5px;max-width:200px}.rtx-detail{font-size:12px;color:var(--n-500);overflow-wrap:anywhere}.rtx-detail summary{cursor:pointer;min-height:44px;display:flex;align-items:center;text-decoration:underline;text-underline-offset:3px}.rtx-detail p{margin:6px 0}.rtx-notice{padding:12px 16px;border-radius:12px;background:#fcf0da;color:#81501a;font-size:13px}.rtx-notice .rtx-method{background:#fffdfa;color:#81501a;border-color:#e6c99a}.rtx-method{min-height:44px}.rtx button:focus-visible,.rtx summary:focus-visible{outline:2px solid var(--g-700,#087454);outline-offset:3px}' +
      '@media(max-width:600px){.rtx-summary{gap:6px}.rtx-summary>div{padding:12px 8px}.rtx-summary strong{font-size:19px}.rtx-summary span{font-size:11px}.rtx-activity-row{grid-template-columns:auto minmax(0,1fr);gap:10px}.rtx-activity-value{grid-column:2;text-align:start}.rtx-activity-value small{max-width:none}.rtx-identity{flex-wrap:wrap}.rtx-row{grid-template-columns:auto minmax(0,1fr) auto;gap:10px;padding:18px 0}.rtx-row>.rtx-t{grid-column:1;grid-row:1}.rtx-row>.rtx-m{grid-column:2;grid-row:1;justify-self:start}.rtx-row>.rtx-a{grid-column:3;grid-row:1}.rtx-row>.rtx-products{grid-column:1/-1;grid-row:2;width:100%}.rtx-row>.rtx-actions{grid-column:3;grid-row:3}.rtx-product-name{white-space:normal}.rtx-product{gap:12px}}';
    document.head.appendChild(s);
  }

  let cancelAudit = [];
  let cancelAuditMerchant = '';
  let cancelAuditLoading = false;
  let cancelAuditError = false;
  let cancelAuditWindow = null;
  let cancelAuditRequest = 0;
  let cancelAuditLoadedAt = 0;
  let cancelAuditVoidSig = '';
  const salesDayByMerchant = Object.create(null);
  if (window.Kiwi?.handlers) window.Kiwi.handlers['nav-transactions-day'] = (_el, day) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return;
    const slug = auditMerchant();
    if (!slug) return;
    salesDayByMerchant[slug] = day;
    renderRealTransactions('transactions', STARTERS.transactions);
  };
  const salesMethodsByMerchant = Object.create(null);
  const salesKindByMerchant = Object.create(null);
  function salesMethodKey(s) {
    const raw = String((s && s.method) || '').toLowerCase();
    return ({ 'espèces': 'cash', especes: 'cash', carte: 'card', livraison: 'delivery' })[raw] || raw;
  }
  function auditMerchant() {
    try { return String(window.KiwiLive?.merchant?.() || ''); } catch (_) { return ''; }
  }
  /* appPage() leaves its old host in the DOM when the cashier goes home or to
   * another section; pageShell() hides it instead of deleting it. A bare
   * querySelector('[data-real-tx]') therefore says nothing about which page is
   * visible. Live-Link's sales subscription used that stale node as permission
   * to call nav-transactions on every poll, pulling the owner out of Accueil. */
  function transactionsOnScreen() {
    return window.Kiwi?.activePage === 'transactions'
      && document.body.classList.contains('page-genpage')
      && !!document.querySelector('.dash-genpage [data-real-tx], .dash-genpage [data-starter-nav="transactions"]');
  }
  function loadCancelAudit(force) {
    const merchant = auditMerchant();
    const windowKey = cancelAuditWindow;
    if (!merchant || !windowKey || windowKey.merchant !== merchant) return;
    const key = `${merchant}:${windowKey.from}:${windowKey.to}`;
    if (!force && cancelAuditMerchant === key && (cancelAuditLoading || Date.now() - cancelAuditLoadedAt < 30000)) return;
    if (cancelAuditMerchant !== key) cancelAudit = [];
    cancelAuditMerchant = key;
    cancelAuditLoading = true;
    cancelAuditError = false;
    const generation = ++cancelAuditRequest;
    (async () => {
      const events = [], cursors = new Set();
      let next = null;
      do {
        const query = new URLSearchParams({ merchant, from: windowKey.from, to: windowKey.to });
        if (next) { query.set('before', next.before); query.set('beforeId', next.beforeId); }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        let data;
        try {
          const response = await fetch(`/api/order/activity?${query}`, { credentials: 'same-origin', signal: controller.signal });
          if (!response.ok) throw new Error('activity-unavailable');
          data = await response.json();
        } finally { clearTimeout(timeout); }
        if (generation !== cancelAuditRequest || merchant !== auditMerchant()) return;
        if (data.merchant !== merchant || data.from !== windowKey.from || data.to !== windowKey.to || !Array.isArray(data.events)) throw new Error('activity-scope');
        events.push(...data.events);
        next = data.next;
        if (next) {
          const cursor = JSON.stringify(next);
          if (cursors.has(cursor) || cursors.size >= 100) throw new Error('activity-incomplete');
          cursors.add(cursor);
        }
      } while (next);
      cancelAudit = events;
    })().catch(() => { if (generation === cancelAuditRequest) cancelAuditError = true; }).finally(() => {
      if (generation !== cancelAuditRequest) return;
      cancelAuditLoading = false;
      cancelAuditLoadedAt = Date.now();
      if (merchant === auditMerchant() && transactionsOnScreen()) renderRealTransactions('transactions', STARTERS.transactions);
    });
  }

  /* A custom/real venue's Ventes page shows the merchant's ACTUAL sales from
   * window.KiwiSales — which now includes Live-Link sales bridged from the caisse
   * (see live-link.js). Newest first, with a running total. Falls back to the
   * starter (below) when there are no sales yet. */
  function renderRealTransactions(nav, meta) {
    ensureRtxStyles();
    const KV = window.KiwiVenue;
    const vd = KV?.getCurrentVenueData?.() || {};
    const lang = window.KiwiI18n?.getLang?.() || 'fr';
    const sales = (window.KiwiSales?.list?.() || []).slice();
    const refunds = (window.KiwiRefunds?.list?.() || []).map((r) => ({
      ...r, amount: -Math.abs(+r.amount || 0), kind: 'refund', origin: 'caisse',
    }));
    const ML = {
      fr: { cash: 'Espèces', card: 'Carte', tap: 'Kiwi Tap', qr: 'QR Wallet', wallet: 'Kiwi Wallet', link: 'Lien', split: 'Partagée', delivery: 'Livraison', unknown: 'Non renseigné' },
      en: { cash: 'Cash', card: 'Card', tap: 'Kiwi Tap', qr: 'QR Wallet', wallet: 'Kiwi Wallet', link: 'Link', split: 'Split', delivery: 'Delivery', unknown: 'Not recorded' },
      ar: { cash: 'نقدًا', card: 'بطاقة', tap: 'Kiwi Tap', qr: 'QR Wallet', wallet: 'Kiwi Wallet', link: 'رابط', split: 'مقسّمة', delivery: 'توصيل', unknown: 'غير مسجّل' },
    };
    const L = ML[lang] || ML.fr;
    const SUM = { fr: { n: 'ventes', one: 'vente', total: 'Total' }, en: { n: 'sales', one: 'sale', total: 'Total' }, ar: { n: 'مبيعات', one: 'بيع', total: 'المجموع' } }[lang] || { n: 'ventes', one: 'vente', total: 'Total' };
    /* Au centime, deux chiffres dès qu'il y a des centimes : 34,90 et non 34,9
       (la caisse et le reçu écrivent 34,90). Un montant rond reste « 120 ». */
    const fmt = n => { const v = Math.round((Number(n) || 0) * 100) / 100; const d = Number.isInteger(v) ? 0 : 2; try { return v.toLocaleString(lang === 'ar' ? 'ar-MA' : 'fr-FR', { minimumFractionDigits: d, maximumFractionDigits: 2 }); } catch (_) { return String(v); } };
    /* ── La MÊME fenêtre que le tableau de bord ────────────────────────────
     * Cette page additionnait tout l'historique du navigateur et imprimait le
     * résultat en gros, sous un tableau de bord qui, lui, affichait la période
     * choisie. « 47 ventes · Total 18 400 MAD » sous un hero à 2 310 MAD : le
     * commerçant voyait deux fois son argent et n'avait aucun moyen de savoir
     * lequel des deux était sa caisse.
     *
     * Pire, les lignes ne portaient QUE l'heure. Une vente d'hier à 14:32 et
     * une vente d'aujourd'hui à 14:32 s'écrivaient exactement pareil, l'une
     * sous l'autre. On borne donc, et quand la fenêtre couvre plus d'un jour
     * on date la ligne — sans quoi borner n'aurait fait que cacher le problème
     * au lieu de le dire. */
    const merchant = auditMerchant() || String(vd.id || vd.name || 'venue');
    const rememberedDay = String(salesDayByMerchant[merchant] || '');
    const selectedMethods = (salesMethodsByMerchant[merchant] || []).filter((m) => ['cash', 'card', 'delivery'].includes(m));
    const now = Date.now();
    const R = window.KiwiDayReport;
    const addDay = (day, delta) => {
      const p = String(day || '').split('-');
      return new Date(Date.UTC(+p[0], (+p[1] || 1) - 1, +p[2] || 1) + delta * 864e5).toISOString().slice(0, 10);
    };
    const zone = (() => {
      const candidate = R?.timezone?.() || vd.timezone || vd.timeZone || vd.tz || window.KiwiConfig?.timezone || window.KiwiConfig?.timeZone
        || (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return ''; } })() || 'Africa/Casablanca';
      try { new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: candidate }).format(); return candidate; } catch (_) { return 'Africa/Casablanca'; }
    })();
    const partsAt = (ts) => {
      const out = {};
      new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(ts)).forEach((p) => { if (p.type !== 'literal') out[p.type] = p.value; });
      return out;
    };
    const fallbackDay = (ts) => {
      const p = partsAt(ts);
      const day = `${p.year}-${p.month}-${p.day}`;
      const cutoff = Number(window.KiwiConfig?.dayCutoff ?? 5);
      return +p.hour < cutoff ? addDay(day, -1) : day;
    };
    const fallbackBounds = (day) => {
      const cutoff = Number(window.KiwiConfig?.dayCutoff ?? 5);
      const boundary = (d) => {
        const target = Date.parse(`${d}T00:00:00Z`) + cutoff * 3600000;
        let guess = target;
        for (let i = 0; i < 6; i++) {
          const p = partsAt(guess);
          const observed = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:00:00Z`);
          if (observed === target) return guess;
          guess += target - observed;
        }
        return guess;
      };
      return { from: boundary(day), to: boundary(addDay(day, 1)) };
    };
    const todayKey = R?.businessDay ? R.businessDay(now, merchant) : fallbackDay(now);
    const selectedKey = /^\d{4}-\d{2}-\d{2}$/.test(rememberedDay) && rememberedDay <= todayKey ? rememberedDay : todayKey;
    const dayOffset = selectedKey === todayKey ? 0
      : selectedKey === (R?.shiftDay ? R.shiftDay(todayKey, -1, merchant) : addDay(todayKey, -1)) ? 1 : -1;
    const selectedWindow = R?.dayBounds ? R.dayBounds(selectedKey, merchant) : fallbackBounds(selectedKey);
    const lo = selectedWindow.from;
    const hi = selectedWindow.to;
    cancelAuditWindow = { merchant: auditMerchant(), from: lo, to: hi };
    loadCancelAudit();
    const activity = cancelAuditMerchant === `${auditMerchant()}:${lo}:${hi}` ? cancelAudit : [];
    // Refund audit metadata enriches the existing receipt, never adds a second
    // debit. A refund absent from a stale local feed remains visible from D1.
    const refundById = new Map(refunds.map(r => [String(r.saleId || r.id), r]));
    activity.filter(a => a.kind === 'refund' && a.refundId).forEach(a => {
      const old = refundById.get(String(a.refundId)) || {};
      refundById.set(String(a.refundId), { ...old, id: a.refundId, kind: 'refund', ts: a.ts,
        amount: -Math.abs(a.amountCents / 100), method: a.method, ref: a.ref,
        reason: a.reason, actor: a.actor, actorId: a.actorId, originalRef: a.originalRef || a.saleId,
        lines: old.lines || [], origin: 'caisse' });
    });
    const selectedDay = new Date(`${selectedKey}T12:00:00Z`);
    const daySales = sales.concat([...refundById.values()]).filter((s) => { const ts = +(s && s.ts) || 0; return ts >= lo && ts < hi; });
    const financialWindow = selectedMethods.length
      ? daySales.filter((s) => selectedMethods.includes(salesMethodKey(s)))
      : daySales;
    const selectedKind = salesKindByMerchant[auditMerchant()] || 'all';
    const inWindow = financialWindow.filter(s => selectedKind === 'all' ||
      (selectedKind === 'refund' ? s.kind === 'refund' || s.amount < 0 : selectedKind === 'sale' && s.kind !== 'refund' && s.amount >= 0));
    const kindButtons = [
      ['all', T({ fr: 'Tout', en: 'All', ar: 'الكل' })],
      ['sale', T({ fr: 'Ventes', en: 'Sales', ar: 'المبيعات' })],
      ['refund', T({ fr: 'Remboursements', en: 'Refunds', ar: 'المبالغ المستردة' })],
      ['cancel', T({ fr: 'Annulations', en: 'Cancellations', ar: 'الإلغاءات' })],
      ['handover', T({ fr: 'Remises au client', en: 'Handovers', ar: 'التسليمات' })],
    ].map(([kind, label]) => `<button class="rtx-method${selectedKind === kind ? ' on' : ''}" type="button" data-action="sales-kind" data-arg="${kind}" aria-pressed="${selectedKind === kind}">${escS(label)}</button>`).join('');
    const dayLabel = dayOffset === 0 ? T({ fr: "aujourd'hui", en: 'today', ar: 'اليوم' })
      : dayOffset === 1 ? T({ fr: 'hier', en: 'yesterday', ar: 'أمس' })
      : new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(lang === 'ar' ? 'ar-MA' : lang, { timeZone: zone, weekday: 'long', day: 'numeric', month: 'short' }).format(selectedDay);
    const methodLabels = {
      all: T({ fr: 'Tout', en: 'All', ar: 'الكل' }),
      cash: L.cash, card: L.card, delivery: L.delivery,
    };
    const methodButtons = ['all', 'cash', 'card', 'delivery'].map((method) => {
      const active = method === 'all' ? selectedMethods.length === 0 : selectedMethods.includes(method);
      return `<button class="rtx-method${active ? ' on' : ''}" type="button" data-action="sales-method" data-arg="${method}" aria-pressed="${active}">${escS(methodLabels[method])}</button>`;
    }).join('');
    const collected = financialWindow.reduce((a, s) => a + Math.max(0, Math.round(Number(s.amount || 0) * 100)), 0) / 100;
    const returned = financialWindow.reduce((a, s) => a + Math.max(0, -Math.round(Number(s.amount || 0) * 100)), 0) / 100;
    const total = Math.round((collected - returned) * 100) / 100;
    const count = financialWindow.filter((s) => s.kind !== 'refund' && Number(s.amount) > 0).length;
    const rows = inWindow.slice().sort((a, b) => (+b.ts || 0) - (+a.ts || 0)).map((s, i) => {
      const isRefund = s.kind === 'refund' || Number(s.amount) < 0;
      const d = new Date(s.ts || Date.now());
      const hh = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(lang === 'ar' ? 'ar-MA-u-nu-latn' : lang, { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
      const when = hh;
      const m = isRefund ? T({ fr: 'Remboursement', en: 'Refund', ar: 'استرداد' }) : (L[salesMethodKey(s)] || L.unknown);
      const ref = String(s.ref || s.label || '').trim();
      const origin = String(s.origin || (ref ? 'caisse' : '')).toLowerCase();
      const source = origin === 'employee'
        ? (s.server ? `${s.server} · ${T({ fr: 'App employé', en: 'Employee app', ar: 'تطبيق الموظف' })}` : T({ fr: 'App employé', en: 'Employee app', ar: 'تطبيق الموظف' }))
        : origin === 'orderpro' ? 'OrderPro'
        : origin === 'caisse' ? T({ fr: 'Caisse', en: 'Till', ar: 'الصندوق' }) : '';
      const identity = ref || source
        ? `<div class="rtx-identity">${ref ? `<span class="rtx-ref">${escS(ref)}</span>` : ''}${source ? `<span class="rtx-source">${escS(source)}</span>` : ''}</div>`
        : '';
      const lines = Array.isArray(s.lines) ? s.lines.filter((l) => l && l.name) : [];
      const products = lines.length ? lines.map((l) => {
        const qty = Math.max(1, Number(l.qty) || 1);
        const lineAmount = Number(l.total);
        return `<div class="rtx-product"><span class="rtx-product-name">${qty} × ${escS(l.name)}</span>${Number.isFinite(lineAmount) ? `<span class="rtx-product-amount">${fmt(lineAmount)} MAD</span>` : ''}</div>`;
      }).join('') : `<span class="rtx-products-missing">${escS(isRefund
        ? T({ fr: 'Montant rendu au client', en: 'Amount returned to customer', ar: 'المبلغ المعاد إلى العميل' })
        : T({ fr: 'Détail produit indisponible', en: 'Product detail unavailable', ar: 'تفاصيل المنتج غير متوفرة' }))}</span>`;
      const saleId = String(s.saleId || s.id || '').trim();
      const hasId = !!saleId;
      const cachedInv = hasId && window.KiwiInvoice?.getCachedInvoices?.()[saleId];
      const invBadge = cachedInv?.number
        ? `<span class="rtx-inv-badge" title="Facture ${escS(cachedInv.number)}">${escS(cachedInv.number)}</span>`
        : '';
      const tooltip = hasId ? '' : ' title="Facture disponible après synchronisation de la vente"';
      const disabledAttr = hasId ? '' : ' disabled aria-disabled="true"';
      const invoiceActions = isRefund ? '<div class="rtx-actions"></div>' : `
        <div class="rtx-actions">
          ${invBadge}
          <button class="rtx-act-btn" type="button" data-action="sale-invoice-pdf" data-arg="${escS(saleId)}"${disabledAttr}${tooltip || ' title="Facture PDF"'} aria-label="Facture PDF">
            <svg viewBox="0 -960 960 960" width="15" height="15" fill="currentColor"><path d="M360-460h40v-80h40q17 0 28.5-11.5T480-580v-40q0-17-11.5-28.5T440-660h-80v200Zm40-120v-40h40v40h-40Zm120 120h80q17 0 28.5-11.5T640-500v-120q0-17-11.5-28.5T600-660h-80v200Zm40-40v-120h40v120h-40Zm120 40h40v-80h40v-40h-40v-40h40v-40h-80v200ZM320-240q-33 0-56.5-23.5T240-320v-480q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H320Zm0-80h480v-480H320v480ZM160-80q-33 0-56.5-23.5T80-160v-560h80v560h560v80H160Zm160-720v480-480Z"/></svg>
          </button>
          <button class="rtx-act-btn" type="button" data-action="sale-invoice-print" data-arg="${escS(saleId)}"${disabledAttr}${tooltip || ' title="Imprimer A4"'} aria-label="Imprimer A4">
            <svg viewBox="0 -960 960 960" width="15" height="15" fill="currentColor"><path d="M640-640v-120H320v120h-80v-200h480v200h-80Zm-480 80h640-640Zm560 100q17 0 28.5-11.5T760-500q0-17-11.5-28.5T720-540q-17 0-28.5 11.5T680-500q0 17 11.5 28.5T720-460Zm-80 260v-160H320v160h320Zm80 80H240v-160H80v-240q0-51 35-85.5t85-34.5h560q51 0 85.5 34.5T880-520v240H720v160Zm80-240v-160q0-17-11.5-28.5T760-560H200q-17 0-28.5 11.5T160-520v160h80v-80h480v80h80Z"/></svg>
          </button>
        </div>`;
      return `<div class="rtx-row${i === 0 ? ' is-new' : ''}${isRefund ? ' is-refund' : ''}">` +
        `<span class="rtx-t">${when}</span>` +
        `<span class="rtx-m">${escS(m)}</span>` +
        `<span class="rtx-products">${identity}${products}${isRefund ? `<details class="rtx-detail"><summary>${escS(T({ fr: 'Détails du remboursement', en: 'Refund details', ar: 'تفاصيل الاسترداد' }))}</summary><p>${escS(s.originalRef || s.originalSaleId || T({ fr: 'Ticket d’origine non enregistré', en: 'Original receipt not recorded', ar: 'الإيصال الأصلي غير مسجل' }))}</p><p>${escS(s.actor || s.actorId || T({ fr: 'Identité non enregistrée', en: 'Identity not recorded', ar: 'الهوية غير مسجلة' }))} · ${escS(s.reason || T({ fr: 'Motif non enregistré', en: 'Reason not recorded', ar: 'السبب غير مسجل' }))}</p><p>${escS(d.toLocaleString(lang))} · ${escS(L[salesMethodKey(s)] || L.unknown)}</p></details>` : ''}</span>` +
        `<span class="rtx-a">${fmt(s.amount)}<span class="rtx-cur"> MAD</span></span>` +
        invoiceActions +
        `</div>`;
    }).join('');
    const voids = activity.filter((v) => {
      const ts = +(v && v.ts) || 0;
      const kindMatches = selectedKind === 'all'
        || (selectedKind === 'cancel' && v.kind !== 'takeout-handover')
        || (selectedKind === 'handover' && v.kind === 'takeout-handover');
      return v.kind !== 'refund' && kindMatches && ts >= lo && ts < hi && (!selectedMethods.length || selectedMethods.includes(salesMethodKey(v)));
    });
    const renderActivityRows = (sourceRows) => sourceRows.map((v) => {
      const d = new Date(v.ts || Date.now());
      const when = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const detail = (v.lines || []).map(l => `${Number(l.qty) || 1} × ${l.name || 'Article'}`).join(' · ') || v.label || 'Vente';
      const label = v.kind === 'takeout-handover' ? T({ fr: 'Commande remise au client', en: 'Order handed to customer', ar: 'سُلِّم الطلب إلى العميل' })
        : v.kind === 'closure' ? T({ fr: 'Table fermée / remise à zéro', en: 'Table closed / reset', ar: 'إغلاق / إعادة ضبط الطاولة' })
        : v.kind === 'order-cancel' ? T({ fr: 'Commande annulée', en: 'Order cancelled', ar: 'طلب ملغى' })
        : v.kind === 'restore' ? T({ fr: 'Vente rétablie', en: 'Sale restored', ar: 'استعادة البيع' }) : T({ fr: 'Vente annulée', en: 'Sale voided', ar: 'بيع ملغى' });
      const who = v.actor || v.actorId || T({ fr: 'Identité non enregistrée', en: 'Identity not recorded', ar: 'الهوية غير مسجلة' });
      const cashNote = ['closure', 'takeout-handover', 'order-cancel'].includes(v.kind) ? T({ fr: 'Sans mouvement d’argent', en: 'No cash movement', ar: 'بدون حركة مالية' }) : T({ fr: 'Correction de vente, pas un remboursement', en: 'Sale correction, not a refund', ar: 'تصحيح بيع، وليس استردادًا' });
      const source = v.source === 'caisse' ? T({ fr: 'Caisse', en: 'Till', ar: 'الصندوق' }) : v.source || '';
      const orderValue = ['closure', 'takeout-handover'].includes(v.kind) ? v.orderAmountCents : v.amountCents;
      const refs = ['closure', 'takeout-handover'].includes(v.kind)
        ? (v.kind === 'takeout-handover' ? `${T({ fr: 'Commande', en: 'Order', ar: 'الطلب' })} ${(v.orders || []).map(o => '#' + o.number).join(', ')}` : `${T({ fr: 'Table', en: 'Table', ar: 'طاولة' })} ${v.tableNo || '?'} · ${(v.orders || []).map(o => '#' + o.number).join(', ')}`)
        : v.ref || v.originalRef || v.saleId;
      return `<div class="rtx-activity-row"><span class="rtx-t">${escS(when)}</span><div><div class="rtx-identity"><span class="rtx-activity-tag">${escS(label)}</span><strong>${escS(refs)}</strong></div><div class="rtx-source">${escS(who)}${source ? ' · ' + escS(source) : ''}</div><details class="rtx-detail"><summary>${escS(T({ fr: 'Voir les détails', en: 'View details', ar: 'عرض التفاصيل' }))}</summary><p>${escS(detail)}</p><p>${escS(v.reason || '')} · ${escS(d.toLocaleString(lang))}</p><p>${escS(v.sessionId || v.saleId || '')}</p>${v.detailsTruncated ? `<p>${escS(T({ fr: 'Détail partiel (250 commandes maximum)', en: 'Partial detail (250 orders maximum)', ar: 'تفاصيل جزئية (250 طلبًا كحد أقصى)' }))}</p>` : ''}</details></div><div class="rtx-activity-value">${fmt(orderValue / 100)} MAD<small>${escS(cashNote)}</small></div></div>`;
    }).join('');
    const voidRows = renderActivityRows(voids.filter(v => v.kind !== 'takeout-handover'));
    const handoverRows = renderActivityRows(voids.filter(v => v.kind === 'takeout-handover'));
    const startingUp = T({ fr: 'Historique des opérations', en: 'Operations history', ar: 'سجل العمليات' });
    const page = window.Kiwi.appPage('transactions', {
      title: T({ fr: 'Ventes & activité', en: 'Sales & activity', ar: 'المبيعات والنشاط' }),
      subtitle: `${vd.name || T({ fr: 'Votre établissement', en: 'Your business', ar: 'منشأتك' })} · ${startingUp}`,
      body: `
        <div data-real-tx class="rtx">
          <div class="rtx-head">
            <div class="rtx-count">${count} ${escS(count === 1 ? SUM.one : SUM.n)} · ${escS(dayLabel)}</div>
            <div class="rtx-total">${voids.filter(v => v.kind !== 'restore' && v.kind !== 'takeout-handover').length} ${escS(T({ fr: 'annulations / fermetures', en: 'cancellations / closures', ar: 'إلغاءات / إغلاقات' }))}</div>
          </div>
          <div class="rtx-summary">${[
            [T({ fr: 'Encaissements', en: 'Collected', ar: 'المقبوضات' }), collected, ''],
            [T({ fr: 'Remboursements', en: 'Refunded', ar: 'المبالغ المستردة' }), -returned, 'is-refund'],
            [T({ fr: 'Net encaissé', en: 'Net collected', ar: 'صافي المقبوضات' }), total, ''],
          ].map(([label, value, cls]) => `<div class="${cls}"><span>${escS(label)}</span><strong>${fmt(value)} <small>MAD</small></strong></div>`).join('')}</div>
          <div class="rtx-day-host" data-rtx-day-selector></div>
          <div class="rtx-methods" role="group" aria-label="${escS(T({ fr: 'Activité', en: 'Activity', ar: 'النشاط' }))}">${kindButtons}</div>
          <div class="rtx-methods" role="group" aria-label="${escS(T({ fr: 'Type de vente', en: 'Sale type', ar: 'نوع البيع' }))}">${methodButtons}</div>
          ${cancelAuditLoading ? `<p class="rtx-notice" role="status">${escS(T({ fr: 'Chargement du journal…', en: 'Loading activity…', ar: 'جارٍ تحميل السجل…' }))}</p>` : ''}
          ${cancelAuditError ? `<p class="rtx-notice" role="alert">${escS(T({ fr: 'Journal indisponible. Les remboursements et annulations peuvent être incomplets.', en: 'Activity unavailable. Refunds and cancellations may be incomplete.', ar: 'السجل غير متاح. قد تكون المبالغ المستردة والإلغاءات غير مكتملة.' }))} <button type="button" class="rtx-method" data-action="sales-activity-retry">${escS(T({ fr: 'Réessayer', en: 'Retry', ar: 'إعادة المحاولة' }))}</button></p>` : ''}
          <div class="rtx-list">${rows || (voids.length && ['all', 'cancel', 'handover'].includes(selectedKind)) || cancelAuditLoading || cancelAuditError ? rows : `<div class="rtx-row"><span class="rtx-products-missing">${escS(T({
            fr: 'Aucune activité pour ces filtres.',
            en: 'No activity for these filters.',
            ar: 'لا يوجد نشاط لهذه الفلاتر.',
          }))}</span></div>`}</div>
          ${voids.some(v => v.kind !== 'takeout-handover') && ['all', 'cancel'].includes(selectedKind) ? `<section class="rtx-voids"><h3 class="rtx-void-title">${escS(T({ fr:'Annulations & fermetures', en:'Cancellations & closures', ar:'الإلغاءات والإغلاقات' }))}</h3><p class="rtx-void-sub">${escS(T({ fr:'Valeurs des commandes à titre informatif. Ces actions ne sont pas déduites une seconde fois du net encaissé.', en:'Order values are informational. These actions are not deducted again from net collected.', ar:'قيم الطلبات للمعلومات فقط. لا تُخصم هذه الإجراءات مرة أخرى من صافي المقبوضات.' }))}</p>${voidRows}</section>` : ''}
          ${handoverRows && ['all', 'handover'].includes(selectedKind) ? `<section class="rtx-voids"><h3 class="rtx-void-title">${escS(T({ fr:'Remises au client', en:'Customer handovers', ar:'تسليمات العملاء' }))}</h3>${handoverRows}</section>` : ''}
        </div>
      `,
    });
    window.KiwiDateRange?.mountDaySelector?.(page?.el?.querySelector('[data-rtx-day-selector]'), {
      value: selectedKey, merchant, offsets: [0, 1, 2], ariaLabel: T({ fr: 'Jour des ventes', en: 'Sales day', ar: 'يوم المبيعات' }),
      onChange: day => { salesDayByMerchant[merchant] = day; renderRealTransactions('transactions', STARTERS.transactions); },
    });
    loadCancelAudit();
  }

  function renderStarter(nav, meta) {
    /* Ventes: once the merchant has real sales (rung locally OR bridged from a
     * Live-Link caisse), show the actual list, not the "nothing yet" placeholder. */
    if (nav === 'transactions') {
      return renderRealTransactions(nav, meta);
    }
    /* Cette destination est celle affichée : une copie serveur qui arrive
     * ensuite a le droit de la repeindre — et elle seule. */
    starterOpen = nav;
    try { starterBind(nav); } catch (_) {}
    const KV = window.KiwiVenue;
    const vd = KV?.getCurrentVenueData?.() || {};
    const cfg = ADD[nav];
    const items = cfg ? getItems(nav) : [];
    const linked = pairedDeviceLines(nav);
    const hasItems = (items.length + linked.length) > 0;

    /* What this page becomes (kept — the honest framing). */
    const capRows = meta.b.map(x => `<div class="gp-starter-row">${CHECK}<span>${x}</span></div>`).join('');

    /* What the client has already added — real, persisted, shown right back. */
    const prep = hasItems ? `
      <div class="gp-starter-eyebrow">${escS(T(cfg.plural))} · ${items.length + linked.length}</div>
      <div class="gp-starter-prep">
        ${linked.concat(items).map(x => `<div class="gp-prep-row">${CHECK}<span>${escS(x)}</span></div>`).join('')}
      </div>` : '';

    /* Concrete ways to add data. Config pages get an "Add {noun}" button + the
     * universal first-sale action; output pages get first-sale as the primary. */
    /* "Encaisser ma première vente" stops being true the moment the first sale
     * exists — Promotions and Retours both kept offering it to a store that had
     * already rung two. Once there are sales, the useful next step is the sales
     * list itself. Same for the footer: stop promising a page that will build
     * "dès vos premières ventes" to someone who has made them. */
    const hasSales = !!(window.KiwiSales?.list && window.KiwiSales.list().length);
    const saleBtn = hasSales
      ? `<button class="kb ${cfg ? 'ghost' : 'atlas'}" type="button" data-action="nav-transactions">${escS(T(UI.seeSales))}</button>`
      : `<button class="kb ${cfg ? 'ghost' : 'atlas'}" type="button" data-action="new-sale">${escS(T(UI.firstSale))}</button>`;
    const actions = cfg
      ? `<div class="gp-starter-actions">
           <button class="kb atlas" type="button" data-action="starter-add" data-arg="${nav}">${escS(T(cfg.title))}</button>
           ${saleBtn}
         </div>`
      : nav === 'kds'
        ? `<div class="gp-starter-actions"><a class="kb atlas" href="kiwi-cuisine.html" target="_blank" rel="noopener">${escS(T(UI.openKds))}</a>${saleBtn.replace('kb atlas', 'kb ghost')}</div>`
        : `<div class="gp-starter-actions">${saleBtn}</div>`;

    const h3 = escS(hasItems ? T(UI.started) : T(UI.normal));
    /* Règlements et écran cuisine ne se remplissent PAS avec les ventes : Kiwi
     * ne fait pas transiter l'argent, et les tickets vivent sur Kiwi Cuisine.
     * Le pied générique leur promettait une page qui n'arrivera pas. */
    const foot = FOOT[nav] ? T(FOOT[nav]) : cfg ? T(UI.footAdd) : (hasSales ? T(UI.footBuilt) : T(UI.footSale));
    const startingUp = T({ fr: 'compte en démarrage', en: 'account getting started', ar: 'حساب قيد الإعداد' });

    window.Kiwi.appPage(nav, {
      title: starterTitle(nav, meta),
      subtitle: `${vd.name || T({ fr: 'Votre établissement', en: 'Your business', ar: 'منشأتك' })} · ${startingUp}`,
      body: `
        <div class="gp-starter" data-starter-nav="${nav}">
          <div class="gp-starter-ic">${SPARK}</div>
          <h3>${h3}</h3>
          <p>${meta.d}</p>
          ${prep}
          ${actions}
          <div class="gp-starter-list">${capRows}</div>
          <p class="gp-starter-foot">${foot}</p>
        </div>
      `,
    });
  }

  /* Wrap AFTER every module has registered/overridden its nav handlers.
   * Several modules (team.js, stock.js, conformite.js, finance.js…) re-install
   * their handlers at load+setTimeout(0) to win override wars, so a single
   * load-time wrap gets clobbered. The wrap is idempotent (already-wrapped
   * functions are skipped) and re-asserted after their timers and on every
   * venue switch — by the time a destination can be clicked, the guard is on. */
  function installStarters() {
    const H = window.Kiwi && window.Kiwi.handlers;
    if (!H) return;
    registerActions();
    Object.entries(STARTERS).forEach(([nav, meta]) => {
      const key = 'nav-' + nav;
      const orig = H[key];
      if (orig && orig.__kiwiStarter) return;
      const wrapped = function () {
        if (nav === 'transactions') loadCancelAudit();
        const realOrCustom = window.KiwiVenue?.isCustom?.() || window.KiwiEnv?.isReal?.();
        const allowed = REAL_FOR_CUSTOM.has(nav) || (REAL_WHEN[nav] && REAL_WHEN[nav]());
        if (realOrCustom && !allowed) return renderStarter(nav, meta);
        /* On quitte le starter pour une vraie page : sans ça, une copie serveur
         * arrivant en retard repeindrait la page starter PAR-DESSUS celle que le
         * commerçant vient d'ouvrir. */
        starterOpen = null;
        /* Direct invocations (mobile nav, palette, agent) bypass the sidebar
         * router's genpage cleanup — clear a leftover starter page so it
         * can't mask the destination's own body-class view. */
        document.body.classList.remove('page-genpage');
        return orig ? orig.apply(this, arguments) : undefined;
      };
      wrapped.__kiwiStarter = true;
      H[key] = wrapped;
    });
  }
  window.addEventListener('load', () => {
    setTimeout(installStarters, 150);
    if (window.KiwiVenue?.subscribe) window.KiwiVenue.subscribe(() => installStarters());
    /* Live-refresh the Ventes page when a sale lands (local ring-up OR a
     * Live-Link sale bridged from the caisse). Only re-renders when that page is
     * the one on screen — the real list, or the empty starter that a first sale
     * should flip into the list. */
    if (window.KiwiSales?.subscribe) window.KiwiSales.subscribe(() => {
      if (!transactionsOnScreen()) return;
      const H = window.Kiwi && window.Kiwi.handlers;
      try { if (H && H['nav-transactions']) H['nav-transactions'](); } catch (_) {}
    });
    if (window.KiwiRefunds?.subscribe) window.KiwiRefunds.subscribe(() => {
      if (transactionsOnScreen()) renderRealTransactions('transactions', STARTERS.transactions);
    });
    const refreshActivity = () => {
      if (!document.hidden && transactionsOnScreen()) loadCancelAudit();
    };
    window.setInterval(refreshActivity, 30000);
    window.addEventListener('online', refreshActivity);
    document.addEventListener('visibilitychange', refreshActivity);
    window.addEventListener('kiwi-day-report-ready', () => {
      if (!transactionsOnScreen()) return;
      const H = window.Kiwi && window.Kiwi.handlers;
      try { if (H && H['nav-transactions']) H['nav-transactions'](); } catch (_) {}
    });
    document.addEventListener('kiwi-sales-voided', (e) => {
      const isSync = e && e.detail && e.detail.source === 'live-link';
      const sig = JSON.stringify((e && e.detail && e.detail.refs) || []);
      if (sig === cancelAuditVoidSig) return;
      cancelAuditVoidSig = sig;
      loadCancelAudit(true);
      const refs = (e && e.detail && e.detail.refs) || [];
      refs.forEach((ref) => {
        let reversed = 0;
        try {
          if (ref && window.KiwiInventoryConsumption && window.KiwiInventoryConsumption.reverse) {
            reversed = window.KiwiInventoryConsumption.reverse(ref, 'Annulation tableau de bord');
          }
        } catch (_) {}
        if (!reversed && !isSync) {
          try {
            const msg = 'Vente annulée · stock non recrédité (référence introuvable)';
            if (typeof toast === 'function') toast(msg, { type: 'warning' });
            else if (window.Kiwi && window.Kiwi.toast) window.Kiwi.toast(msg, { type: 'warning' });
          } catch (_) {}
        }
      });
    });
  });
})();
