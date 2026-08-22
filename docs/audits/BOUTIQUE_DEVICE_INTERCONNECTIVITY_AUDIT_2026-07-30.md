# Boutique device interconnectivity audit — 30 July 2026

Scope: dashboard, paired boutique caisse, secondary caisse/browser, and the shared server documents used by live stores.

## Verified paths

- Inventory and stock: venue-scoped, server-backed through `/api/catalog`, with revision-conflict handling and stock-movement merging.
- Promotions: dashboard and caisse use the same venue key and pricing engine. Fixed in this audit: the client now writes the server-supported `promotions` document instead of the rejected `promos` name.
- Sales: caisse queues offline sales, retries them, deduplicates receipts, and the dashboard feed isolates each merchant.
- Client book and loyalty: server-backed and venue-scoped through `/api/clients`.
- Team and employee PINs: venue-scoped server document; the caisse reads the selected store's PINs.
- Receipt and business identity: server-backed venue documents with live subscription on the caisse.
- Floor plan, menu, opening hours and daily reports: shared server sources with existing regression coverage.
- Re-pairing: tenant purge removes the previous store's local journal, catalogue, customers and settings before binding the next store.

## Remaining gaps found

### High — store credit (`avoirs`) is device-local

`assets/pos-boutique.js` stores vouchers in `kiwi:bqAvoirs`. They survive refresh and are purged when a till changes merchant, but they are not copied to another caisse. A voucher issued on till A cannot be redeemed on till B until a shared, conflict-safe voucher ledger is added.

### High — return lookup is limited to the issuing till

The boutique keeps seven days of ticket detail in the local `kiwi:bqDay` journal. The dashboard receives sales, but another caisse does not rebuild its return journal from the server feed. A return should therefore be processed on the original till for now.

### Medium — remote pairing status is not reflected in the dashboard

The pairing itself is server-backed and works across devices, but the dashboard's “connected” badge reads the same-browser `kiwiPairings` map. A remotely paired tablet can be working while the dashboard still looks pending.

### Expected local-only state

Open shift, cash float, attached printer, and the currently signed-in cashier intentionally stay on their physical terminal. Synchronizing those would let one till overwrite another till's drawer state.

## Regression checks run

- Promotion pricing and merge rules: 33 checks passed.
- Live sales queue, retry, quarantine and tenant behavior: 12 checks passed.
- Menu/store isolation: 16 checks passed.
- Floor-plan synchronization: 28 checks passed.

The two high gaps require event-ledger/API work rather than copying localStorage documents; they should not be patched with last-write-wins documents because that can recreate spent credit or lose a return.
