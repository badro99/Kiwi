/* Paie & planning · onglet « Commissions » : les ventes et la commission de
 * chaque vendeur sur la période affichée, lues sur /api/commissions (le calcul
 * vit sur le serveur, functions/api/_commissions.js, pour que la caisse, le
 * tableau de bord et un second appareil disent le même chiffre).
 *
 * Visible seulement quand le commerce a l'option « Commissions vendeurs »
 * (features.sellerCommissions, kiwi-admin) ET que le tableau de bord tourne sur
 * le kit 2027 (data-skin-2027="dashboard"). Sinon l'onglet n'existe pas. */

export function sellerCommissionsOn(doc = globalThis.document, cfg = globalThis.window?.KiwiConfig) {
  try {
    return cfg?.features?.sellerCommissions === true
      && doc?.documentElement?.getAttribute('data-skin-2027') === 'dashboard';
  } catch (_) { return false; }
}

const STRINGS = {
  fr: {
    tab: 'Commissions', due: 'Commissions dues', dueSub: (a, b) => `du ${a} au ${b}`,
    net: 'Ventes attribuées', netSub: 'encaissé moins remboursé',
    none: 'Non attribuées', noneSub: 'ventes sans vendeur identifié',
    seller: 'Vendeur', tickets: 'Tickets', sales: 'Encaissé', refunds: 'Remboursé', netCol: 'Net', rate: 'Taux', commission: 'Commission',
    unset: 'à définir', notTeam: 'hors équipe', loading: 'Calcul des commissions…',
    error: 'Les commissions ne se chargent pas. Réessayez dans un instant.',
    empty: 'Aucune vente attribuée sur cette période. Une vente est attribuée à qui a saisi son code sur la caisse.',
    rateHint: 'Le taux se saisit sur la fiche Équipe de chaque vendeur.',
  },
  en: {
    tab: 'Commissions', due: 'Commissions due', dueSub: (a, b) => `${a} to ${b}`,
    net: 'Attributed sales', netSub: 'taken minus refunded',
    none: 'Unattributed', noneSub: 'sales with no known seller',
    seller: 'Seller', tickets: 'Tickets', sales: 'Taken', refunds: 'Refunded', netCol: 'Net', rate: 'Rate', commission: 'Commission',
    unset: 'not set', notTeam: 'not in team', loading: 'Working out commissions…',
    error: 'Commissions did not load. Try again in a moment.',
    empty: 'No attributed sales in this period. A sale goes to whoever entered their code on the till.',
    rateHint: 'Set each seller’s rate on their Team profile.',
  },
  ar: {
    tab: 'العمولات', due: 'العمولات المستحقة', dueSub: (a, b) => `من ${a} إلى ${b}`,
    net: 'مبيعات منسوبة', netSub: 'المحصَّل ناقص المسترجَع',
    none: 'غير منسوبة', noneSub: 'مبيعات بلا بائع معروف',
    seller: 'البائع', tickets: 'التذاكر', sales: 'المحصَّل', refunds: 'المسترجَع', netCol: 'الصافي', rate: 'النسبة', commission: 'العمولة',
    unset: 'غير محدَّدة', notTeam: 'خارج الفريق', loading: 'جارٍ حساب العمولات…',
    error: 'تعذّر تحميل العمولات. حاول بعد لحظة.',
    empty: 'لا مبيعات منسوبة في هذه الفترة. تُنسب البيعة لمن أدخل رمزه في الصندوق.',
    rateHint: 'تُحدَّد نسبة كل بائع في بطاقته ضمن الفريق.',
  },
};

export function createSellerCommissions({ esc, fmtPay, trLang, slug, render, fetchImpl }) {
  const cache = new Map();   // clé période → { state: 'loading'|'ok'|'error', data }
  const T = () => STRINGS[trLang()] || STRINGS.fr;
  const money = (c) => esc(fmtPay((Number(c) || 0) / 100)) + ' MAD';

  function load(key, from, to) {
    const merchant = String((slug && slug()) || '');
    if (!merchant) { cache.set(key, { state: 'error' }); return; }
    cache.set(key, { state: 'loading' });
    const get = fetchImpl || globalThis.fetch;
    Promise.resolve()
      .then(() => get('/api/commissions?merchant=' + encodeURIComponent(merchant) + '&from=' + from + '&to=' + to,
        { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }))
      .then((r) => (r && r.ok ? r.json() : null))
      .then((data) => { cache.set(key, data && Array.isArray(data.sellers) ? { state: 'ok', data } : { state: 'error' }); })
      .catch(() => { cache.set(key, { state: 'error' }); })
      .then(() => { try { render(); } catch (_) {} });
  }

  function pane(period) {
    const t = T();
    const from = period.days[0], to = period.days[period.days.length - 1];
    const key = from + '|' + to;
    if (!cache.has(key)) load(key, from, to);
    const entry = cache.get(key) || { state: 'loading' };
    if (entry.state !== 'ok') {
      return `<div class="eq-section kt-com-state" data-kt-commissions="${entry.state}" role="status">${esc(entry.state === 'error' ? t.error : t.loading)}</div>`;
    }
    const d = entry.data;
    const tile = (label, value, sub) => `<div class="eq-stat"><div class="eq-stat-l"><span>${esc(label)}</span></div><div class="eq-stat-v">${value}</div><div class="eq-stat-sub">${esc(sub)}</div></div>`;
    const tiles = `<div class="eq-stats">
        ${tile(t.due, d.totals ? money(d.totals.commissionCents) : '·', t.dueSub(period.startFr, period.endFr))}
        ${tile(t.net, d.totals ? money(d.totals.netCents) : '·', t.netSub)}
        ${tile(t.none, d.unattributed ? money(d.unattributed.netCents) : '·', t.noneSub)}
      </div>`;
    if (!d.sellers.length) return `<div data-kt-commissions="ok">${tiles}<div class="eq-section kt-com-state">${esc(t.empty)}</div></div>`;
    const pct = (r) => (r == null ? `<span class="kt-com-unset">${esc(t.unset)}</span>` : esc(String(Math.round(r * 100) / 100)) + ' %');
    const rows = d.sellers.map((s) => `<tr data-kt-seller="${esc(s.key)}">
        <td><b>${esc(s.name)}</b>${s.inTeam ? '' : ` <span class="kt-com-unset">· ${esc(t.notTeam)}</span>`}</td>
        <td class="kt-com-n">${esc(String(s.tickets))}</td>
        <td class="kt-com-n">${money(s.salesCents)}</td>
        <td class="kt-com-n">${s.refundCents ? '− ' + money(s.refundCents) : '·'}</td>
        <td class="kt-com-n">${money(s.netCents)}</td>
        <td class="kt-com-n">${pct(s.rate)}</td>
        <td class="kt-com-n"><b>${s.commissionCents == null ? `<span class="kt-com-unset">${esc(t.unset)}</span>` : money(s.commissionCents)}</b></td>
      </tr>`).join('');
    return `<div data-kt-commissions="ok">${tiles}
      <div class="kt-h-tablewrap"><table class="kt-com-table">
        <thead><tr><th>${esc(t.seller)}</th><th>${esc(t.tickets)}</th><th>${esc(t.sales)}</th><th>${esc(t.refunds)}</th><th>${esc(t.netCol)}</th><th>${esc(t.rate)}</th><th>${esc(t.commission)}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      ${d.totals && d.totals.unrated ? `<p class="kt-com-hint">${esc(t.rateHint)}</p>` : ''}
    </div>`;
  }

  return Object.freeze({ pane, tabLabel: () => T().tab, forget: () => cache.clear() });
}
