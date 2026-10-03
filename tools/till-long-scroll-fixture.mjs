// Test-only data and page assembly. No runtime QA switch, production account,
// pairing record, customer, payment, or catalogue mutation is involved.
export const MERCHANT = 'synthetic-till-long-scroll';
export const ROW_COUNT = 60;
export function longListData(now = Date.now()) {
  const number = n => String(n).padStart(3, '0');
  return {
    sales: { v: 1, m: MERCHANT, s: Array.from({ length: ROW_COUNT }, (_, i) => ({
      id: 'SCROLL-SALE-' + number(i + 1), ref: 'SCROLL-SALE-' + number(i + 1),
      ts: now - (i + 1) * 60000, at: new Date(now - (i + 1) * 60000).toISOString(),
      amount: 20, total: 20,
      lines: [{ name: 'SYNTHETIC SCROLL ARTICLE ' + number(i + 1), qty: 1, unit: 20, total: 20,
        cat: 'SYNTHETIC SCROLL CATEGORY ' + number(i % 12 + 1) }],
    })) },
    balances: Array.from({ length: ROW_COUNT }, (_, i) => ({
      id: 'SCROLL-BALANCE-' + number(i + 1), ticketRef: 'SCROLL-BALANCE-' + number(i + 1),
      customerId: 'SCROLL-CUSTOMER-' + number(i + 1),
      totalCents: 20000, paidCents: 5000, pendingCents: 0, receipts: [], createdTs: now - i * 60000,
    })),
  };
}

export function longListPage(vertical) {
  if (!['boutique', 'maison'].includes(vertical)) throw new Error('Unknown synthetic till vertical');
  const scripts = ['caisse-dna', 'caisse-lang', 'barcode', 'color-palette', 'inventory-ledger',
    'maison-stock-movements', 'procurement', 'venue-store', 'discount-policy', 'retail-balances',
    'clients-store', 'clients-book', 'boutique-catalog', 'promos', 'pos-inventory-count',
    'sold-insights', 'pos-' + vertical];
  const styles = ['tokens', 'kiwi-select', 'caisse-skin', 'caisse-dna', 'pos-' + vertical,
    'retail-balances', 'retail-scan', 'pos-mobile'];
  return `<!doctype html><html lang="fr"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Kiwi #0159 · synthetic ${vertical} long lists</title>
    <link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/caisse-inline.css">
    ${styles.slice(1).map(name => '<link rel="stylesheet" href="/assets/' + name + '.css">').join('')}
    <link rel="stylesheet" href="/app/src/native-runtime.css">
    <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--paper);font-family:var(--sans)}button,input{font:inherit}button{border:0}.vx-screen{display:flex}</style>
    <script>
      window.KiwiEnv={isReal:()=>false,demosAllowed:true};
      window.KiwiConfig={features:{caisseInventoryAdmin:true,depotvente:true,caisseInventoryValue:false}};
      window.KiwiPosDispatch={register:spec=>window.__longScrollSpec=spec,lock:()=>{}};
      localStorage.setItem('kiwiLiveMerchant',${JSON.stringify(MERCHANT)});
    </script>
    ${scripts.map(name => '<script src="/assets/' + name + '.js"></script>').join('')}
    <script src="/assets/kiwi-select.js" defer></script>
  </head><body class="is-pos is-pos-${vertical}"><div id="toast-stack"></div><div class="vx-screen is-on" id="pos-${vertical}"></div>
    <script>window.__longScrollSpec.mount(document.getElementById('pos-${vertical}'));window.KiwiCaisseDna.enhance(document.getElementById('pos-${vertical}'),'${vertical}');</script>
    <script src="/assets/pos-mobile.js"></script>
  </body></html>`;
}
