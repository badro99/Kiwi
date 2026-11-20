/* Caisse Maison · Clientes : filtres et tri du carnet (20 nov. 2026).
 *
 * La page listait toutes les fiches. Les règles vivent dans
 * ../client-filters.js (les mêmes que le tableau de bord) ; ici, l'état de
 * la page et l'argent : les notes ouvertes viennent du journal de la caisse
 * (KiwiRetailBalances, qui survit hors ligne), les avoirs de la caisse elle-même. */
import { filterClients, clientCounts, clientFilterBar, moneyMaps, loadClientMoney, ensureClientFilterStyles, filterLabel } from '../client-filters.js?v=1';

const view = { filter: 'all', sort: 'recent', list: [], ctx: moneyMaps({ loaded: false }), merchant: null, at: 0, loading: false };
const lang = () => (globalThis.window?.KiwiCaisseLang?.get?.() || globalThis.document?.documentElement?.lang || 'fr').slice(0, 2);

/* Les soldes dus se relisent au plus toutes les 60 s : la page se redessine à
   chaque lettre tapée, le réseau non. */
function refreshMoney(merchant, rerender) {
  if (!merchant || view.loading || (view.merchant === merchant && Date.now() - view.at < 60000)) return;
  view.loading = true;
  const R = globalThis.window?.KiwiRetailBalances;
  loadClientMoney(merchant, { balancesFn: R && R.list ? () => R.list(merchant) : null }).then((money) => {
    view.loading = false; view.merchant = merchant; view.at = Date.now();
    view.ctx = moneyMaps({ balances: [...money.owes].map(([customerId, balanceCents]) => ({ customerId, balanceCents })), credits: view.avoirs || [], loaded: money.loaded });
    if (rerender) rerender();
  }, () => { view.loading = false; });
}

export function mzClientsView(hits, { merchant, avoirs, rerender } = {}) {
  ensureClientFilterStyles();
  view.avoirs = avoirs || [];
  /* Les avoirs de la caisse sont déjà là : ils comptent tout de suite. */
  view.ctx = moneyMaps({ balances: [...view.ctx.owes].map(([customerId, balanceCents]) => ({ customerId, balanceCents })), credits: view.avoirs, loaded: view.ctx.loaded });
  refreshMoney(merchant, rerender);
  view.list = hits || [];
  return filterClients(view.list, view, view.ctx);
}

export function mzClientsBar() {
  return `<div class="mz-clv-filters">${clientFilterBar({ filter: view.filter, sort: view.sort, counts: clientCounts(view.list, view.ctx), lang: lang() })}</div>`;
}

/* Seul le solde dû s'ajoute à la carte : l'avoir y a déjà sa pastille. */
export function mzClientsMoney(c, fmtMAD) {
  const owe = c && view.ctx.owes.get(String(c.id));
  return owe ? `<span class="mz-mini kcf-badge owes">${filterLabel('owesBadge', lang())} ${fmtMAD(owe / 100)}</span>` : '';
}

export function mzClientsEmpty(q, esc) {
  return q ? `Aucune fiche pour « ${esc(q)} »` : 'Aucune fiche dans ce filtre';
}

/* true quand l'événement appartenait aux filtres (la page se redessine). */
export function mzClientsEvent(e, rerender) {
  const chip = e.type === 'click' && e.target.closest && e.target.closest('[data-kcf-filter]');
  if (chip) { view.filter = chip.dataset.kcfFilter; rerender(); return true; }
  const sort = e.type === 'change' && e.target.matches && e.target.matches('[data-kcf-sort]');
  if (sort) { view.sort = e.target.value; rerender(); return true; }
  return e.type === 'change';
}
