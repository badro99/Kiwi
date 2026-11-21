/* Accueil du tableau de bord · « Meilleurs vendeurs » : le classement des
 * vendeurs sur la période choisie en haut de l'accueil (Aujourd'hui, Hier,
 * 7 jours…), par ventes encaissées, remboursements déduits, avec la commission
 * de chacun. Un podium pour les trois premiers, les suivants en lignes.
 *
 * Les chiffres viennent de /api/commissions (le même calcul que l'onglet
 * Équipe › Commissions et la clôture de caisse). Rien n'est inventé : sans
 * vente attribuée, la carte le dit.
 *
 * Seulement quand le commerce a l'option « Commissions vendeurs »
 * (features.sellerCommissions, kiwi-admin) ET que le tableau de bord tourne sur
 * le kit 2027 (data-skin-2027="dashboard"), pour le propriétaire (la route est
 * réservée au palier owner). Sinon la carte n'existe pas. */

export function topSellersOn(doc = globalThis.document, cfg = globalThis.window?.KiwiConfig, role = globalThis.window?.__kiwiRole) {
  try {
    return cfg?.features?.sellerCommissions === true
      && doc?.documentElement?.getAttribute('data-skin-2027') === 'dashboard'
      && (!role || role === 'owner');
  } catch (_) { return false; }
}

const STR = {
  fr: { title: 'Meilleurs vendeurs', due: (amt) => `${amt} de commissions`, open: 'Commissions →',
    tickets: (n) => `${n} ticket${n > 1 ? 's' : ''}`, commission: (amt) => `commission ${amt}`, noRate: 'taux à définir',
    loose: (n, amt) => `${n} ticket${n > 1 ? 's' : ''} · ${amt} sans vendeur`, top: 'En tête',
    empty: 'Aucune vente attribuée sur cette période. Chaque vente se range ici sous le nom de qui l’a faite.',
    today: 'Aujourd’hui', yesterday: 'Hier', span: (a, b) => `du ${a} au ${b}` },
  en: { title: 'Top sellers', due: (amt) => `${amt} in commissions`, open: 'Commissions →',
    tickets: (n) => `${n} ticket${n > 1 ? 's' : ''}`, commission: (amt) => `commission ${amt}`, noRate: 'no rate yet',
    loose: (n, amt) => `${n} ticket${n > 1 ? 's' : ''} · ${amt} with no seller`, top: 'Leading',
    empty: 'No attributed sales in this period. Each sale lands here under the name of whoever made it.',
    today: 'Today', yesterday: 'Yesterday', span: (a, b) => `${a} to ${b}` },
  ar: { title: 'أفضل البائعين', due: (amt) => `${amt} عمولات`, open: 'العمولات ←',
    tickets: (n) => `${n} ${n > 1 ? 'تذاكر' : 'تذكرة'}`, commission: (amt) => `عمولة ${amt}`, noRate: 'النسبة غير محدّدة',
    loose: (n, amt) => `${n} ${n > 1 ? 'تذاكر' : 'تذكرة'} · ${amt} بلا بائع`, top: 'في الصدارة',
    empty: 'لا مبيعات منسوبة لأحد في هذه الفترة. كل بيعة تظهر هنا باسم من باعها.',
    today: 'اليوم', yesterday: 'أمس', span: (a, b) => `من ${a} إلى ${b}` },
};

