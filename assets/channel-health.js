export function paint(err, lastError, context) {
  const code = /^(stock-pending|stock-dead|stock-short|unsupported-currency)$/.test(lastError) ? lastError
    : /^Stock Shopify à synchroniser/.test(lastError) ? 'stock-pending'
    : /^Stock Shopify abandonné/.test(lastError) ? 'stock-dead'
    : /^Survente Shopify/.test(lastError) ? 'stock-short' : 'error';
  const i18n = window.KiwiI18n, lang = i18n?.getLang?.() || localStorage.getItem('kiwiLang') || 'fr';
  const fr = { 'stock-pending': 'Stock Shopify à synchroniser.', 'stock-dead': 'Stock Shopify à traiter à la main après plusieurs essais.', 'stock-short': 'Survente Shopify : stock Kiwi insuffisant.', 'unsupported-currency': 'Commande Shopify dans une devise non prise en charge.', error: 'Vérifiez la connexion Shopify.' };
  const tr = (key, fallback) => i18n?.T?.[lang]?.['shopify.health.' + key] || fallback;
  err.textContent = tr(code, fr[code]);
  if (context?.orderRef) err.textContent += ' · ' + tr('order', 'Commande {r}').replace('{r}', context.orderRef);
}

export function paintIssues(root, issues, connection) {
  const all = (issues || []).concat(connection?.lastError ? [{ code: connection.lastError, ...connection.lastErrorContext }] : []);
  const seen = new Set();
  for (const issue of all) {
    const key = JSON.stringify([issue.code, issue.orderRef]);
    if (seen.has(key)) continue;
    seen.add(key);
    const err = document.createElement('div');
    err.className = 'chl-once';
    paint(err, issue.code, issue);
    root.appendChild(err);
  }
}
