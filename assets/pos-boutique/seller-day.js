/* Clôture de la caisse boutique · « Ventes par vendeur » : ce que chaque vendeur
 * a encaissé sur la journée d'activité, et sa commission au taux de sa fiche
 * Équipe. Lu sur /api/commissions (une journée, autorisée à la caisse appairée),
 * le même calcul que l'onglet Commissions de Paie & planning : un remboursement
 * reprend la commission de qui avait vendu, même si un autre l'a rendu.
 *
 * Seulement quand le commerce a l'option « Commissions vendeurs »
 * (features.sellerCommissions, kiwi-admin) ET que la caisse tourne en design
 * 2027 (data-skin-2027="till"). Sinon rien n'est dessiné ni demandé. */

export function sellerDayOn(doc = globalThis.document, cfg = globalThis.window?.KiwiConfig) {
  try {
    return cfg?.features?.sellerCommissions === true
      && doc?.documentElement?.getAttribute('data-skin-2027') === 'till';
  } catch (_) { return false; }
}

/* La caisse traduit par sa table (assets/caisse-lang.js) ; sans elle, le français. */
const tr = (s) => { try { return (globalThis.window?.KiwiCaisseLang || { tr: (x) => x }).tr(s); } catch (_) { return s; } };

export function sellerDayRows(data, fmtMAD) {
  const sellers = (data && Array.isArray(data.sellers) ? data.sellers : []).filter((s) => s.tickets > 0 || s.netCents !== 0);
  const rows = sellers.map((s) => [
    `${s.name} · ${s.tickets} ${tr(s.tickets > 1 ? 'tickets' : 'ticket')}`,
    `${fmtMAD(s.netCents / 100)} · ${s.commissionCents == null ? tr('commission à définir') : tr('commission') + ' ' + fmtMAD(s.commissionCents / 100)}`,
  ]);
  const u = data && data.unattributed;
  if (u && u.netCents) rows.push([tr('Sans vendeur identifié'), fmtMAD(u.netCents / 100)]);
  return rows;
}

/* host : l'élément vide posé dans la carte de clôture. */
export function mountSellerDay(host, { slug, day, esc, fmtMAD, fetchImpl } = {}) {
  if (!host || !sellerDayOn()) return Promise.resolve(false);
  const merchant = String((typeof slug === 'function' ? slug() : slug) || '');
  if (!merchant || !/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return Promise.resolve(false);
  const box = (inner) => `<div class="clo-drawer-box" data-bq-sellers><div class="clo-drawer-title">${esc(tr('Ventes par vendeur'))}</div>${inner}</div>`;
  host.innerHTML = box(`<div class="clo-drawer-line"><span>${esc(tr('Calcul en cours…'))}</span><span></span></div>`);
  const get = fetchImpl || globalThis.fetch;
  return Promise.resolve()
    .then(() => get('/api/commissions?merchant=' + encodeURIComponent(merchant) + '&from=' + day + '&to=' + day,
      { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }))
    .then((r) => (r && r.ok ? r.json() : null))
    .then((data) => {
      if (!data || !Array.isArray(data.sellers)) { host.innerHTML = ''; return false; }
      const rows = sellerDayRows(data, fmtMAD);
      host.innerHTML = box(rows.length
        ? rows.map((r) => `<div class="clo-drawer-line"><span>${esc(r[0])}</span><span class="mono">${esc(r[1])}</span></div>`).join('')
        : `<div class="clo-drawer-line"><span>${esc(tr('Aucune vente attribuée aujourd’hui.'))}</span><span></span></div>`);
      return true;
    })
    .catch(() => { host.innerHTML = ''; return false; });
}