const CSS = `
.tsl-card[hidden]{display:none}
.tsl-podium{list-style:none;margin:14px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.tsl-p{position:relative;padding:16px 16px 14px;border:1px solid var(--n-200);border-radius:14px;background:var(--paper-soft);min-width:0}
.tsl-p.is-1{border-color:var(--atlas);background:var(--surface,var(--paper-soft))}
.tsl-rank{position:absolute;inset-inline-end:14px;top:12px;font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:var(--n-500)}
.tsl-av{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:var(--n-400);color:var(--paper,#F7F5F0);font-weight:600;font-size:12.5px}
.tsl-p.is-1 .tsl-av{background:var(--atlas)}.tsl-p.is-2 .tsl-av{background:var(--riad,#053B2C)}
html[data-theme="dark"] .tsl-p.is-2 .tsl-av{background:color-mix(in srgb,var(--atlas) 55%,var(--n-400))}
.tsl-name{margin-top:10px;display:flex;align-items:center;gap:6px;font-weight:600;font-size:13.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tsl-chip{flex:none;font-size:10px;font-weight:500;padding:2px 7px;border-radius:999px;background:var(--mint-soft,rgba(11,110,79,.08));color:var(--atlas)}
.tsl-net{margin-top:6px;font-size:24px;font-weight:500;letter-spacing:-.03em;line-height:1.05;color:var(--ink);font-variant-numeric:tabular-nums}
.tsl-net small{font-size:11px;letter-spacing:0;color:var(--n-500);margin-inline-start:3px}
.tsl-meta{margin-top:4px;font-size:11.5px;color:var(--n-500);font-variant-numeric:tabular-nums}
.tsl-meta b{color:var(--atlas);font-weight:600}
.tsl-bar{margin-top:10px;height:4px;border-radius:999px;background:var(--n-200);overflow:hidden}
.tsl-bar i{display:block;height:100%;border-radius:inherit;background:var(--atlas);transform-origin:0 50%;animation:tsl-grow .62s cubic-bezier(.34,1.45,.5,1) both}
[dir="rtl"] .tsl-bar i{transform-origin:100% 50%}
@keyframes tsl-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.tsl-bar i{animation:none}}
.tsl-rest{list-style:none;margin:10px 0 0;padding:0}
.tsl-row{display:grid;grid-template-columns:22px 30px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 2px;border-bottom:1px solid var(--n-200);font-size:13px}
.tsl-row:last-child{border-bottom:0}
.tsl-row .tsl-rank{position:static;text-align:center}
.tsl-row .tsl-av{width:30px;height:30px;font-size:11px}
.tsl-row .n{font-weight:500;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tsl-row .v{font-variant-numeric:tabular-nums;color:var(--ink);text-align:end}
.tsl-row .v span{display:block;font-size:11px;color:var(--n-500)}
.tsl-foot{margin-top:12px;font-size:12px;color:var(--n-500)}
.tsl-empty{margin:14px 0 2px;padding:14px 16px;border-radius:12px;background:var(--paper-soft);font-size:13px;line-height:1.5;color:var(--n-600,var(--n-500))}
@media (max-width:760px){.tsl-podium{grid-template-columns:1fr}.tsl-p{display:grid;grid-template-columns:36px minmax(0,1fr) auto;column-gap:12px;align-items:center}
  .tsl-p .tsl-name{margin:0}.tsl-p .tsl-net{grid-column:3;grid-row:1 / span 2;margin:0;font-size:19px;text-align:end}.tsl-p .tsl-meta{grid-column:2;margin:0}
  .tsl-p .tsl-av{grid-row:1 / span 2}.tsl-p .tsl-bar{grid-column:1 / -1}.tsl-p .tsl-rank{display:none}}`;

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initialsOf = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const frDay = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

/* Les journées d'activité de la période choisie sur l'accueil. Une borne au
   début d'une journée (minuit ou la coupure de 5 h) tombe dans cette journée ;
   la fin, exclusive, retombe dans la veille. */
export function periodDays(DR, now = Date.now()) {
  try {
    const range = DR.getDateRange();
    const one = DR.selectedBusinessDay && DR.selectedBusinessDay(range);
    if (one) return { from: one, to: one };
    const b = DR.bounds(range);
    if (!Array.isArray(b) || !(b[1] > b[0])) return null;
    const from = isoLocal(b[0] + 3600000), to = isoLocal(Math.min(b[1], now + 86400000) - 1 - 5 * 3600000);
    return from <= to ? { from, to } : { from, to: from };
  } catch (_) { return null; }
}

/* Le classement : les vendeurs qui ont vendu, du plus au moins encaissé. */
export function rankSellers(data) {
  const rows = (data && Array.isArray(data.sellers) ? data.sellers : [])
    .filter((s) => s && (Number(s.tickets) > 0 || Number(s.netCents) > 0))
    .map((s) => ({ name: String(s.name || ''), tickets: Number(s.tickets) || 0, netCents: Number(s.netCents) || 0, commissionCents: s.commissionCents == null ? null : Number(s.commissionCents) || 0 }))
    .sort((a, b) => b.netCents - a.netCents || a.name.localeCompare(b.name, 'fr'));
  const loose = (data && data.unattributed) || {};
  return {
    rows,
    dueCents: rows.reduce((n, r) => n + (r.commissionCents || 0), 0),
    loose: { tickets: Number(loose.tickets) || 0, netCents: Math.max(0, Number(loose.netCents) || 0) },
  };
}

export function topSellersHtml(data, { lang = 'fr', money, period } = {}) {
  const t = STR[lang] || STR.fr;
  const m = money || ((c) => (Math.round(c) / 100).toFixed(2) + ' MAD');
  const r = rankSellers(data);
  const top = r.rows.length ? Math.max(1, r.rows[0].netCents) : 1;
  const head = `<div class="block-head"><div><div class="t">${esc(t.title)}</div>
      <div class="s">${esc(period || '')}${r.rows.length ? ' · ' + esc(t.due(m(r.dueCents))) : ''}</div></div>
      <a href="#" data-action="home-commissions" style="font-size:13px;color:var(--atlas);font-weight:500">${esc(t.open)}</a></div>`;
  if (!r.rows.length) return head + `<p class="tsl-empty">${esc(t.empty)}</p>`;
  const meta = (s) => `${esc(t.tickets(s.tickets))} · ${s.commissionCents == null ? esc(t.noRate) : `<b>${esc(t.commission(m(s.commissionCents)))}</b>`}`;
  const big = (c) => { const s = m(c); const i = s.lastIndexOf(' '); return i > 0 ? `${esc(s.slice(0, i))}<small>${esc(s.slice(i + 1))}</small>` : esc(s); };
  const podium = r.rows.slice(0, 3).map((s, i) => `<li class="tsl-p is-${i + 1}">
      <span class="tsl-rank">${i + 1}</span><span class="tsl-av" aria-hidden="true">${esc(initialsOf(s.name))}</span>
      <div class="tsl-name">${esc(s.name)}${i === 0 && r.rows.length > 1 ? `<span class="tsl-chip">${esc(t.top)}</span>` : ''}</div>
      <div class="tsl-net">${big(s.netCents)}</div><div class="tsl-meta">${meta(s)}</div>
      <div class="tsl-bar" aria-hidden="true"><i style="width:${Math.max(3, Math.round(Math.max(0, s.netCents) / top * 100))}%"></i></div></li>`).join('');
  const rest = r.rows.slice(3, 8).map((s, i) => `<li class="tsl-row"><span class="tsl-rank">${i + 4}</span><span class="tsl-av" aria-hidden="true">${esc(initialsOf(s.name))}</span>
      <span class="n">${esc(s.name)}</span><span class="v">${esc(m(s.netCents))}<span>${meta(s)}</span></span></li>`).join('');
  return head + `<ol class="tsl-podium">${podium}</ol>${rest ? `<ol class="tsl-rest">${rest}</ol>` : ''}
    ${r.loose.netCents > 0 ? `<div class="tsl-foot">${esc(t.loose(r.loose.tickets, m(r.loose.netCents)))}</div>` : ''}`;
}

