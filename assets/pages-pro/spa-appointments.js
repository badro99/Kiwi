/* ═══ Section 2 spa A · appointments / services ═══ */
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Spa Bahia — sidebar handlers (vertical : SPA)
 * ─────────────────────────────────────────────────────────────────────────
 * Two production-grade drawers for the Spa Bahia mode (Hivernage, Marrakech) :
 *   1. nav-appointments  → calendrier 7 jours × 3 praticiennes (Booksy-tier)
 *   2. nav-services      → catalogue services & forfaits (5 catégories)
 *
 * Lives on top of pages.js (.p-hero / .p-card / .p-table / .kb / .chip / .mono)
 * + the spa-only CSS appended to /tmp/kiwi-s2-boutique-spa-css.css.
 *
 * No IIFE, no framework — vanilla. Patches `window.Kiwi.handlers` directly.
 * ─────────────────────────────────────────────────────────────────────── */
'use strict';

(() => {
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const { handlers, drawer, modal, toast, confetti } = window.Kiwi;

  /* ─── Shared spa data ─── */
  const PRACT = [
    { id: 'NH', name: 'Nour El Hassan',   role: 'Sénior · 8 ans',                     skill: 'sénior',   color: 'var(--atlas)' },
    { id: 'SB', name: 'Salma Benkirane',  role: 'Certifiée CIDESCO · massage thérap.', skill: 'certifié', color: 'var(--riad)'  },
    { id: 'YB', name: 'Yasmine Bouchikhi', role: 'Junior · spécialisée hammam',        skill: 'junior',   color: '#D99A2B'      },
  ];
  const SERVICES = [
    // category : massage | facial | hammam | day | cure
    { cat: 'massage', name: 'Massage relaxant 60 min',  abbr: 'MR60',  dur: 60, price: 550,  room: 'Salon 1',     skill: 'sénior',   sales: 1, contras: ['Grossesse 1ᵉʳ trim.'], notes: 'Huile d’argan tiède' },
    { cat: 'massage', name: 'Massage californien',      abbr: 'MCA',   dur: 60, price: 650,  room: 'Salon 2',     skill: 'sénior',   sales: 4, contras: [], notes: 'Pressions enveloppantes' },
    { cat: 'massage', name: 'Massage couple 60 min',    abbr: 'COUPL', dur: 60, price: 1100, room: 'Salon 1+2',   skill: 'sénior',   sales: 6, contras: [], notes: 'Cabine duo, deux praticiennes' },
    { cat: 'massage', name: 'Modelage pieds',           abbr: 'PIEDS', dur: 30, price: 280,  room: 'Salon 3',     skill: 'junior',   sales: 9, contras: ['Plaies ouvertes'], notes: 'Réflexologie douce' },
    { cat: 'massage', name: 'Réflexologie',             abbr: 'REFLE', dur: 45, price: 380,  room: 'Salon 3',     skill: 'certifié', sales: 7, contras: ['Phlébite'], notes: 'Points pieds + mains' },
    { cat: 'facial',  name: 'Soin du visage',           abbr: 'SVIS',  dur: 60, price: 650,  room: 'Salon 3',     skill: 'sénior',   sales: 3, contras: ['Allergie miel'], notes: 'Argan + miel d’oranger' },
    { cat: 'facial',  name: 'Soin anti-âge',            abbr: 'AAGE',  dur: 75, price: 780,  room: 'Salon 3',     skill: 'certifié', sales: 5, contras: ['Acide hyaluron.'], notes: 'Sérum + LED' },
    { cat: 'hammam',  name: 'Hammam traditionnel',      abbr: 'HAMTR', dur: 75, price: 350,  room: 'Hammam',      skill: 'junior',   sales: 2, contras: ['Hypertension sévère'], notes: 'Savon noir beldi' },
    { cat: 'hammam',  name: 'Gommage corps',            abbr: 'GOM',   dur: 45, price: 400,  room: 'Hammam',      skill: 'junior',   sales: 8, contras: ['Peau lésée'], notes: 'Kessa + savon noir' },
    { cat: 'hammam',  name: 'Gommage rhassoul',         abbr: 'RHAS',  dur: 30, price: 320,  room: 'Hammam',      skill: 'junior',   sales: 11, contras: [], notes: 'Argile de l’Atlas' },
    { cat: 'hammam',  name: 'Enveloppement boue',       abbr: 'BOUE',  dur: 60, price: 620,  room: 'Cabine humide', skill: 'certifié', sales: 10, contras: ['Claustro.'], notes: 'Ghassoul chaud + huiles ess.' },
    { cat: 'day',     name: 'Forfait Argan',            abbr: 'ARGAN', dur: 90, price: 850,  room: 'Salon 1+Hammam', skill: 'sénior', sales: 0, contras: [], notes: 'Hammam + gommage + massage 30 min' },
  ];
  const CLIENTS = [
    { i: 'LP', n: 'Lisa P.',     tag: 'US · VIP',           color: '#0B6E4F' },
    { i: 'AM', n: 'Anna M.',     tag: 'DE · 3 visites',     color: '#053B2C' },
    { i: 'SL', n: 'Sophie L.',   tag: 'FR · 7 visites',     color: '#0B6E4F' },
    { i: 'CR', n: 'Camille R.',  tag: 'FR · 2 visites',     color: '#D99A2B' },
    { i: 'IS', n: 'Imane S.',    tag: 'MA · fidèle (12)',   color: '#053B2C' },
    { i: 'YT', n: 'Yasmine T.',  tag: 'MA · VIP',           color: '#0B6E4F' },
    { i: 'KL', n: 'Karim L.',    tag: 'MA · 4 visites',     color: '#D99A2B' },
    { i: 'LM', n: 'Lucia M.',    tag: 'ES · 1ʳᵉ visite',    color: '#053B2C' },
  ];

  /* ─── Helpers ─── */
  const fmt = (n) => (window.KiwiNumber?.format(Math.round(n), {}) ?? Math.round(n).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}));
  const SVG = (name, sz = 14) => `<i data-lucide="${name}" style="width:${sz}px;height:${sz}px" aria-hidden="true"></i>`;
  const ICN = {
    plus: SVG('plus'), cal: SVG('calendar'), user: SVG('user'),
    clock: SVG('clock'), sparkle: SVG('sparkles'), pkg: SVG('package'),
    edit: SVG('pencil'), trash: SVG('trash-2'), bell: SVG('bell')
  };
  const chip = (txt, cls = 'ok') => `<span class="chip ${cls}">${txt}</span>`;
  const riskChip = (r) => r === 'low' ? chip('Faible', 'ok') : r === 'mid' ? chip('Modéré', 'pend') : chip('Élevé', 'ref');

  /* ═══════════════════════════════════════════════════════════════════════
   * 1. nav-appointments — Calendrier rendez-vous (Spa Bahia)
   * ═════════════════════════════════════════════════════════════════════ */
  handlers['nav-appointments'] = () => {
    /* ─ Booking dataset (3 practitioners × 7 days × multiple slots) ─ */
    const DAYS = ['Lun 27', 'Mar 28', 'Mer 29', 'Jeu 30', 'Ven 1ᵉʳ', 'Sam 2', 'Dim 3'];
    const TODAY_IDX = 2; // mercredi — aujourd'hui
    const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
    // Bookings: [day, practitioner, startHour (decimal), durationHours, clientIdx, serviceIdx, risk, status, notes]
    const BOOK = [
      [0,'NH', 9.0, 1.5, 4, 11, 'low', 'ok',   'Cliente fidèle, prefère huile chaude'],
      [0,'NH',11.0, 1.0, 0,  1, 'low', 'ok',   'VIP, accueil thé à la menthe servi'],
      [0,'SB',10.0, 1.0, 1,  6, 'mid', 'ok',   'Allergie parabènes notée au dossier'],
      [0,'YB',14.0, 1.25, 7, 7, 'low', 'ok',   'Première visite, expliquer le rituel'],
      [1,'NH', 8.5, 1.0, 2,  0, 'low', 'ok',   ''],
      [1,'NH',14.0, 1.5, 5, 11, 'low', 'ok',   'Soin avant gala vendredi soir'],
      [1,'SB',10.0, 1.25, 3, 5, 'low', 'ok',   ''],
      [1,'YB',11.0, 0.75, 6, 9, 'high','pend', 'No-show 2× sur 6 mois, acompte demandé'],
      [1,'YB',16.0, 1.0, 1,  8, 'low', 'ok',   ''],
      // Today (Wednesday)
      [2,'NH', 9.0, 1.0, 4,  0, 'low', 'ok',   'Soins pieds en supplément'],
      [2,'NH',10.5, 1.5, 5, 11, 'low', 'ok',   'Forfait avec hammam puis massage'],
      [2,'NH',14.0, 1.0, 0,  1, 'low', 'ok',   'VIP, table de massage chauffée'],
      [2,'NH',16.0, 1.25, 2, 6, 'mid', 'pend', 'Confirmation WhatsApp en attente'],
      [2,'SB', 9.5, 1.0, 7,  4, 'low', 'ok',   ''],
      [2,'SB',11.5, 1.25, 3, 5, 'low', 'ok',   'Préfère cabine 3 (vue patio)'],
      [2,'SB',15.0, 1.0, 1,  6, 'low', 'ok',   ''],
      [2,'SB',17.0, 1.0, 6,  2, 'high','pend', 'Anniversaire du couple'],
      [2,'YB', 9.0, 1.25, 4, 7, 'low', 'ok',   ''],
      [2,'YB',12.0, 0.5, 5,  9, 'low', 'ok',   ''],
      [2,'YB',14.5, 1.0, 7,  8, 'mid', 'ok',   ''],
      [2,'YB',16.5, 1.25, 6,10, 'low', 'ok',   'Demande huile sans parfum'],
      // Thu / Fri / Sat / Sun forward bookings
      [3,'NH',10.0, 1.5, 0, 11, 'low', 'ok',   ''],
      [3,'SB',14.0, 1.25, 5, 6, 'low', 'ok',   ''],
      [3,'YB',16.0, 1.0, 1,  8, 'low', 'ok',   ''],
      [4,'NH', 9.0, 1.0, 4,  1, 'low', 'ok',   ''],
      [4,'NH',11.0, 1.5, 5, 11, 'low', 'ok',   ''],
      [4,'NH',15.0, 1.0, 2,  0, 'low', 'ok',   ''],
      [4,'SB',10.0, 1.25, 3, 5, 'low', 'ok',   ''],
      [4,'SB',13.0, 1.0, 6,  6, 'mid', 'ok',   ''],
      [4,'YB',14.0, 1.25, 7,10, 'low', 'ok',   ''],
      [4,'YB',17.0, 1.0, 1,  8, 'low', 'ok',   ''],
      [5,'NH',10.0, 1.0, 0,  0, 'low', 'ok',   'Samedi chargé, buffer 15 min'],
      [5,'NH',12.0, 1.0, 4, 11, 'low', 'ok',   ''],
      [5,'NH',15.0, 1.5, 2,  2, 'low', 'ok',   'Couple, anniversaire mariage'],
      [5,'SB',11.0, 1.25, 3, 5, 'low', 'ok',   ''],
      [5,'SB',14.0, 1.0, 5,  6, 'low', 'ok',   ''],
      [5,'YB',13.0, 1.25, 6, 7, 'low', 'ok',   ''],
      [5,'YB',16.0, 1.0, 7,  9, 'low', 'ok',   ''],
      [6,'SB',11.0, 1.0, 1,  4, 'low', 'ok',   'Dimanche, équipe réduite'],
      [6,'YB',14.0, 1.25, 5, 10,'low', 'ok',   ''],
    ];

    const todaysCount = BOOK.filter(b => b[0] === TODAY_IDX).length;
    const fillRate = Math.round((BOOK.length / (3 * 7 * 12 / 2)) * 100); // booked vs available 30-min slots
    const noShowCount = BOOK.filter(b => b[6] === 'high' || b[6] === 'mid').length;

    /* ─ Calendar block geometry: 8h–20h = 12h tall (each hour ≈ 26 px) ─ */
    const HSTART = 8, HEND = 20;
    const renderBlock = (b, idx) => {
      const [day, pid, h, dur, clIdx, svIdx, risk] = b;
      const top = ((h - HSTART) / (HEND - HSTART)) * 100;
      const height = (dur / (HEND - HSTART)) * 100;
      const cl = CLIENTS[clIdx];
      const sv = SERVICES[svIdx];
      const riskBadge = risk === 'low' ? '' : `<span class="s-cal-risk ${risk}"></span>`;
      return `<div class="s-cal-block" data-action="appt-detail" data-arg="${idx}" style="top:${top}%; height:${height}%; --pcol:${PRACT.find(p => p.id === pid).color};">
        <div class="s-cal-name">${cl.i} · ${sv.abbr}</div>
        <div class="s-cal-time">${String(Math.floor(h)).padStart(2,'0')}:${(h%1?'30':'00')} · ${sv.dur} min</div>
        ${riskBadge}
      </div>`;
    };

    const renderCol = (dayIdx, pid) => {
      const blocks = BOOK
        .map((b, i) => [b, i])
        .filter(([b]) => b[0] === dayIdx && b[1] === pid)
        .map(([b, i]) => renderBlock(b, i))
        .join('');
      return `<div class="s-cal-col" data-day="${dayIdx}" data-pract="${pid}">
        ${HOURS.map((h, i) => i === 0 ? '' : `<div class="s-cal-hline" style="top:${(i / (HOURS.length - 1)) * 100}%"></div>`).join('')}
        ${blocks}
      </div>`;
    };

    /* ─ Heatmap : utilisation horaire moyenne sur 7 jours ─ */
    const heatRow = HOURS.map((h, i) => {
      const slot = HSTART + i;
      const booked = BOOK.filter(b => slot >= b[2] && slot < b[2] + b[3]).length;
      const pct = Math.min(100, Math.round((booked / (3 * 7)) * 220));
      return `<div class="s-heat-cell" style="background: rgba(11,110,79, ${0.08 + pct / 140});" title="${h} · ${booked} RDV cumulés">
        <div class="s-heat-h">${h.split(':')[0]}h</div>
      </div>`;
    }).join('');

    /* ─ Waitlist (auto-promote when slot frees) ─ */
    const WAIT = [
      { c: CLIENTS[0], svc: 'Forfait Argan',     pref: 'Mer 14h–17h', auto: true,  ctx: 'Annulation Imane S. → push' },
      { c: CLIENTS[3], svc: 'Massage relaxant',   pref: 'Jeu 16h+',    auto: true,  ctx: 'Première visite, 2 places dispos' },
      { c: CLIENTS[6], svc: 'Hammam traditionnel', pref: 'Sam matin',  auto: false, ctx: 'Préférence Yasmine B.' },
      { c: CLIENTS[2], svc: 'Soin anti-âge',      pref: 'Ven soir',    auto: true,  ctx: 'Avant gala, urgent' },
    ];

    const r = window.Kiwi.appPage('appointments', {
      title: 'Calendrier rendez-vous',
      subtitle: 'Spa Bahia · Hivernage · 3 praticiennes',
      body: `
        <div class="p-hero" style="background: linear-gradient(135deg, var(--atlas), var(--brand-deep));">
          <div class="l">SEMAINE DU 27 AVRIL · MERCREDI EN COURS</div>
          <div class="big">${todaysCount} <span style="font-size:18px; opacity:0.7;">RDV aujourd'hui</span></div>
          <div class="sub">3 praticiennes · 12 heures d'ouverture · liste d'attente : ${WAIT.length} clientes</div>
        </div>

        <!-- KPI strip 4-up -->
        <div class="s-kpi-strip">
          <div class="s-kpi"><div class="l">TAUX REMPLISSAGE</div><div class="v">${fillRate} <span class="u">%</span></div><div class="sub">vs 64 % la sem. dernière</div></div>
          <div class="s-kpi"><div class="l">RDV AUJOURD'HUI</div><div class="v">${todaysCount}</div><div class="sub">17 confirmés · ${todaysCount - 17 > 0 ? todaysCount - 17 : 0} acomptes attente</div></div>
          <div class="s-kpi"><div class="l">RISQUE NO-SHOW</div><div class="v">${noShowCount}</div><div class="sub">3 modérés · 2 élevés (acompte)</div></div>
          <div class="s-kpi"><div class="l">LISTE D'ATTENTE</div><div class="v">${WAIT.length}</div><div class="sub">${WAIT.filter(w => w.auto).length} en auto-promotion</div></div>
        </div>

        <!-- Toolbar -->
        <div class="p-toolbar" style="margin: 4px 0 14px;">
          <div class="p-search">${SVG('search')}Rechercher cliente ou téléphone…</div>
          <button class="kb ghost" data-action="appt-filter">${SVG('list-filter',13)}Filtrer</button>
          <button class="kb ghost" data-action="appt-export">${SVG('arrow-down-to-line',13)}Exporter</button>
          <button class="kb atlas" data-action="appt-new">${ICN.plus}Nouveau RDV</button>
        </div>

        <!-- Practitioner legend -->
        <div class="s-legend">
          ${PRACT.map(p => `<span class="s-legend-it"><i style="background:${p.color};"></i><b>${p.id}</b> ${p.name} <span class="m">· ${p.role}</span></span>`).join('')}
        </div>

        <!-- Calendar grid: hours rail + 7 day columns × 3 practitioner sub-cols -->
        <div class="s-cal-shell">
          <div class="s-cal-rail">
            ${HOURS.map(h => `<div class="s-cal-rail-h">${h}</div>`).join('')}
          </div>
          <div class="s-cal-grid">
            ${DAYS.map((d, di) => `
              <div class="s-cal-day ${di === TODAY_IDX ? 'today' : ''}">
                <div class="s-cal-day-head">${d}${di === TODAY_IDX ? '<span class="s-now">●</span>' : ''}</div>
                <div class="s-cal-day-body">
                  ${PRACT.map(p => renderCol(di, p.id)).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Heatmap row -->
        <div class="s-heat-shell">
          <div class="s-heat-head"><b>Disponibilité moyenne · 7 jours</b><span class="m">Plus c'est sombre, plus le créneau est demandé</span></div>
          <div class="s-heat-row">${heatRow}</div>
        </div>

        <!-- Bottom dual cards: waitlist + channel breakdown -->
        <div class="p-grid-2 s-bottom-grid">
          <div class="p-card">
            <div class="head">
              <h4>Liste d'attente</h4>
              <button class="kb ghost" data-action="appt-wait-add" style="padding:6px 12px; font-size:12px;">+ Ajouter</button>
            </div>
            <div class="s-auto-toggle">
              <label class="s-switch"><input type="checkbox" data-action="appt-auto-toggle" checked><span class="s-slider"></span></label>
              <div><b>Auto-promotion</b><div class="m">Notifie la prochaine cliente dès qu'un créneau se libère</div></div>
            </div>
            ${WAIT.map((w, i) => `
              <div class="s-wait" data-action="appt-wait-detail" data-arg="${i}">
                <div class="s-wait-av" style="background:${w.c.color};">${w.c.i}</div>
                <div class="s-wait-info">
                  <b>${w.c.n}</b>
                  <div class="m">${w.svc} · ${w.pref}</div>
                  <div class="m s-wait-ctx">${w.ctx}</div>
                </div>
                <div class="s-wait-actions">
                  ${w.auto ? chip('Auto', 'ok') : chip('Manuel', 'neutral')}
                  <button class="kb ghost" style="padding:5px 9px; font-size:11px;" data-action="appt-wait-promote" data-arg="${i}">Promouvoir →</button>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="p-card">
            <div class="head"><h4>Origine des réservations</h4><span class="meta">7 DERNIERS JOURS</span></div>
            ${[
              ['Direct (téléphone, walk-in)', 38, 'var(--atlas)'],
              ['WhatsApp', 27, 'var(--riad)'],
              ['Booking.com Spa', 18, '#D99A2B'],
              ['Treatwell-like (Spa Atlas)', 12, '#7DF2B0'],
              ['Concierge hôtel partenaire', 5, 'var(--n-400)'],
            ].map(([n, p, c]) => `
              <div class="s-chan">
                <div class="s-chan-info"><b>${n}</b><span class="s-chan-pct">${p} %</span></div>
                <div class="s-chan-bar"><div style="width:${p * 2.5}%; background:${c};"></div></div>
              </div>
            `).join('')}
            <div class="rc-foot" style="margin-top:12px;">Booking.com prélève 15 % de commission. Direct + WhatsApp restent vos canaux les plus marges.</div>
          </div>
        </div>
      `,
      foot: `
        <button class="kb atlas" data-action="appt-new">${ICN.plus}Nouveau rendez-vous</button>
      `,
    });

    /* ─ Slot click → nested drawer with full booking details ─ */
    setTimeout(() => {
      r.el.addEventListener('click', (e) => {
        const dismiss = e.target.closest('[data-dismiss]');
        if (dismiss) { r.close(); return; }
        const block = e.target.closest('[data-action="appt-detail"]');
        if (block) {
          e.stopPropagation();
          const idx = +block.dataset.arg;
          openBookingDetail(BOOK[idx]);
        }
        const promote = e.target.closest('[data-action="appt-wait-promote"]');
        if (promote) {
          e.stopPropagation();
          const i = +promote.dataset.arg;
          const w = WAIT[i];
          toast('Cliente promue', { type: 'success', desc: `${w.c.n} reçoit un SMS « créneau dispo » à l'instant.` });
        }
      }, true);
    }, 60);

    /* ─ Booking detail (nested drawer) ─ */
    function openBookingDetail(b) {
      const [day, pid, h, dur, clIdx, svIdx, risk, status, notes] = b;
      const cl = CLIENTS[clIdx];
      const sv = SERVICES[svIdx];
      const pr = PRACT.find(p => p.id === pid);
      const sd = drawer({
        title: `RDV · ${cl.n}`,
        subtitle: `${DAYS[day]} · ${String(Math.floor(h)).padStart(2,'0')}:${h%1?'30':'00'} · ${sv.dur} min`,
        width: 460,
        body: `
          <div class="s-detail-hero" style="background: linear-gradient(135deg, ${pr.color}, var(--ink));">
            <div class="l">${DAYS[day].toUpperCase()} · ${String(Math.floor(h)).padStart(2,'0')}:${h%1?'30':'00'}</div>
            <div class="big">${sv.name}</div>
            <div class="sub">${pr.name} · ${sv.room}</div>
          </div>

          <div class="s-detail-grid">
            <div><div class="l">CLIENTE</div><div class="v">${cl.n}</div><div class="sub">${cl.tag}</div></div>
            <div><div class="l">SERVICE</div><div class="v">${sv.dur} min · ${fmt(sv.price)} MAD</div><div class="sub">${sv.notes}</div></div>
            <div><div class="l">PRATICIENNE</div><div class="v">${pr.name}</div><div class="sub">${pr.role}</div></div>
            <div><div class="l">SALLE</div><div class="v">${sv.room}</div><div class="sub">Niveau requis : ${sv.skill}</div></div>
          </div>

          <div class="s-detail-meta">
            <div class="s-meta-row"><span>Risque no-show</span>${riskChip(risk)}</div>
            <div class="s-meta-row"><span>Statut paiement</span>${status === 'ok' ? chip('Acompte reçu', 'ok') : chip('Acompte attente', 'pend')}</div>
            <div class="s-meta-row"><span>Rappel WhatsApp J-1</span>${chip('Programmé 18h', 'neutral')}</div>
          </div>

          ${notes ? `<div class="s-detail-notes"><b>Notes praticienne</b><p>${notes}</p></div>` : ''}

          ${sv.contras.length ? `<div class="s-detail-contras">
            <b>Contre-indications</b>
            <div class="s-contra-row">${sv.contras.map(c => chip(c, 'pend')).join(' ')}</div>
          </div>` : ''}
        `,
        foot: `
          <div class="s-foot-row">
            <button class="kb ghost" data-action="appt-cancel">${ICN.trash}Annuler</button>
            <button class="kb ghost" data-action="appt-reschedule">${ICN.cal}Reprogrammer</button>
            <button class="kb atlas" data-action="appt-confirm-final">${ICN.bell}Confirmer</button>
          </div>
        `,
      });
      // Wire up footer
      setTimeout(() => {
        sd.el.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-action="appt-cancel"]')) {
            modal({
              title: 'Annuler ce rendez-vous ?',
              desc: `${cl.n} sera notifiée par WhatsApp. Si un acompte a été versé, il est conservé en avoir.`,
              body: '',
              foot: `<button class="kb ghost" data-dismiss>Garder</button><button class="kb danger" data-action="appt-cancel-confirm">Annuler le RDV</button>`,
            });
          }
          if (ev.target.closest('[data-action="appt-reschedule"]')) {
            toast('Lien de reprogrammation envoyé', { type: 'info', desc: `${cl.n} pourra choisir un nouveau créneau via WhatsApp.` });
          }
          if (ev.target.closest('[data-action="appt-confirm-final"]')) {
            sd.close();
            confetti();
            toast('RDV confirmé', { type: 'success', desc: `${cl.n} · ${sv.name} · ${pr.name}` });
          }
        });
      }, 60);
    }
  };

  /* ─── Aux handlers used inside the appointments drawer ─── */
  handlers['appt-filter']      = () => toast('Filtres', { type: 'info', desc: 'Praticienne, service, statut, risque no-show, choix multi.' });
  handlers['appt-export']      = () => toast('Planning exporté', { type: 'success', desc: '7 jours en PDF + iCal · envoyé à l\'équipe.' });
  handlers['appt-wait-add']    = () => toast('Ajout liste d\'attente', { type: 'info', desc: 'Saisissez la cliente et la préférence de créneau.' });
  handlers['appt-auto-toggle'] = () => toast('Auto-promotion mise à jour', { type: 'info', desc: 'Les annulations envoient désormais un SMS instantané.' });
  handlers['appt-wait-detail'] = () => toast('Détail liste d\'attente', { type: 'info', desc: 'Historique de visites · pref. praticienne · canal de rappel.' });
  handlers['appt-cancel-confirm'] = () => {
    document.querySelectorAll('.kiwi-backdrop').forEach(b => b.querySelector('.kiwi-modal-close')?.click());
    toast('RDV annulé', { type: 'warn', desc: 'WhatsApp envoyé · acompte converti en avoir 90 jours.' });
  };

  /* ─── Wizard: nouvelle réservation ─── */
  handlers['appt-new'] = () => {
    let step = 1, picked = { service: null, pract: null, date: null, time: null, client: null };

    const wizBody = () => {
      const stepsBar = `<div class="wiz-steps">
        ${[1,2,3,4,5,6].map(s => `<div class="wiz-step ${s < step ? 'done' : s === step ? 'active' : ''}"></div>`).join('')}
      </div>`;
      let content = '';
      if (step === 1) {
        content = `
          <h4 style="margin:0 0 12px; font-size:15px;">1. Choisir un service</h4>
          <div class="s-wiz-grid">
            ${SERVICES.slice(0, 8).map((s, i) => `
              <div class="wiz-choice ${picked.service === i ? 'selected' : ''}" data-pick-svc="${i}">
                <div class="wc-ic">${ICN.sparkle}</div>
                <div><div class="wc-t">${s.name}</div><div class="wc-d">${s.dur} min · ${fmt(s.price)} MAD · ${s.room}</div></div>
              </div>
            `).join('')}
          </div>`;
      } else if (step === 2) {
        content = `
          <h4 style="margin:0 0 12px; font-size:15px;">2. Choisir une praticienne</h4>
          <div class="s-wiz-grid">
            ${PRACT.map((p, i) => `
              <div class="wiz-choice ${picked.pract === i ? 'selected' : ''}" data-pick-pract="${i}">
                <div class="wc-ic" style="background:${p.color}; color:var(--paper);">${p.id}</div>
                <div><div class="wc-t">${p.name}</div><div class="wc-d">${p.role} · niveau ${p.skill}</div></div>
              </div>
            `).join('')}
          </div>`;
      } else if (step === 3) {
        content = `
          <h4 style="margin:0 0 12px; font-size:15px;">3. Choisir un jour</h4>
          <div class="s-wiz-days">
            ${['Lun 27','Mar 28','Mer 29','Jeu 30','Ven 1','Sam 2','Dim 3'].map((d, i) => `
              <button class="s-wiz-day ${picked.date === i ? 'on' : ''}" data-pick-date="${i}">
                <span class="d">${d.split(' ')[0]}</span>
                <span class="n">${d.split(' ')[1]}</span>
              </button>
            `).join('')}
          </div>`;
      } else if (step === 4) {
        const slots = ['09:00','09:30','10:30','11:00','12:00','14:00','14:30','15:00','16:00','17:00','17:30','18:30'];
        content = `
          <h4 style="margin:0 0 12px; font-size:15px;">4. Choisir un créneau</h4>
          <div class="s-wiz-times">
            ${slots.map((t, i) => `
              <button class="s-wiz-time ${picked.time === i ? 'on' : ''}" data-pick-time="${i}">${t}</button>
            `).join('')}
          </div>
          <div class="kf-help" style="margin-top:14px;">Les créneaux grisés sont déjà occupés par un autre RDV.</div>`;
      } else if (step === 5) {
        content = `
          <h4 style="margin:0 0 12px; font-size:15px;">5. Cliente</h4>
          <div class="kf-group"><label class="kf-label">Nom complet</label><input class="kf-input" placeholder="ex. Sophie Lambert" id="wiz-cl-n" value="${picked.client?.n || ''}"></div>
          <div class="kf-row">
            <div class="kf-group"><label class="kf-label">Téléphone</label><input class="kf-input" placeholder="+212 6 ..." id="wiz-cl-p" value="${picked.client?.p || ''}"></div>
            <div class="kf-group"><label class="kf-label">Email (optionnel)</label><input class="kf-input" placeholder="cliente@email.com" id="wiz-cl-e" value="${picked.client?.e || ''}"></div>
          </div>
          <div class="kf-group"><label class="kf-label">Notes (allergies, préférences)</label><textarea class="kf-input" rows="2" placeholder="ex. allergie parabènes" id="wiz-cl-nt">${picked.client?.nt || ''}</textarea></div>`;
      } else if (step === 6) {
        const sv = SERVICES[picked.service ?? 0];
        const pr = PRACT[picked.pract ?? 0];
        const dy = ['Lun 27','Mar 28','Mer 29','Jeu 30','Ven 1','Sam 2','Dim 3'][picked.date ?? 0];
        const tm = ['09:00','09:30','10:30','11:00','12:00','14:00','14:30','15:00','16:00','17:00','17:30','18:30'][picked.time ?? 0];
        content = `
          <h4 style="margin:0 0 12px; font-size:15px;">6. Récapitulatif</h4>
          <div class="s-wiz-recap">
            <div class="s-rec-line"><span>Service</span><b>${sv.name}</b></div>
            <div class="s-rec-line"><span>Praticienne</span><b>${pr.name}</b></div>
            <div class="s-rec-line"><span>Date · heure</span><b>${dy} · ${tm}</b></div>
            <div class="s-rec-line"><span>Salle</span><b>${sv.room}</b></div>
            <div class="s-rec-line"><span>Cliente</span><b>${picked.client?.n || '·'}</b></div>
            <div class="s-rec-line"><span>Téléphone</span><b>${picked.client?.p || '·'}</b></div>
            <div class="s-rec-total"><span>Total</span><b>${fmt(sv.price)} MAD</b></div>
          </div>
          <label class="s-rec-check"><input type="checkbox" id="wiz-deposit"><span>Demander un acompte de 30 %</span></label>
          <label class="s-rec-check"><input type="checkbox" id="wiz-wa" checked><span>Confirmation WhatsApp automatique</span></label>`;
      }
      return stepsBar + content;
    };

    const m = modal({
      title: 'Nouveau rendez-vous',
      tag: 'SPA BAHIA',
      desc: 'Service → praticienne → date → heure → cliente → confirmation',
      body: wizBody(),
      foot: `
        <button class="kb ghost" data-action="wiz-back">Retour</button>
        <button class="kb atlas" data-action="wiz-next">Suivant →</button>
      `,
      width: 580,
    });

    const refresh = () => { m.el.querySelector('.kiwi-modal-body').innerHTML = wizBody(); };

    setTimeout(() => {
      m.el.addEventListener('click', (e) => {
        const svc = e.target.closest('[data-pick-svc]'); if (svc) { picked.service = +svc.dataset.pickSvc; refresh(); }
        const pr  = e.target.closest('[data-pick-pract]'); if (pr) { picked.pract   = +pr.dataset.pickPract; refresh(); }
        const dt  = e.target.closest('[data-pick-date]'); if (dt) { picked.date    = +dt.dataset.pickDate; refresh(); }
        const tm  = e.target.closest('[data-pick-time]'); if (tm) { picked.time    = +tm.dataset.pickTime; refresh(); }
        if (e.target.closest('[data-action="wiz-back"]')) { if (step > 1) { step--; refresh(); } else { m.close(); } }
        if (e.target.closest('[data-action="wiz-next"]')) {
          if (step === 5) {
            picked.client = {
              n:  m.el.querySelector('#wiz-cl-n')?.value || 'Cliente',
              p:  m.el.querySelector('#wiz-cl-p')?.value || '',
              e:  m.el.querySelector('#wiz-cl-e')?.value || '',
              nt: m.el.querySelector('#wiz-cl-nt')?.value || '',
            };
          }
          if (step === 6) {
            m.close();
            confetti();
            const sv = SERVICES[picked.service ?? 0];
            toast('Rendez-vous confirmé', { type: 'success', desc: `${picked.client?.n || 'Cliente'} · ${sv.name} · WhatsApp envoyé.` });
            return;
          }
          if (step < 6) { step++; refresh(); }
          if (step === 6) m.el.querySelector('[data-action="wiz-next"]').textContent = 'Confirmer · envoyer WhatsApp';
        }
      });
    }, 60);
  };

  /* ═══════════════════════════════════════════════════════════════════════
   * 2. nav-services — Catalogue services & forfaits (Spa Bahia)
   * ═════════════════════════════════════════════════════════════════════ */
  handlers['nav-services'] = () => {
    const TABS = [
      { k: 'massage', n: 'Massages',          c: 5 },
      { k: 'facial',  n: 'Soins du visage',   c: 2 },
      { k: 'hammam',  n: 'Hammam & gommages', c: 4 },
      { k: 'day',     n: 'Forfaits journée',  c: 3 },
      { k: 'cure',    n: 'Cures multi-séances', c: 3 },
    ];
    const PACKAGES = [
      { n: 'Forfait Argan',          dur: '90 min',  p: 850,  desc: 'Hammam traditionnel + gommage + massage relaxant 30 min',         tag: 'Best-seller', sales: 38 },
      { n: 'Cure 4 séances',         dur: '4 × 60',  p: 2400, desc: 'Massage relaxant ou californien · valable 90 jours',              tag: 'Cure',        sales: 22 },
      { n: 'Soirée détente couple',  dur: '2 h',     p: 1980, desc: 'Hammam privatif + massage couple 60 min + thé à la menthe',       tag: 'Couple',      sales: 14 },
      { n: 'Mariée du jour',         dur: '4 h',     p: 4200, desc: 'Hammam + gommage rhassoul + soin visage + massage + manucure',    tag: 'Premium',     sales: 6  },
    ];
    const CURES = [
      { n: 'Cure Anti-âge · 5 séances', dur: '5 × 75', p: 3600, desc: 'Soin anti-âge LED · 1 séance / semaine pendant 5 sem.',         sales: 9 },
      { n: 'Cure Hammam mensuelle',     dur: 'illim.', p: 900,  desc: 'Accès illimité hammam + 2 gommages / mois · récurrent',         sales: 28 },
      { n: 'Cure Sportif récup.',       dur: '6 × 60', p: 2700, desc: 'Massage thérapeutique + réflexologie alternés',                 sales: 4 },
    ];

    const renderTabBody = (k) => {
      if (k === 'day') {
        return PACKAGES.map((p, i) => `
          <div class="s-pkg-card" data-action="svc-pkg-edit" data-arg="${i}">
            <div class="s-pkg-tag">${p.tag.toUpperCase()}</div>
            <h5>${p.n}</h5>
            <div class="s-pkg-meta">${p.dur} · ${fmt(p.p)} MAD</div>
            <p class="s-pkg-desc">${p.desc}</p>
            <div class="s-pkg-foot">
              <span class="meta">${p.sales} ventes / 30 j</span>
              <button class="kb ghost" style="padding:5px 10px; font-size:11.5px;" data-action="svc-pkg-edit" data-arg="${i}">${ICN.edit}Modifier</button>
            </div>
          </div>
        `).join('');
      }
      if (k === 'cure') {
        return CURES.map((c, i) => `
          <div class="s-pkg-card" data-action="svc-cure-edit" data-arg="${i}">
            <div class="s-pkg-tag" style="background: var(--inverse-surface); color: var(--mint);">CURE MULTI-SÉANCES</div>
            <h5>${c.n}</h5>
            <div class="s-pkg-meta">${c.dur} · ${fmt(c.p)} MAD</div>
            <p class="s-pkg-desc">${c.desc}</p>
            <div class="s-pkg-foot">
              <span class="meta">${c.sales} cures actives</span>
              <button class="kb ghost" style="padding:5px 10px; font-size:11.5px;">${ICN.edit}Modifier</button>
            </div>
          </div>
        `).join('');
      }
      const items = SERVICES.filter(s => s.cat === k).sort((a, b) => a.sales - b.sales);
      return `
        <table class="p-table s-svc-table">
          <thead><tr>
            <th>SERVICE</th><th class="right">DURÉE</th><th class="right">PRIX</th>
            <th>SALLE</th><th>NIVEAU</th><th>CONTRE-INDICATIONS</th><th class="right">RANG 30J</th><th></th>
          </tr></thead>
          <tbody>
            ${items.map((s, i) => `
              <tr data-action="svc-edit" data-arg="${SERVICES.indexOf(s)}">
                <td><b>${s.name}</b><div class="s-svc-notes">${s.notes || ''}</div></td>
                <td class="mono right">${s.dur} min</td>
                <td class="mono right">${fmt(s.price)} MAD</td>
                <td><span class="s-room-pill">${s.room}</span></td>
                <td><span class="s-skill ${s.skill}">${s.skill}</span></td>
                <td>${s.contras.length ? s.contras.map(c => `<span class="chip pend" style="margin-right:4px;">${c}</span>`).join('') : '<span style="color: var(--n-500);">·</span>'}</td>
                <td class="mono right"><b>#${s.sales + 1}</b></td>
                <td><button class="kb ghost" style="padding:4px 8px; font-size:11px;" data-action="svc-edit" data-arg="${SERVICES.indexOf(s)}">${ICN.edit}</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    };

    const r = window.Kiwi.appPage('services', {
      title: 'Services & forfaits',
      subtitle: 'Spa Bahia · catalogue complet · 17 prestations',
      body: `
        <div class="p-hero" style="background: linear-gradient(135deg, var(--atlas), var(--brand-deep));">
          <div class="l">CATALOGUE COMPLET</div>
          <div class="big">${SERVICES.length + PACKAGES.length + CURES.length} <span style="font-size:18px; opacity:0.7;">prestations actives</span></div>
          <div class="sub">12 services à la carte · 4 forfaits journée · 3 cures · ticket moyen 612 MAD</div>
        </div>

        <!-- AI insight banner -->
        <div class="s-ai-banner">
          <div class="s-ai-ic">${ICN.sparkle}</div>
          <div>
            <div class="s-ai-title">Forfait Argan en hausse de 24 % MoM</div>
            <div class="s-ai-desc">Vos clientes touristes le préfèrent à la carte 2× sur 3. Considérez un upsell « Argan Deluxe » à +250 MAD avec massage 60 min.</div>
          </div>
          <button class="kb ghost" style="padding:7px 12px; font-size:12px;" data-action="svc-ai-action">Créer Argan Deluxe</button>
        </div>

        <!-- Toolbar -->
        <div class="p-toolbar" style="margin: 4px 0 14px;">
          <div class="p-search">${SVG('search')}Rechercher un service…</div>
          <button class="kb ghost" data-action="svc-season">${ICN.cal}Programmation saisonnière</button>
          <button class="kb ghost" data-action="svc-export">${SVG('arrow-down-to-line',13)}Exporter</button>
          <button class="kb atlas" data-action="svc-new">${ICN.plus}Nouveau service</button>
        </div>

        <!-- Tabs -->
        <div class="resv-tabs s-tabs" role="tablist">
          ${TABS.map((t, i) => `
            <button class="resv-tab ${i === 0 ? 'on' : ''}" data-svc-tab="${t.k}">
              ${t.n} <span class="s-tab-count">${t.c}</span>
            </button>
          `).join('')}
        </div>

        ${TABS.map((t, i) => `
          <div class="resv-pane s-svc-pane" data-svc-pane="${t.k}" ${i === 0 ? '' : 'hidden'}>
            ${renderTabBody(t.k)}
          </div>
        `).join('')}

        <!-- Combo / Forfait packages quick editor -->
        <div class="p-card" style="margin-top:18px;">
          <div class="head">
            <h4>Combos & forfaits · vue rapide</h4>
            <span class="meta">4 PACKAGES · 80 VENTES / 30 J</span>
          </div>
          <div class="s-combo-grid">
            ${PACKAGES.map((p, i) => `
              <div class="s-combo" data-action="svc-pkg-edit" data-arg="${i}">
                <div class="s-combo-tag">${p.tag}</div>
                <b>${p.n}</b>
                <div class="m">${p.dur} · ${fmt(p.p)} MAD</div>
                <div class="s-combo-sales">${p.sales} ventes / 30 j</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Seasonal scheduler -->
        <div class="p-card s-season-card">
          <div class="head">
            <h4>Programmation saisonnière</h4>
            <span class="meta">2 PROGRAMMES ACTIFS</span>
          </div>
          <div class="s-season-grid">
            <div class="s-season">
              <div class="s-season-h"><b>Menu Ramadan</b><span class="chip ok">Actif jusqu'au 9 mai</span></div>
              <p class="s-season-d">Soins plus calmes après ftour · gommage rhassoul + massage 30 min en duo · horaires 21h–01h.</p>
              <button class="kb ghost" style="padding:6px 12px; font-size:12px;" data-action="svc-season-edit">${ICN.edit}Modifier</button>
            </div>
            <div class="s-season">
              <div class="s-season-h"><b>Menu Été · gommage corps boost</b><span class="chip neutral">Programmé · 1 juin</span></div>
              <p class="s-season-d">Promotion gommage corps + enveloppement boue · −15 % avant 12h · push WhatsApp à 9h.</p>
              <button class="kb ghost" style="padding:6px 12px; font-size:12px;" data-action="svc-season-edit">${ICN.edit}Modifier</button>
            </div>
          </div>
        </div>
      `,
      foot: `
        <button class="kb atlas" data-action="svc-new">${ICN.plus}Ajouter un service</button>
      `,
    });

    /* ─ Tab switcher ─ */
    setTimeout(() => {
      r.el.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-svc-tab]');
        if (tab) {
          const k = tab.dataset.svcTab;
          r.el.querySelectorAll('[data-svc-tab]').forEach(t => t.classList.toggle('on', t.dataset.svcTab === k));
          r.el.querySelectorAll('[data-svc-pane]').forEach(p => { p.hidden = (p.dataset.svcPane !== k); });
        }
        if (e.target.closest('[data-dismiss]')) r.close();
        const editRow = e.target.closest('[data-action="svc-edit"]');
        if (editRow) {
          e.stopPropagation();
          openServiceModal(SERVICES[+editRow.dataset.arg], +editRow.dataset.arg);
        }
        const pkgEdit = e.target.closest('[data-action="svc-pkg-edit"]');
        if (pkgEdit) {
          e.stopPropagation();
          openPackageModal(PACKAGES[+pkgEdit.dataset.arg]);
        }
        const cureEdit = e.target.closest('[data-action="svc-cure-edit"]');
        if (cureEdit) {
          e.stopPropagation();
          openPackageModal(CURES[+cureEdit.dataset.arg]);
        }
        if (e.target.closest('[data-action="svc-new"]')) {
          e.stopPropagation();
          openServiceModal(null);
        }
      });
    }, 60);

    /* ─ Service add / edit modal ─ */
    function openServiceModal(svc, idx) {
      const isEdit = !!svc;
      const data = svc || { name: '', cat: 'massage', dur: 60, price: 500, room: 'Salon 1', skill: 'sénior', contras: [], notes: '' };
      const m = modal({
        title: isEdit ? `Modifier · ${data.name}` : 'Nouveau service',
        tag: 'SPA BAHIA',
        desc: 'Tous les champs sont sauvegardés en local. Publication immédiate sur les canaux actifs.',
        body: `
          <div class="kf-group"><label class="kf-label">Nom du service</label><input class="kf-input" id="sv-n" value="${data.name}" placeholder="ex. Massage californien"></div>
          <div class="kf-row">
            <div class="kf-group"><label class="kf-label">Catégorie</label>
              <select class="kf-input" id="sv-c">
                ${TABS.filter(t => t.k !== 'day' && t.k !== 'cure').map(t => `<option value="${t.k}" ${data.cat === t.k ? 'selected' : ''}>${t.n}</option>`).join('')}
              </select>
            </div>
            <div class="kf-group"><label class="kf-label">Durée (min)</label>
              <select class="kf-input" id="sv-d">
                ${[30,45,60,75,90,120].map(d => `<option ${data.dur === d ? 'selected' : ''}>${d}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="kf-row">
            <div class="kf-group"><label class="kf-label">Prix (MAD)</label><input class="kf-input" id="sv-p" type="number" value="${data.price}"></div>
            <div class="kf-group"><label class="kf-label">Salle</label>
              <select class="kf-input" id="sv-r">
                ${['Salon 1','Salon 2','Salon 3','Hammam','Cabine humide','Salon 1+2'].map(rm => `<option ${data.room === rm ? 'selected' : ''}>${rm}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="kf-group"><label class="kf-label">Niveau praticienne</label>
            <div class="s-pick-row">
              ${['junior','sénior','certifié'].map(sk => `<button class="s-pick ${data.skill === sk ? 'on' : ''}" data-pick-skill="${sk}">${sk}</button>`).join('')}
            </div>
          </div>
          <div class="kf-group"><label class="kf-label">Contre-indications (séparées par virgule)</label>
            <input class="kf-input" id="sv-ct" value="${data.contras.join(', ')}" placeholder="ex. Grossesse 1ᵉʳ trim., Hypertension">
          </div>
          <div class="kf-group"><label class="kf-label">Notes praticienne</label>
            <textarea class="kf-input" rows="2" id="sv-nt">${data.notes || ''}</textarea>
          </div>
        `,
        foot: `
          ${isEdit ? '<button class="kb danger" data-action="sv-delete">Supprimer</button>' : ''}
          <button class="kb ghost" data-dismiss>Annuler</button>
          <button class="kb atlas" data-action="sv-save">${isEdit ? 'Enregistrer' : 'Publier le service'}</button>
        `,
        width: 600,
      });
      setTimeout(() => {
        let pickedSkill = data.skill;
        m.el.addEventListener('click', (ev) => {
          const sk = ev.target.closest('[data-pick-skill]');
          if (sk) {
            pickedSkill = sk.dataset.pickSkill;
            m.el.querySelectorAll('[data-pick-skill]').forEach(b => b.classList.toggle('on', b.dataset.pickSkill === pickedSkill));
          }
          if (ev.target.closest('[data-action="sv-save"]')) {
            const name = m.el.querySelector('#sv-n').value || 'Sans titre';
            m.close();
            if (!isEdit) confetti();
            toast(isEdit ? 'Service mis à jour' : 'Service publié', {
              type: 'success',
              desc: `${name} · synchronisé sur tablette · WhatsApp · Booking.com.`,
            });
          }
          if (ev.target.closest('[data-action="sv-delete"]')) {
            modal({
              title: 'Supprimer ce service ?',
              desc: 'Les RDV déjà confirmés sont conservés. Le service sera retiré du catalogue public.',
              foot: `<button class="kb ghost" data-dismiss>Garder</button><button class="kb danger" data-action="sv-delete-confirm">Supprimer</button>`,
              width: 460,
            });
          }
          if (ev.target.closest('[data-action="sv-delete-confirm"]')) {
            document.querySelectorAll('.kiwi-backdrop').forEach(b => b.querySelector('.kiwi-modal-close')?.click());
            toast('Service supprimé', { type: 'warn', desc: 'Retiré du catalogue · 0 RDV impactés.' });
          }
          if (ev.target.closest('[data-dismiss]')) m.close();
        });
      }, 60);
    }

    /* ─ Package edit modal ─ */
    function openPackageModal(pkg) {
      modal({
        title: `Forfait · ${pkg.n}`,
        tag: 'COMBO',
        desc: pkg.desc,
        body: `
          <div class="s-rec-line"><span>Durée totale</span><b>${pkg.dur}</b></div>
          <div class="s-rec-line"><span>Prix forfait</span><b>${fmt(pkg.p)} MAD</b></div>
          <div class="s-rec-line"><span>Économie cliente</span><b style="color:var(--atlas);">−180 MAD vs à la carte</b></div>
          <div class="s-rec-line"><span>Ventes 30 j</span><b>${pkg.sales}</b></div>
          <div class="s-rec-line"><span>Annulation</span><b>72h avant · sans frais</b></div>
        `,
        foot: `<button class="kb ghost" data-dismiss>Fermer</button><button class="kb atlas" data-action="pkg-edit-go">${ICN.edit}Modifier le contenu</button>`,
        width: 540,
      });
    }
  };

  /* ─── Aux handlers used inside the services drawer ─── */
  handlers['svc-export']      = () => toast('Catalogue exporté', { type: 'success', desc: 'PDF tarifaire prêt à imprimer + flux Booking.com mis à jour.' });
  handlers['svc-season']      = () => toast('Programmation saisonnière', { type: 'info', desc: 'Définissez Ramadan, été, fêtes, Kiwi switch automatiquement.' });
  handlers['svc-season-edit'] = () => toast('Édition programme', { type: 'info', desc: 'Ajustez horaires, services actifs, promotions.' });
  handlers['svc-ai-action']   = () => {
    confetti();
    toast('Argan Deluxe créé', { type: 'success', desc: 'Brouillon ajouté · prêt à publier après validation prix.' });
  };
  handlers['pkg-edit-go']     = () => toast('Édition forfait', { type: 'info', desc: 'Composition modifiable séance par séance.' });

})();

