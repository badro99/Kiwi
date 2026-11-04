export function paint(err, lastError, context) {
  const code = /^(stock-pending|stock-dead|stock-short)$/.test(lastError) ? lastError
    : /^Stock Shopify à synchroniser/.test(lastError) ? 'stock-pending'
    : /^Stock Shopify abandonné/.test(lastError) ? 'stock-dead'
    : /^Survente Shopify/.test(lastError) ? 'stock-short' : 'error';
  const i18n = window.KiwiI18n, lang = i18n?.getLang?.() || localStorage.getItem('kiwiLang') || 'fr';
  const fr = { 'stock-pending': 'Stock Shopify à synchroniser.', 'stock-dead': 'Stock Shopify à traiter à la main après plusieurs essais.', 'stock-short': 'Survente Shopify : stock Kiwi insuffisant.', error: 'Vérifiez la connexion Shopify.' };
  const tr = (key, fallback) => i18n?.T?.[lang]?.['shopify.health.' + key] || fallback;
  err.textContent = tr(code, fr[code]);
  if (context?.orderRef) err.textContent += ' · ' + tr('order', 'Commande {r}').replace('{r}', context.orderRef);
}