/* ── Montage sur l'accueil ─────────────────────────────────────────────── */
function boot(win) {
  const doc = win.document;
  if (!doc || win.__kiwiTopSellers) return;
  win.__kiwiTopSellers = true;
  const style = doc.createElement('style');
  style.id = 'tsl-css'; style.textContent = CSS; doc.head.appendChild(style);
  let card = null, lastKey = '', inflight = null;
  const lang = () => { try { return win.KiwiI18n?.getLang?.() || 'fr'; } catch (_) { return 'fr'; } };
  const slug = () => { try { return String(win.KiwiLive?.merchant?.() || ''); } catch (_) { return ''; } };
  const money = (c) => { const n = (Number(c) || 0) / 100; try { const s = win.KiwiNumber?.amount?.(n); if (s) return s + ' MAD'; } catch (_) {} return n.toLocaleString(lang() === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 }) + ' MAD'; };
  function ensureCard() {
    if (card && card.isConnected) return card;
    const anchor = doc.querySelector('[data-oppo-band]');
    if (!anchor) return null;
    card = doc.createElement('div');
    card.className = 'block tsl-card';
    card.setAttribute('data-top-sellers', '');
    card.hidden = true;
    anchor.parentNode.insertBefore(card, anchor);
    return card;
  }
  function label(p) {
    const t = STR[lang()] || STR.fr;
    if (p.from !== p.to) return t.span(frDay(p.from), frDay(p.to));
    const today = win.KiwiDateRange?.selectedBusinessDay?.('aujourdhui');
    if (p.from === today) return t.today;
    if (today && p.from === win.KiwiDateRange?.selectedBusinessDay?.('hier')) return t.yesterday;
    return frDay(p.from);
  }
  function refresh(force) {
    if (!topSellersOn(doc, win.KiwiConfig, win.__kiwiRole)) { if (card) card.hidden = true; return; }
    const el = ensureCard(), merchant = slug(), p = win.KiwiDateRange && periodDays(win.KiwiDateRange);
    if (!el || !merchant || !p) { if (el) el.hidden = true; return; }
    const key = merchant + '|' + p.from + '|' + p.to + '|' + lang();
    if (!force && key === lastKey) return;
    lastKey = key;
    const mine = inflight = fetch('/api/commissions?merchant=' + encodeURIComponent(merchant) + '&from=' + p.from + '&to=' + p.to,
      { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((data) => {
        if (mine !== inflight) return;
        if (!data || !Array.isArray(data.sellers)) { el.hidden = true; lastKey = ''; return; }
        el.innerHTML = topSellersHtml(data, { lang: lang(), money, period: label(p) });
        el.hidden = false;
      })
      .catch(() => { if (mine === inflight) { el.hidden = true; lastKey = ''; } });
  }
  const H = win.Kiwi && win.Kiwi.handlers;
  if (H && !H['home-commissions']) {
    H['home-commissions'] = () => {
      try { if (H['nav-equipe']) H['nav-equipe'](); } catch (_) {}
      setTimeout(() => { try { if (H['kt-tab']) H['kt-tab'](null, 'commissions'); } catch (_) {} }, 60);
    };
  }
  try { win.KiwiDateRange?.subscribe?.(() => refresh(false)); } catch (_) {}
  win.addEventListener('kiwi-team-changed', () => refresh(true));
  doc.addEventListener('kiwi-config', () => refresh(true));   // changement de boutique
  [400, 2500, 8000].forEach((ms) => setTimeout(() => refresh(false), ms));
  /* Les ventes du jour bougent : relire toutes les deux minutes tant que l'onglet est visible. */
  setInterval(() => { if (doc.visibilityState !== 'hidden') refresh(true); }, 120000);
}

if (typeof window !== 'undefined' && window.document) {
  if (window.document.readyState === 'loading') window.document.addEventListener('DOMContentLoaded', () => boot(window), { once: true });
  else boot(window);
}
