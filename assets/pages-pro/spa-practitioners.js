/* ═══ Section 2 spa · practitioners ═══ */
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Spa Bahia · Praticien·ne·s handler (sidebar)
 * Mindbody / Booksy-tier polish — staff cards, commission calc, certs.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  const Kiwi = window.Kiwi || {};
  const handlers = Kiwi.handlers;
  if (!handlers) return;
  const { toast, modal, drawer } = Kiwi;

  /* ─── Inject scoped styles (idempotent) ─── */
  if (!document.getElementById('kiwi-spa-prac-css')) {
    const style = document.createElement('style');
    style.id = 'kiwi-spa-prac-css';
    style.textContent = `
    .pr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 820px) { .pr-grid { grid-template-columns: 1fr; } }
    .pr-card { background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 16px; padding: 18px; transition: border-color 160ms; }
    html[data-theme="dark"] .pr-card { background: var(--paper-muted); }
    .pr-card:hover { border-color: var(--atlas); }
    .pr-card .top { display: grid; grid-template-columns: 80px 1fr auto; gap: 14px; align-items: flex-start; margin-bottom: 12px; }
    .pr-blob { width: 80px; height: 80px; border-radius: 22px; display: flex; align-items: center; justify-content: center; color: var(--paper); font-weight: 600; font-size: 26px; letter-spacing: -0.04em; position: relative; overflow: hidden; }
    .pr-blob::after { content: ""; position: absolute; inset: 0; background: radial-gradient(circle at 28% 20%, rgba(255,255,255,0.28), transparent 55%); border-radius: 22px; }
    .pr-blob.a { background: linear-gradient(135deg, var(--atlas), var(--brand-deep)); }
    .pr-blob.b { background: linear-gradient(135deg, #D99A2B, #8A6210); }
    .pr-blob.c { background: linear-gradient(135deg, var(--atlas-700, #054C36), var(--atlas)); }
    .pr-card .nm { font-weight: 600; font-size: 16px; letter-spacing: -0.015em; }
    .pr-card .rl { font-size: 12px; color: var(--n-500); margin-top: 3px; line-height: 1.4; }
    .pr-badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-family: var(--mono); letter-spacing: 0.06em; font-weight: 600; }
    .pr-badge.sr { background: var(--mint-soft); color: var(--riad); }
    .pr-badge.cf { background: rgba(217,154,43,0.16); color: var(--warn-ink); }
    .pr-badge.jr { background: rgba(11,110,79,0.1); color: var(--atlas); }
    .pr-bio { font-size: 12.5px; color: var(--n-600); line-height: 1.5; margin: 4px 0 12px; }
    .pr-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px; }
    .pr-chip { font-size: 11px; padding: 3px 9px; border-radius: 999px; background: var(--surface); border: 1px solid var(--n-200); color: var(--n-700); font-weight: 500; }
    html[data-theme="dark"] .pr-chip { background: var(--inverse-surface); }
    .pr-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 12px 0; border-top: 1px solid var(--n-200); border-bottom: 1px solid var(--n-200); margin-bottom: 12px; }
    .pr-kpis .k { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--n-500); font-family: var(--mono); }
    .pr-kpis .v { font-family: var(--mono); font-weight: 600; font-size: 14px; margin-top: 3px; letter-spacing: -0.01em; font-feature-settings: "tnum" 1; }
    .pr-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin-bottom: 12px; }
    .pr-day { aspect-ratio: 1; border-radius: 6px; background: var(--n-100); display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: var(--mono); font-size: 11px; color: var(--n-500); }
    .pr-day.busy { background: var(--mint-soft); color: var(--riad); }
    .pr-day.full { background: var(--atlas); color: var(--mint); }
    .pr-day.off { background: transparent; border: 1px dashed var(--n-200); }
    .pr-day .d { font-weight: 600; font-size: 11px; }
    .pr-day .h { font-size: 11px; opacity: 0.85; margin-top: 1px; }
    .pr-actions { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
    .pr-actions .kb { padding: 8px 10px; font-size: 11.5px; justify-content: center; }
    .pr-cert { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--n-200); font-size: 12.5px; }
    .pr-cert:last-child { border-bottom: 0; }
    .pr-cert .n { font-weight: 500; }
    .pr-cert .m { font-size: 11px; color: var(--n-500); margin-top: 2px; font-family: var(--mono); letter-spacing: 0.04em; }
    .pr-cert-stat { font-size: 11px; padding: 3px 9px; border-radius: 999px; font-family: var(--mono); font-weight: 600; letter-spacing: 0.04em; }
    .pr-cert-stat.ok { background: color-mix(in srgb, var(--atlas) 14%, var(--surface)); color: var(--atlas); }
    .pr-cert-stat.warn { background: var(--warn-soft); color: var(--warn-ink); }
    .pr-cert-stat.exp { background: color-mix(in srgb, var(--danger) 14%, var(--surface)); color: var(--danger); }
    .pr-calc-out { background: linear-gradient(135deg, var(--atlas), var(--brand-deep)); color: var(--inverse-ink); border-radius: 14px; padding: 18px; margin-top: 14px; }
    .pr-calc-out .l { font-size: 11px; font-family: var(--mono); letter-spacing: 0.1em; color: var(--mint); text-transform: uppercase; }
    .pr-calc-out .v { font-size: 32px; font-weight: 600; letter-spacing: -0.025em; margin-top: 4px; font-feature-settings: "tnum" 1; }
    .pr-calc-out .br { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(125,242,176,0.18); font-size: 12px; }
    .pr-calc-out .br span { color: #c6ead4; font-family: var(--mono); }
    .pr-calc-out .br b { color: var(--inverse-ink); font-family: var(--mono); font-weight: 600; }
    `;
    document.head.appendChild(style);
  }

  /* ─── Practitioner data (Spa Bahia, Hivernage) ─── */
  const PRACS = [
    {
      id: 'NH', cls: 'a', name: 'Nour El Hassan', role: 'Esthéticienne sénior · 8 ans',
      badge: ['sr', 'sénior'],
      bio: 'Référente visage anti-âge et soins thérapeutiques. Formatrice interne pour les nouvelles arrivantes.',
      specialties: ['Visage anti-âge', 'Massages thérapeutiques', 'Drainage lymphatique', 'Soins haute technologie'],
      certs: [
        { n: 'CIDESCO Suisse · diplôme international', d: 'Renouvelée 2024', s: 'ok', sl: 'À jour' },
        { n: 'École de massage thérapeutique · Marrakech', d: 'Obtenue 2018', s: 'ok', sl: 'À jour' },
        { n: 'RNCP niveau 5 · esthétique avancée', d: 'Renouv. déc. 2026', s: 'warn', sl: 'Bientôt' },
      ],
      commission: 25, rdv: 84, revenue: 38600, nps: 92, retention: 78,
      week: ['busy', 'full', 'busy', 'full', 'full', 'off', 'off'],
      hours: ['10', '8', '9', '8', '8', '·', '·'],
    },
    {
      id: 'SB', cls: 'b', name: 'Salma Benkirane', role: 'Esthéticienne certifiée · 5 ans',
      badge: ['cf', 'certifiée'],
      bio: 'Spécialisée en soins de relaxation et rituels corps. Très demandée sur les forfaits couples.',
      specialties: ['Massages relaxants', 'Gommages corps', 'Rituel marocain', 'Massage pierres chaudes'],
      certs: [
        { n: 'CIDESCO Suisse · diplôme international', d: 'Obtenue 2021', s: 'ok', sl: 'À jour' },
        { n: 'Certification massage californien · Casablanca', d: 'Obtenue 2022', s: 'ok', sl: 'À jour' },
        { n: 'Recyclage hygiène & protocoles HACCP', d: 'Renouv. juin 2026', s: 'warn', sl: 'Bientôt' },
      ],
      commission: 22, rdv: 72, revenue: 28200, nps: 88, retention: 71,
      week: ['busy', 'busy', 'full', 'busy', 'busy', 'full', 'off'],
      hours: ['7', '7', '9', '8', '7', '9', '·'],
    },
    {
      id: 'YB', cls: 'c', name: 'Yasmine Bouchikhi', role: 'Praticienne junior · 2 ans',
      badge: ['jr', 'junior'],
      bio: 'Hammam traditionnel et modelages détente. En cours de certification CIDESCO pour passage certifiée.',
      specialties: ['Hammam traditionnel', 'Modelages pieds', 'Gommage savon noir', 'Réflexologie plantaire'],
      certs: [
        { n: 'École hammam Marrakech · diplôme', d: 'Obtenue 2023', s: 'ok', sl: 'À jour' },
        { n: 'CIDESCO niveau 1 · en formation', d: 'Examen oct. 2026', s: 'warn', sl: 'En cours' },
        { n: 'Recyclage premiers secours SST', d: 'Expirée fév. 2026', s: 'exp', sl: 'Renouveler' },
      ],
      commission: 18, rdv: 56, revenue: 18400, nps: 84, retention: 62,
      week: ['off', 'busy', 'busy', 'full', 'busy', 'full', 'busy'],
      hours: ['·', '7', '7', '8', '7', '8', '6'],
    },
  ];

  const fmt = (n) => (window.KiwiNumber?.format(n, {}) ?? n.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {}));
  const dows = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  function renderCard(p) {
    const [bcls, blbl] = p.badge;
    return `
      <div class="pr-card" data-prac="${p.id}">
        <div class="top">
          <div class="pr-blob ${p.cls}">${p.id}</div>
          <div>
            <div class="nm">${p.name}</div>
            <div class="rl">${p.role}</div>
            <div class="pr-bio">${p.bio}</div>
          </div>
          <div class="pr-badge ${bcls}">${blbl}</div>
        </div>

        <div class="pr-chips">
          ${p.specialties.map(s => `<span class="pr-chip">${s}</span>`).join('')}
        </div>

        <div class="pr-kpis">
          <div><div class="k">RDV mois</div><div class="v">${p.rdv}</div></div>
          <div><div class="k">Revenu</div><div class="v">${fmt(p.revenue)}</div></div>
          <div><div class="k">NPS</div><div class="v">${p.nps}</div></div>
          <div><div class="k">Rétention</div><div class="v">${p.retention} %</div></div>
        </div>

        <div class="pr-week">
          ${p.week.map((s, i) => `
            <div class="pr-day ${s}"><div class="d">${dows[i]}</div><div class="h">${p.hours[i] === '·' ? 'off' : p.hours[i] + 'h'}</div></div>
          `).join('')}
        </div>

        <div class="pr-actions">
          <button class="kb ghost" data-action="prac-agenda" data-prac="${p.id}">Agenda</button>
          <button data-activation=write class="kb ghost" data-action="prac-edit" data-prac="${p.id}">Modifier</button>
          <button class="kb atlas" data-action="prac-commission" data-prac="${p.id}">Commission</button>
        </div>
      </div>
    `;
  }

  /* ─── Main drawer ─── */
  handlers['nav-practitioners'] = () => {
    const totalRdv = PRACS.reduce((s, p) => s + p.rdv, 0);
    const totalRev = PRACS.reduce((s, p) => s + p.revenue, 0);
    const avgNps = Math.round(PRACS.reduce((s, p) => s + p.nps, 0) / PRACS.length);
    const totalCerts = PRACS.reduce((s, p) => s + p.certs.length, 0);
    const expiring = PRACS.reduce((s, p) => s + p.certs.filter(c => c.s !== 'ok').length, 0);

    window.Kiwi.appPage('practitioners', {
      title: 'Praticien·ne·s · Spa Bahia',
      subtitle: '3 actives · Hivernage, Marrakech · planning T+1',
      body: `
        <div class="p-hero">
          <div class="l">PERFORMANCE ÉQUIPE · AVRIL</div>
          <div class="big">${fmt(totalRev)} <span style="font-size:18px; opacity:0.7;">MAD</span></div>
          <div class="sub">${totalRdv} RDV cumulés · NPS moyen ${avgNps} · panier moyen ${fmt(Math.round(totalRev / totalRdv))} MAD · 3 praticiennes en service</div>
        </div>

        <div class="p-toolbar">
          <div class="p-search">Rechercher par nom, certification, spécialité…</div>
          <button class="kb ghost" data-action="prac-tracker">Certifications (${expiring}/${totalCerts} à suivre)</button>
          <button data-activation=write class="kb primary" data-action="prac-add">Ajouter une praticienne</button>
        </div>

        <div class="pr-grid">
          ${PRACS.map(renderCard).join('')}
          <div class="pr-card" style="display:flex; align-items:center; justify-content:center; flex-direction:column; gap:10px; border-style:dashed; cursor:pointer; min-height:300px;" data-action="prac-add">
            <div class="pr-blob" style="background: var(--paper); border: 1.5px dashed var(--n-300); color: var(--n-500);">+</div>
            <div style="font-weight:600; font-size:14px; letter-spacing:-0.01em;">Recruter une nouvelle praticienne</div>
            <div style="font-size:11.5px; color:var(--n-500); text-align:center; max-width:220px; line-height:1.45;">Wizard guidé · profil, certifications, planning et commission en 4 étapes.</div>
          </div>
        </div>
      `,
    });

    // Wire card-level actions inside this page
    const root = document.querySelector('.dash-genpage');
    if (!root) return;
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      const id = btn.dataset.prac;
      if (a === 'prac-agenda') openAgenda(id);
      else if (a === 'prac-edit') openEdit(id);
      else if (a === 'prac-commission') openCommission(id);
      else if (a === 'prac-tracker') openTracker();
      else if (a === 'prac-add') openAddWizard();
      else if (a === 'prac-remove') confirmRemove(id);
    });
  };

  /* ─── Helpers ─── */
  const getPrac = (id) => PRACS.find(p => p.id === id) || PRACS[0];

  function openAgenda(id) {
    const p = getPrac(id);
    drawer({
      title: `Agenda · ${p.name}`,
      subtitle: `${p.rdv} RDV ce mois · ${fmt(p.revenue)} MAD`,
      width: 520,
      body: `
        <div class="p-card">
          <div class="head"><h4>Aujourd'hui</h4><span class="meta">29 AVR · 8 RDV</span></div>
          ${[
            ['09:30', 'Soin visage anti-âge · Mme. Tazi', '60 min · 750 MAD'],
            ['11:00', 'Massage thérapeutique · M. Chraibi', '90 min · 950 MAD'],
            ['13:00', 'Pause déjeuner', '60 min'],
            ['14:30', 'Drainage lymphatique · Mme. Bennani', '60 min · 700 MAD'],
            ['16:00', 'Rituel hammam premium · couple Idrissi', '120 min · 1 800 MAD'],
            ['18:30', 'Soin éclat express · Mme. Fassi', '45 min · 550 MAD'],
          ].map(([t, n, m]) => `
            <div class="resv-line"><div class="t">${t}</div><div class="info"><div class="n">${n}</div><div class="m">${m}</div></div><div><span class="chip ok">confirmé</span></div></div>
          `).join('')}
        </div>
        <button data-activation=money class="kb ghost" style="width:100%; justify-content:center; margin-top:10px;" onclick="window.Kiwi.toast('Export ICS envoyé', { desc: 'Agenda 7 jours synchronisé sur Google Calendar.', type: 'success' })">Exporter en .ics</button>
      `,
    });
  }

  function openEdit(id) {
    const p = getPrac(id);
    modal({
      tag: 'PROFIL PRATICIEN·NE',
      title: `Modifier · ${p.name}`,
      desc: 'Mise à jour des spécialités, taux de commission et planning de référence.',
      width: 560,
      body: `
        <div class="kf-group"><label class="kf-label">Nom complet</label><input class="kf-input" value="${p.name}"/></div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Rôle</label><input class="kf-input" value="${p.role}"/></div>
          <div class="kf-group"><label class="kf-label">Commission (%)</label><input class="kf-input" type="number" value="${p.commission}"/></div>
        </div>
        <div class="kf-group"><label class="kf-label">Spécialités (séparées par virgules)</label><input class="kf-input" value="${p.specialties.join(', ')}"/></div>
        <div class="kf-group"><label class="kf-label">Bio courte</label><textarea class="kf-input" rows="3">${p.bio}</textarea></div>
        <div class="kf-help">Les changements de commission s'appliquent au prochain cycle de paie (T+1 du mois).</div>
      `,
      foot: `
        <button data-activation=write class="kb ghost" data-action="prac-remove" data-prac="${p.id}">Désactiver le profil</button>
        <div style="flex:1;"></div>
        <button class="kb ghost" onclick="this.closest('.kiwi-backdrop').classList.remove('in'); setTimeout(()=>this.closest('.kiwi-backdrop')?.remove(), 280)">Annuler</button>
        <button data-activation=write class="kb primary" onclick="window.Kiwi.toast('Profil mis à jour', { desc: '${p.name} · changements actifs sur le planning T+1.', type: 'success' }); this.closest('.kiwi-backdrop').classList.remove('in'); setTimeout(()=>this.closest('.kiwi-backdrop')?.remove(), 280)">Enregistrer</button>
      `,
    });
  }

  function confirmRemove(id) {
    const p = getPrac(id);
    modal({
      tag: 'CONFIRMATION',
      title: `Désactiver ${p.name} ?`,
      desc: 'Le profil sera retiré du planning public mais conservé pour l\'historique paie et CNSS. Les RDV à venir seront réassignés.',
      width: 460,
      body: `
        <div style="background: color-mix(in srgb, var(--danger) 14%, var(--surface)); color: var(--danger); padding: 12px 14px; border-radius: 10px; font-size: 12.5px; line-height: 1.5;">
          ${p.rdv > 0 ? `<b>${p.rdv} RDV ce mois</b> et 12 RDV à venir devront être réattribués manuellement.` : 'Aucun RDV en cours.'}
        </div>
      `,
      foot: `
        <button class="kb ghost" onclick="this.closest('.kiwi-backdrop').classList.remove('in'); setTimeout(()=>this.closest('.kiwi-backdrop')?.remove(), 280)">Annuler</button>
        <button data-activation=write class="kb danger" onclick="window.Kiwi.toast('Profil désactivé', { desc: '${p.name} · 12 RDV en attente de réassignation.', type: 'warn' }); document.querySelectorAll('.kiwi-backdrop').forEach(b=>{b.classList.remove('in'); setTimeout(()=>b.remove(), 280)})">Désactiver</button>
      `,
    });
  }

  /* ─── Commission calculator ─── */
  function openCommission(presetId) {
    const opts = PRACS.map(p => `<option value="${p.id}" ${p.id === presetId ? 'selected' : ''}>${p.name} · ${p.commission}%</option>`).join('');
    modal({
      tag: 'CALCUL DE COMMISSION',
      title: 'Commission praticien·ne',
      desc: 'Saisissez le nombre de prestations et le panier moyen pour visualiser la commission nette CNSS.',
      width: 540,
      body: `
        <div class="kf-group"><label class="kf-label">Praticienne</label>
          <select class="kf-input" id="pr-calc-who">${opts}</select>
        </div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Nombre de prestations</label><input class="kf-input" id="pr-calc-n" type="number" value="60"/></div>
          <div class="kf-group"><label class="kf-label">Panier moyen (MAD)</label><input class="kf-input" id="pr-calc-avg" type="number" value="450"/></div>
        </div>
        <div class="pr-calc-out" id="pr-calc-out">
          <div class="l">COMMISSION NETTE · APRÈS CNSS</div>
          <div class="v" id="pr-calc-v">·MAD</div>
          <div class="br">
            <div><span>CA brut généré</span><br><b id="pr-calc-gross">·MAD</b></div>
            <div><span>Commission brute</span><br><b id="pr-calc-com">·MAD</b></div>
            <div><span>CNSS (4,48%)</span><br><b id="pr-calc-cnss">·MAD</b></div>
            <div><span>Taux appliqué</span><br><b id="pr-calc-rate">·%</b></div>
          </div>
        </div>
      `,
      foot: `
        <button class="kb ghost" onclick="this.closest('.kiwi-backdrop').classList.remove('in'); setTimeout(()=>this.closest('.kiwi-backdrop')?.remove(), 280)">Fermer</button>
        <button data-activation=money class="kb primary" id="pr-calc-export">Exporter fiche paie</button>
      `,
    });

    const recompute = () => {
      const id = document.getElementById('pr-calc-who').value;
      const p = getPrac(id);
      const n = +document.getElementById('pr-calc-n').value || 0;
      const avg = +document.getElementById('pr-calc-avg').value || 0;
      const gross = n * avg;
      const com = Math.round(gross * (p.commission / 100));
      const cnss = Math.round(com * 0.0448);
      const net = com - cnss;
      document.getElementById('pr-calc-v').textContent = fmt(net) + ' MAD';
      document.getElementById('pr-calc-gross').textContent = fmt(gross) + ' MAD';
      document.getElementById('pr-calc-com').textContent = fmt(com) + ' MAD';
      document.getElementById('pr-calc-cnss').textContent = '− ' + fmt(cnss) + ' MAD';
      document.getElementById('pr-calc-rate').textContent = p.commission + '%';
    };
    setTimeout(() => {
      ['pr-calc-who', 'pr-calc-n', 'pr-calc-avg'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', recompute);
      });
      recompute();
      const exp = document.getElementById('pr-calc-export');
      if (exp) exp.onclick = () => {
        toast('Fiche paie générée', { desc: 'PDF prêt pour validation comptable · synchronisée avec le module CNSS.', type: 'success' });
      };
    }, 50);
  }

  /* ─── Certification tracker ─── */
  function openTracker() {
    drawer({
      title: 'Certifications & formations',
      subtitle: 'Suivi renouvellement par praticienne · alerte 90 jours',
      width: 560,
      body: `
        ${PRACS.map(p => `
          <div class="p-card">
            <div class="head">
              <h4>${p.name}</h4>
              <span class="meta">${p.certs.length} CERTIFICATIONS</span>
            </div>
            ${p.certs.map(c => `
              <div class="pr-cert">
                <div><div class="n">${c.n}</div><div class="m">${c.d}</div></div>
                <span class="pr-cert-stat ${c.s}">${c.sl}</span>
                <button class="kb ghost" style="padding:6px 10px; font-size:11px;" onclick="window.Kiwi.toast('Rappel programmé', { desc: 'Notification envoyée 30 jours avant expiration.', type: 'info' })">Rappel</button>
              </div>
            `).join('')}
          </div>
        `).join('')}
        <button data-activation=money class="kb atlas" style="width:100%; justify-content:center; margin-top:10px;" onclick="window.Kiwi.toast('Export RH · bientôt', { desc: 'La synthèse RH sera exportable quand la paie sera branchée sur vos heures réelles.', type: 'pend' })">Exporter le tableau de bord RH</button>
      `,
    });
  }

  /* ─── Add practitioner wizard ─── */
  function openAddWizard(step = 1) {
    const total = 4;
    const steps = ['Identité', 'Spécialités', 'Certifications', 'Commission & planning'];
    const bodies = {
      1: `
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Prénom</label><input class="kf-input" placeholder="Imane"/></div>
          <div class="kf-group"><label class="kf-label">Nom</label><input class="kf-input" placeholder="Alaoui"/></div>
        </div>
        <div class="kf-group"><label class="kf-label">Email pro</label><input class="kf-input" type="email" placeholder="praticien@spabahia.ma"/></div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">CIN</label><input class="kf-input" placeholder="BE123456"/></div>
          <div class="kf-group"><label class="kf-label">CNSS</label><input class="kf-input" placeholder="999 999 999"/></div>
        </div>
      `,
      2: `
        <div class="kf-help" style="margin-bottom:10px;">Cochez les spécialités. Affecte le routage automatique des RDV en ligne.</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          ${['Visage anti-âge', 'Massage suédois', 'Massage californien', 'Drainage lymphatique', 'Hammam traditionnel', 'Gommage savon noir', 'Réflexologie', 'Soins haute technologie', 'Modelages corps', 'Rituel marocain'].map(s => `
            <label style="display:flex; align-items:center; gap:8px; padding:9px 12px; border:1px solid var(--n-200); border-radius:10px; font-size:13px; cursor:pointer;"><input type="checkbox"/> ${s}</label>
          `).join('')}
        </div>
      `,
      3: `
        <div class="kf-help" style="margin-bottom:10px;">Ajoutez les certifications principales. Le tracker enverra une alerte 90 jours avant expiration.</div>
        <div class="kf-group"><label class="kf-label">Certification principale</label>
          <select class="kf-input"><option>CIDESCO Suisse</option><option>RNCP niveau 5 esthétique</option><option>École hammam Marrakech</option><option>Certification massage thérapeutique</option><option>Autre</option></select>
        </div>
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Date d'obtention</label><input class="kf-input" type="date"/></div>
          <div class="kf-group"><label class="kf-label">Date de renouvellement</label><input class="kf-input" type="date"/></div>
        </div>
        <button data-activation=write class="kb ghost" style="font-size:12px; padding:8px 14px;">+ Ajouter une certification</button>
      `,
      4: `
        <div class="kf-row">
          <div class="kf-group"><label class="kf-label">Taux de commission (%)</label><input class="kf-input" type="number" value="20"/></div>
          <div class="kf-group"><label class="kf-label">Date d'embauche</label><input class="kf-input" type="date"/></div>
        </div>
        <div class="kf-group"><label class="kf-label">Planning de référence</label>
          <div style="display:grid; grid-template-columns: repeat(7,1fr); gap:6px;">
            ${dows.map(d => `<label style="text-align:center; padding:8px 4px; border:1px solid var(--n-200); border-radius:8px; font-size:11px; font-family:var(--mono); cursor:pointer;"><div style="font-weight:600;">${d}</div><input type="checkbox" style="margin-top:4px;"/></label>`).join('')}
          </div>
        </div>
        <div class="kf-help">La praticienne recevra ses identifiants par email pour accéder à son agenda mobile.</div>
      `,
    };
    modal({
      tag: `ÉTAPE ${step} / ${total} · ${steps[step - 1].toUpperCase()}`,
      title: 'Ajouter une praticienne',
      desc: 'Configuration complète en 4 étapes · profil actif sous 2 minutes.',
      width: 560,
      body: `
        <div class="wiz-steps">
          ${[1, 2, 3, 4].map(i => `<div class="wiz-step ${i < step ? 'done' : i === step ? 'active' : ''}"></div>`).join('')}
        </div>
        ${bodies[step]}
      `,
      foot: `
        ${step > 1 ? `<button class="kb ghost" id="wiz-back">Retour</button>` : `<button class="kb ghost" onclick="this.closest('.kiwi-backdrop').classList.remove('in'); setTimeout(()=>this.closest('.kiwi-backdrop')?.remove(), 280)">Annuler</button>`}
        <div style="flex:1;"></div>
        <button data-activation=write class="kb primary" id="wiz-next">${step === total ? 'Activer le profil' : 'Continuer'}</button>
      `,
    });
    setTimeout(() => {
      const next = document.getElementById('wiz-next');
      const back = document.getElementById('wiz-back');
      if (next) next.onclick = () => {
        document.querySelectorAll('.kiwi-backdrop').forEach(b => { b.classList.remove('in'); setTimeout(() => b.remove(), 280); });
        if (step === total) {
          toast('Praticienne ajoutée', { desc: 'Profil actif · email d\'invitation envoyé. Premier RDV planifiable dès demain.', type: 'success' });
          if (Kiwi.confetti) Kiwi.confetti();
        } else {
          setTimeout(() => openAddWizard(step + 1), 120);
        }
      };
      if (back) back.onclick = () => {
        document.querySelectorAll('.kiwi-backdrop').forEach(b => { b.classList.remove('in'); setTimeout(() => b.remove(), 280); });
        setTimeout(() => openAddWizard(step - 1), 120);
      };
    }, 50);
  }

  /* ─── Auxiliary handlers (callable via [data-action] elsewhere) ─── */
  handlers['practitioner-edit'] = () => openEdit('NH');
  handlers['practitioner-commission'] = () => openCommission('NH');
  handlers['practitioner-tracker'] = () => openTracker();
  handlers['practitioner-add'] = () => openAddWizard(1);
})();
